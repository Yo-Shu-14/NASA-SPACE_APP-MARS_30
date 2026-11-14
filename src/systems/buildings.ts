import { getFacilityStorageBonus } from '../data/balance';
import { BUILDING_DEFINITIONS, BUILDING_LIST } from '../data/buildings';
import { RESOURCE_CONFIGS } from '../data/resources';
import { BuildingId, BuildingState, BuildingStatus } from '../types/building';
import { DifficultyLevel, GameState } from '../types/game';
import { ResourceAmounts, ResourceType } from '../types/resource';

export function createInitialBuildings(): Record<BuildingId, BuildingState> {
  const result = {} as Record<BuildingId, BuildingState>;
  for (const def of BUILDING_LIST) {
    result[def.id] = {
      id: def.id,
      status: def.initialStatus,
      condition: def.initialCondition,
      dustLevel: def.id === 'solar_panels' ? 55 : 0,
      frostLevel: 0,
      malfunctionDaysRemaining: 0,
      restoredOnce: def.initialStatus === 'operational',
      timesMaintained: 0,
      lastMaintainedDay: 1,
      hasVisibleDamage: def.initialStatus !== 'operational',
    };
  }
  return result;
}

export function getStatusFromCondition(
  condition: number,
  currentlyInactive: boolean
): BuildingStatus {
  if (currentlyInactive && condition < 50) return 'inactive';
  if (condition <= 15) return 'inactive';
  if (condition < 65) return 'damaged';
  return 'operational';
}

export function getBuildingEffectiveness(building: BuildingState): number {
  if (building.status === 'inactive' || building.status === 'maintenance') {
    return 0;
  }
  if (
    building.id === 'solar_panels' &&
    (building.malfunctionDaysRemaining ?? 0) > 0
  ) {
    if (building.malfunctionKind === 'disrupted') {
      return 0.45; // Reduced output until cleaned or repaired (Global Dust Storm)
    }
    if (building.malfunctionKind === 'electrical') {
      return 0.6; // Partial voltage drop until repaired (Solar Storm)
    }
  }
  let factor =
    building.id === 'solar_panels'
      ? Math.max(0.45, building.condition / 100)
      : Math.max(0.35, building.condition / 100);
  if (building.id === 'solar_panels') {
    const dustPenalty = 1 - (building.dustLevel / 100) * 0.38;
    factor *= dustPenalty;
  }
  const frost = building.frostLevel ?? 0;
  if (frost > 0) {
    factor *= 1 - (frost / 100) * (building.id === 'solar_panels' ? 0.4 : 0.5);
  }
  if ((building.malfunctionDaysRemaining ?? 0) > 0) {
    factor *= building.malfunctionKind === 'frost' ? 0.65 : 0.55;
  }
  return Number(Math.max(building.id === 'solar_panels' ? 0.25 : 0.15, Math.min(1, factor)).toFixed(2));
}

export function applyBuildingConditionChange(
  building: BuildingState,
  delta: number,
  forceOperational = false,
  damageCause?: BuildingState['damageCause'],
  damageSeverity?: BuildingState['damageSeverity']
): BuildingState {
  const nextCondition = Math.max(0, Math.min(100, Math.round(building.condition + delta)));
  let nextStatus: BuildingStatus;

  if (forceOperational && nextCondition >= 50) {
    nextStatus = nextCondition >= 65 ? 'operational' : 'damaged';
  } else {
    nextStatus = getStatusFromCondition(nextCondition, building.status === 'inactive');
  }

  const isSevereEventDamage =
    delta < 0 && (damageSeverity === 'major' || damageSeverity === 'super_major');

  const clearedByRepair = delta > 0 && (forceOperational || nextCondition >= 92);
  const nextFrost = clearedByRepair ? 0 : building.frostLevel ?? 0;
  const nextMalfunctionDays = clearedByRepair ? 0 : building.malfunctionDaysRemaining ?? 0;
  const nextMalfunctionKind = clearedByRepair ? undefined : building.malfunctionKind;
  const hasActiveDisruption = nextFrost > 0 || nextMalfunctionDays > 0;

  const hasVisibleDamage =
    delta < 0
      ? nextCondition < 92 || isSevereEventDamage || hasActiveDisruption || Boolean(building.hasVisibleDamage)
      : nextStatus !== 'operational' || hasActiveDisruption;

  const nextCause: BuildingState['damageCause'] = !hasVisibleDamage
    ? undefined
    : delta < 0
    ? damageCause ?? building.damageCause
    : building.damageCause;

  const nextSeverity: BuildingState['damageSeverity'] = !hasVisibleDamage
    ? undefined
    : delta < 0
    ? damageSeverity ?? building.damageSeverity
    : building.damageSeverity;

  return {
    ...building,
    condition: nextCondition,
    status: nextStatus,
    frostLevel: nextFrost,
    malfunctionDaysRemaining: nextMalfunctionDays,
    malfunctionKind: nextMalfunctionKind,
    restoredOnce: building.restoredOnce || nextStatus === 'operational',
    hasVisibleDamage,
    damageCause: nextCause,
    damageSeverity: nextSeverity,
  };
}

export function calculateResourceCapacities(
  buildings: Record<BuildingId, BuildingState>,
  difficulty: DifficultyLevel = 'medium'
): ResourceAmounts {
  const capacities: ResourceAmounts = {
    oxygen: RESOURCE_CONFIGS.oxygen.baseCapacity,
    water: RESOURCE_CONFIGS.water.baseCapacity,
    food: RESOURCE_CONFIGS.food.baseCapacity,
    energy: RESOURCE_CONFIGS.energy.baseCapacity,
  };

  for (const def of BUILDING_LIST) {
    const bonusMap = getFacilityStorageBonus(def, difficulty);
    const state = buildings[def.id];
    if (!state || state.status === 'inactive') continue;

    let effectiveness =
      state.status === 'operational' ? 1 : Math.max(0.5, state.condition / 100);
    const frost = state.frostLevel ?? 0;
    if (frost > 0) {
      effectiveness *= 1 - (frost / 100) * 0.45;
    }
    if ((state.malfunctionDaysRemaining ?? 0) > 0) {
      effectiveness *= state.malfunctionKind === 'frost' ? 0.7 : 0.6;
    }

    for (const key of Object.keys(bonusMap) as ResourceType[]) {
      const bonus = bonusMap[key] ?? 0;
      if (bonus <= 0) continue;
      capacities[key] += Math.round(bonus * Math.max(0.25, effectiveness));
    }
  }

  return capacities;
}

export function isBuildingOperational(
  buildings: Record<BuildingId, BuildingState>,
  id: BuildingId
): boolean {
  const b = buildings[id];
  return Boolean(b && (b.status === 'operational' || b.status === 'damaged'));
}

export function getOperationalBuildingCount(
  buildings: Record<BuildingId, BuildingState>
): number {
  return Object.values(buildings).filter((b) => b.status === 'operational').length;
}

export function getBuildingDefinition(id: BuildingId) {
  return BUILDING_DEFINITIONS[id];
}

export interface BuildingUnlockStatus {
  unlocked: boolean;
  reason?: string;
  shortReason?: string;
}

export function getBuildingUnlockStatus(
  id: BuildingId,
  state: Pick<GameState, 'day' | 'buildings'>
): BuildingUnlockStatus {
  const def = BUILDING_DEFINITIONS[id];
  if (!def || def.isCritical || state.day >= 2 || state.buildings[id]?.restoredOnce) {
    return { unlocked: true };
  }

  const solarReady = Boolean(state.buildings.solar_panels?.restoredOnce);
  const oxygenReady = Boolean(state.buildings.oxygen_generator?.restoredOnce);
  const waterReady = Boolean(state.buildings.water_recycling?.restoredOnce);
  const greenhouseReady = Boolean(state.buildings.greenhouse?.restoredOnce);
  const shelterReady = Boolean(state.buildings.radiation_shelter?.restoredOnce);

  switch (id) {
    case 'energy_storage':
      if (!solarReady) {
        return {
          unlocked: false,
          shortReason: 'Restore Solar',
          reason: 'Sol 1 Progression: Restore Solar Panels first to unlock Battery Bank.',
        };
      }
      return { unlocked: true };
    case 'oxygen_storage':
      if (!oxygenReady) {
        return {
          unlocked: false,
          shortReason: 'Restore O2',
          reason: 'Sol 1 Progression: Restore Oxygen Generation System first to unlock Oxygen Tanks.',
        };
      }
      return { unlocked: true };
    case 'water_storage':
      if (!waterReady) {
        return {
          unlocked: false,
          shortReason: 'Restore Water',
          reason: 'Sol 1 Progression: Restore Water Recovery System first to unlock Water Tanks.',
        };
      }
      return { unlocked: true };
    case 'food_storage':
      if (!greenhouseReady) {
        return {
          unlocked: false,
          shortReason: 'Restore Greenhouse',
          reason: 'Sol 1 Progression: Restore Greenhouse first to unlock Food Vault.',
        };
      }
      return { unlocked: true };
    case 'maintenance_facility': {
      const restoredCoreSupport =
        (oxygenReady ? 1 : 0) +
        (waterReady ? 1 : 0) +
        (greenhouseReady ? 1 : 0) +
        (shelterReady ? 1 : 0);
      if (!solarReady || restoredCoreSupport < 1) {
        return {
          unlocked: false,
          shortReason: 'Solar + 1 Core',
          reason:
            'Sol 1 Progression: Restore Solar Panels and at least 1 core life-support system to unlock Workshop.',
        };
      }
      return { unlocked: true };
    }
    default:
      return { unlocked: true };
  }
}
