import {
  DISASTER_DAMAGE_MULTIPLIER,
  DISASTER_RESOURCE_LOSS_MULTIPLIER,
  DISASTER_WARNING_DURATION_SEC,
  MINOR_EVENT_COUNTS_BY_DIFFICULTY,
  RADIATION_DAMAGE_OUTSIDE_SHELTER,
} from '../data/balance';
import { BUILDING_DEFINITIONS } from '../data/buildings';
import { EVENT_DEFINITIONS, MINOR_EVENT_IDS } from '../data/events';
import { computeWorkClockMetrics } from '../data/mission';
import { gridManager, WORLD_HEIGHT, WORLD_WIDTH } from '../game/grid/GridManager';
import { BuildingId, BuildingState } from '../types/building';
import {
  ActiveEvent,
  BuildingEventImpact,
  EventDefinition,
} from '../types/event';
import {
  CrewState,
  DifficultyLevel,
  GameState,
  LingeringHazard,
  MissionModifiers,
  TerrainScar,
} from '../types/game';
import { ResourceAmounts, ResourceType } from '../types/resource';
import { applyBuildingConditionChange } from './buildings';
import { clampResourcesToCapacity, deductResources } from './resources';

export type { BuildingEventImpact };

function createSeededRng(seed: number): () => number {
  let t = (seed >>> 0) || 1234567;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pickRandomDaysInRange(
  minDay: number,
  maxDay: number,
  count: number,
  rng: () => number
): number[] {
  if (count <= 0) return [];
  const days: number[] = [];
  for (let d = minDay; d <= maxDay; d++) {
    days.push(d);
  }
  for (let i = days.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [days[i], days[j]] = [days[j], days[i]];
  }

  const picked: number[] = [];
  for (const d of days) {
    if (picked.length >= count) break;
    if (picked.every((existing) => Math.abs(existing - d) >= 2)) {
      picked.push(d);
    }
  }
  for (const d of days) {
    if (picked.length >= count) break;
    if (!picked.includes(d)) {
      picked.push(d);
    }
  }
  return picked.sort((a, b) => a - b);
}

export function generateMissionEventSchedule(
  seed: number,
  difficulty: DifficultyLevel = 'medium'
): Record<number, string> {
  const rng = createSeededRng(seed);
  const counts = MINOR_EVENT_COUNTS_BY_DIFFICULTY[difficulty];

  const shufflePool = () => {
    const pool = [...MINOR_EVENT_IDS];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  };

  const minorSequence: string[] = [...shufflePool(), ...shufflePool()];

  const phase2Days = pickRandomDaysInRange(4, 8, counts.phase2, rng);
  const phase3Days = pickRandomDaysInRange(11, 19, counts.phase3, rng);
  const phase4Days = pickRandomDaysInRange(21, 28, counts.phase4, rng);
  const allMinorDays = [...phase2Days, ...phase3Days, ...phase4Days];

  const schedule: Record<number, string> = {};
  allMinorDays.forEach((day, idx) => {
    schedule[day] = minorSequence[idx % minorSequence.length];
  });

  // Fixed major mission events
  schedule[9] = 'solar_storm_response';
  schedule[20] = 'solar_energetic_particles';
  schedule[29] = 'global_dust_storm';

  return schedule;
}

export function createActiveEventForDay(
  day: number,
  schedule: Record<number, string>,
  difficulty: DifficultyLevel = 'medium'
): ActiveEvent | null {
  const eventId = schedule[day];
  if (!eventId) return null;
  const def = EVENT_DEFINITIONS[eventId];
  if (!def) return null;

  const warnings = DISASTER_WARNING_DURATION_SEC[difficulty];
  const animationDuration =
    def.severity === 'major' || def.severity === 'super_major'
      ? warnings.major
      : warnings.minor;

  return {
    definition: def,
    dayTriggered: day,
    resolved: false,
    shelterUsed: false,
    mitigationSummary: '',
    animationDuration,
    animationRemaining: animationDuration,
    initialDamageApplied: false,
    radiationPenaltyApplied: false,
  };
}

const TILE_PX = 72;

export function createScarsForEvent(
  def: EventDefinition,
  day: number
): TerrainScar[] {
  let kind: TerrainScar['kind'] | null = null;
  if (def.phenomenon === 'marsquake') {
    kind = 'quake_fissure';
  } else if (def.phenomenon === 'solar_storm_response') {
    kind = 'solar_scorch';
  } else if (def.phenomenon === 'solar_energetic_particles') {
    kind = 'sep_crater';
  } else if (def.phenomenon === 'global_dust_storm' || def.phenomenon === 'dust_devils') {
    kind = 'dust_drift';
  }
  if (!kind) return [];

  const targets = def.targetBuildings ?? ['main_habitat'];
  const scars: TerrainScar[] = [];
  const offsets: Array<{ dx: number; dy: number }> = [
    { dx: -1.1, dy: 1.15 },
    { dx: 1.15, dy: -0.6 },
    { dx: 0.4, dy: 1.2 },
    { dx: -1.15, dy: -0.7 },
    { dx: 1.1, dy: 1.05 },
  ];

  targets.forEach((bId, idx) => {
    const bDef = BUILDING_DEFINITIONS[bId];
    if (!bDef) return;
    const cx = (bDef.gridX + bDef.widthTiles * 0.5) * TILE_PX;
    const cy = (bDef.gridY + bDef.heightTiles * 0.5) * TILE_PX;
    const halfW = (bDef.widthTiles * TILE_PX) * 0.5;
    const halfH = (bDef.heightTiles * TILE_PX) * 0.5;
    const off = offsets[(idx + day) % offsets.length];
    const rawX = Math.max(40, Math.min(WORLD_WIDTH - 40, Math.round(cx + off.dx * (halfW + 18))));
    const rawY = Math.max(40, Math.min(WORLD_HEIGHT - 40, Math.round(cy + off.dy * (halfH + 18))));
    const safePt = gridManager.pushOutOfBuildings(rawX, rawY, 22);

    scars.push({
      id: `scar_${day}_${def.id}_${bId}`,
      kind,
      x: Math.round(safePt.x),
      y: Math.round(safePt.y),
      size: def.severity === 'super_major' ? 34 : def.severity === 'major' ? 27 : 22,
      eventId: def.id,
      day,
      severity: def.severity,
    });
  });

  if (def.severity === 'major' || def.severity === 'super_major') {
    const spotA = gridManager.pushOutOfBuildings(
      Math.round(WORLD_WIDTH * 0.34) + ((day * 37) % 100),
      Math.round(WORLD_HEIGHT * 0.34) + ((day * 23) % 70),
      24
    );
    const spotB = gridManager.pushOutOfBuildings(
      Math.round(WORLD_WIDTH * 0.62) + ((day * 31) % 110),
      Math.round(WORLD_HEIGHT * 0.68) + ((day * 29) % 65),
      24
    );
    scars.push({
      id: `scar_${day}_${def.id}_courtyard_a`,
      kind,
      x: Math.round(spotA.x),
      y: Math.round(spotA.y),
      size: def.severity === 'super_major' ? 32 : 27,
      eventId: def.id,
      day,
      severity: def.severity,
    });
    scars.push({
      id: `scar_${day}_${def.id}_courtyard_b`,
      kind,
      x: Math.round(spotB.x),
      y: Math.round(spotB.y),
      size: def.severity === 'super_major' ? 32 : 27,
      eventId: def.id,
      day,
      severity: def.severity,
    });
  }

  return scars;
}

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function isCrewProtectedByShelter(
  crew: CrewState,
  buildings: Record<BuildingId, BuildingState>
): boolean {
  const shelter = buildings.radiation_shelter;
  return Boolean(
    crew.inShelter && shelter && shelter.status !== 'inactive' && shelter.condition >= 40
  );
}

export function isShelterRequiredEvent(activeEvent?: ActiveEvent | null): boolean {
  if (!activeEvent) return false;
  const def = activeEvent.definition;
  return Boolean(
    (def.radiationLevel && def.radiationLevel > 0) ||
      def.phenomenon === 'global_dust_storm' ||
      def.severity === 'major' ||
      def.severity === 'super_major'
  );
}

export function isEventOfficiallyActive(activeEvent?: ActiveEvent | null): boolean {
  return Boolean(activeEvent && !activeEvent.resolved);
}

export function isMajorEventCutsceneActive(
  state: Pick<GameState, 'screen' | 'sleepPhase' | 'activeEvent'> & {
    lastDaySummary?: GameState['lastDaySummary'];
  }
): boolean {
  const evt = state.activeEvent;
  return Boolean(
    state.screen === 'PLAYING' &&
      state.sleepPhase !== 'sleeping' &&
      !state.lastDaySummary &&
      evt &&
      !evt.resolved &&
      !evt.cutsceneCompleted &&
      evt.definition.cutscene &&
      evt.definition.cutscene.length > 0
  );
}

export function getRadiationOutsideDamageForEvent(
  def: EventDefinition,
  difficulty: DifficultyLevel
): number {
  if (!def.radiationLevel || def.radiationLevel <= 0) return 0;
  const table = RADIATION_DAMAGE_OUTSIDE_SHELTER[difficulty];
  if (def.phenomenon === 'solar_energetic_particles') return table.sep;
  if (def.phenomenon === 'solar_storm_response') return table.solarStorm;
  return table.minorFlare;
}

/**
 * Applies exact radiation HP damage ONCE at impact if crew is outside the Radiation Shelter.
 * Inside a working Radiation Shelter = 0 damage.
 */
export function applyRadiationImpactDamage(state: GameState): {
  nextState: GameState;
  healthDelta: number;
} {
  const activeEvent = state.activeEvent;
  if (!activeEvent || activeEvent.radiationPenaltyApplied || isMajorEventCutsceneActive(state)) {
    return { nextState: state, healthDelta: 0 };
  }
  const def = activeEvent.definition;
  if (!def.radiationLevel || def.radiationLevel <= 0) {
    return {
      nextState: {
        ...state,
        activeEvent: { ...activeEvent, radiationPenaltyApplied: true },
      },
      healthDelta: 0,
    };
  }

  if (isCrewProtectedByShelter(state.crew, state.buildings)) {
    return {
      nextState: {
        ...state,
        activeEvent: {
          ...activeEvent,
          radiationPenaltyApplied: true,
          shelterUsed: true,
        },
      },
      healthDelta: 0,
    };
  }

  const penalty = getRadiationOutsideDamageForEvent(def, state.difficulty);
  const nextCondition = Math.max(0, state.crew.condition - penalty);
  const applied = state.crew.condition - nextCondition;

  return {
    nextState: {
      ...state,
      crew: {
        ...state.crew,
        condition: nextCondition,
      },
      activeEvent: {
        ...activeEvent,
        radiationPenaltyApplied: true,
        totalHazardHealthLost: (activeEvent.totalHazardHealthLost ?? 0) + applied,
      },
    },
    healthDelta: -applied,
  };
}

export function getEventHazardHealthRate(
  activeEvent: ActiveEvent,
  difficulty: DifficultyLevel = 'medium'
): number {
  const def = activeEvent.definition;
  const diffMult = DISASTER_DAMAGE_MULTIPLIER[difficulty];
  const duration = Math.max(
    1,
    activeEvent.animationDuration || (def.severity === 'minor' ? 15 : 20)
  );
  if (def.severity === 'super_major') {
    return (14 * diffMult) / duration;
  }
  if (def.severity === 'major') {
    return (8 * diffMult) / duration;
  }
  if (def.phenomenon === 'secondary_neutron_cascades') {
    return (6 * diffMult) / duration;
  }
  if (def.phenomenon === 'marsquake' || def.phenomenon === 'dust_devils') {
    return (5 * diffMult) / duration;
  }
  return (4 * diffMult) / duration;
}

export function applyGradualEventHealthTick(
  state: GameState,
  elapsedSeconds: number
): { nextState: GameState; healthDelta: number } {
  const activeEvent = state.activeEvent;
  if (
    !activeEvent ||
    activeEvent.animationRemaining <= 0 ||
    elapsedSeconds <= 0 ||
    isMajorEventCutsceneActive(state)
  ) {
    return { nextState: state, healthDelta: 0 };
  }

  if (isCrewProtectedByShelter(state.crew, state.buildings)) {
    return { nextState: state, healthDelta: 0 };
  }

  const rate = getEventHazardHealthRate(activeEvent, state.difficulty);
  if (rate <= 0) {
    return { nextState: state, healthDelta: 0 };
  }

  const accum = (activeEvent.hazardDrainRemainder ?? 0) + rate * elapsedSeconds;
  const wholeLoss = Math.floor(accum);
  const remainder = accum - wholeLoss;

  if (wholeLoss <= 0) {
    return {
      nextState: {
        ...state,
        activeEvent: {
          ...activeEvent,
          hazardDrainRemainder: remainder,
        },
      },
      healthDelta: 0,
    };
  }

  const nextCondition = Math.max(12, state.crew.condition - wholeLoss);
  const appliedLoss = state.crew.condition - nextCondition;

  return {
    nextState: {
      ...state,
      crew: {
        ...state.crew,
        condition: nextCondition,
      },
      activeEvent: {
        ...activeEvent,
        hazardDrainRemainder: remainder,
        totalHazardHealthLost: (activeEvent.totalHazardHealthLost ?? 0) + appliedLoss,
      },
    },
    healthDelta: -appliedLoss,
  };
}

export function applyLateShelterPenalty(state: GameState): {
  nextState: GameState;
  penalty: number;
  radiationGain: number;
} {
  const activeEvent = state.activeEvent;
  if (
    !activeEvent ||
    activeEvent.shelterEnteredLate ||
    !isShelterRequiredEvent(activeEvent) ||
    !isEventOfficiallyActive(activeEvent) ||
    isMajorEventCutsceneActive(state)
  ) {
    return { nextState: state, penalty: 0, radiationGain: 0 };
  }

  const isLateByImpact = Boolean(
    activeEvent.initialDamageApplied || activeEvent.radiationPenaltyApplied
  );
  const isLateByGraceWindow =
    activeEvent.animationDuration > 0 &&
    activeEvent.animationRemaining <= activeEvent.animationDuration * 0.55;

  if (!isLateByImpact && !isLateByGraceWindow) {
    return { nextState: state, penalty: 0, radiationGain: 0 };
  }

  const def = activeEvent.definition;
  const latenessRatio =
    activeEvent.animationDuration > 0
      ? Math.min(1, Math.max(0.25, 1 - activeEvent.animationRemaining / activeEvent.animationDuration))
      : 1;
  const diffMult = DISASTER_DAMAGE_MULTIPLIER[state.difficulty];
  const baseLoss =
    def.severity === 'super_major'
      ? 12 + Math.round(8 * latenessRatio)
      : def.severity === 'major'
      ? 10 + Math.round(7 * latenessRatio)
      : 6 + Math.round(4 * latenessRatio);
  const scaledLoss = Math.max(4, Math.round(baseLoss * diffMult));

  const floorCondition = Math.min(state.crew.condition, 15);
  const nextCondition = Math.max(floorCondition, state.crew.condition - scaledLoss);
  const appliedPenalty = state.crew.condition - nextCondition;

  const radiationGain =
    def.radiationLevel && def.radiationLevel > 0
      ? def.severity === 'minor'
        ? 4
        : 8
      : 0;

  return {
    penalty: appliedPenalty,
    radiationGain,
    nextState: {
      ...state,
      crew: {
        ...state.crew,
        condition: nextCondition,
        radiationExposure: Math.min(100, state.crew.radiationExposure + radiationGain),
      },
      activeEvent: {
        ...activeEvent,
        shelterUsed: true,
        shelterEnteredLate: true,
        lateEntryHealthPenalty: appliedPenalty,
        totalHazardHealthLost: (activeEvent.totalHazardHealthLost ?? 0) + appliedPenalty,
      },
    },
  };
}

export function createLingeringHazardForEvent(
  def: EventDefinition,
  day: number
): LingeringHazard | null {
  switch (def.phenomenon) {
    case 'dust_devils':
      return {
        id: `hazard_dust_${day}`,
        kind: 'toxic_dust',
        label: 'Suspended Red Dust Haze',
        description: 'Fine swirling basalt grit lingers outdoors after the dust vortices.',
        severity: 'moderate',
        daysRemaining: 1,
        dailyHealthDamage: 4,
        clearActionHint: 'Clean Solar Panels to clear airborne dust early',
        sourceEventId: def.id,
      };
    case 'global_dust_storm':
      return {
        id: `hazard_global_dust_${day}`,
        kind: 'toxic_dust',
        label: 'Dense Particulate Dust Cloud',
        description: 'Heavy storm dust irritates suit filters and strains outdoor work.',
        severity: 'high',
        daysRemaining: 2,
        dailyHealthDamage: 7,
        clearActionHint: 'Clean Solar Panels to clear dust haze early',
        sourceEventId: def.id,
      };
    case 'solar_flare_xray_uv':
      return {
        id: `hazard_uv_${day}`,
        kind: 'ionizing_particles',
        label: 'Residual UV / Ionizing Particles',
        description: 'Scattered solar rays linger in the thin Martian atmosphere.',
        severity: 'moderate',
        daysRemaining: 1,
        dailyHealthDamage: 4,
        clearActionHint: 'Dissipates naturally next sol; shelter shields crew',
        sourceEventId: def.id,
      };
    case 'solar_storm_response':
    case 'solar_energetic_particles':
      return {
        id: `hazard_particles_${day}`,
        kind: 'ionizing_particles',
        label: 'Charged Solar Particle Fallout',
        description: 'High-energy particle scatter elevates outdoor radiation risk.',
        severity: 'high',
        daysRemaining: 2,
        dailyHealthDamage: 6,
        clearActionHint: 'Dissipates over 2 sols; operational Habitat reduces impact',
        sourceEventId: def.id,
      };
    case 'water_ice_clouds':
      return {
        id: `hazard_frost_${day}`,
        kind: 'frost_haze',
        label: 'Subzero Cryo-Mist',
        description: 'Chilled ice-crystal fog stresses thermal seals during outdoor tasks.',
        severity: 'moderate',
        daysRemaining: 1,
        dailyHealthDamage: 4,
        clearActionHint: 'Repair frosted Water Recovery / Water Tank pipes to clear',
        sourceEventId: def.id,
      };
    default:
      return null;
  }
}

export function clearMitigatedLingeringHazards(
  hazards: LingeringHazard[],
  buildings: Record<BuildingId, BuildingState>
): { remaining: LingeringHazard[]; cleared: LingeringHazard[] } {
  if (!hazards || hazards.length === 0) {
    return { remaining: [], cleared: [] };
  }
  const solarDustClean = buildings.solar_panels.dustLevel < 25;
  const waterFrostClean =
    (buildings.water_recycling.frostLevel ?? 0) === 0 &&
    (buildings.water_storage.frostLevel ?? 0) === 0 &&
    buildings.water_recycling.malfunctionKind !== 'frost' &&
    buildings.water_storage.malfunctionKind !== 'frost';

  const remaining: LingeringHazard[] = [];
  const cleared: LingeringHazard[] = [];

  for (const h of hazards) {
    if (h.kind === 'toxic_dust' && solarDustClean) {
      cleared.push(h);
    } else if (h.kind === 'frost_haze' && waterFrostClean) {
      cleared.push(h);
    } else {
      remaining.push(h);
    }
  }
  return { remaining, cleared };
}

export function tickLingeringHazardsEndOfDay(
  hazards: LingeringHazard[],
  difficulty: DifficultyLevel,
  crewInShelter: boolean,
  habitatOperational: boolean
): {
  remaining: LingeringHazard[];
  totalDamage: number;
  activeLabels: string[];
} {
  if (!hazards || hazards.length === 0) {
    return { remaining: [], totalDamage: 0, activeLabels: [] };
  }
  const diffMult = DISASTER_DAMAGE_MULTIPLIER[difficulty];
  let totalDamage = 0;
  const activeLabels: string[] = [];
  const remaining: LingeringHazard[] = [];

  for (const h of hazards) {
    activeLabels.push(h.label);
    const rawDmg = Math.max(2, Math.round(h.dailyHealthDamage * diffMult));
    const mitigated = crewInShelter
      ? Math.max(1, Math.floor(rawDmg * 0.35))
      : habitatOperational
      ? Math.max(2, rawDmg - 1)
      : rawDmg;
    totalDamage += mitigated;

    const nextDays = h.daysRemaining - 1;
    if (nextDays > 0) {
      remaining.push({ ...h, daysRemaining: nextDays });
    }
  }

  return { remaining, totalDamage, activeLabels };
}

function shuffleWithRng<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function selectControlledTargets(
  def: EventDefinition,
  buildings: Record<BuildingId, BuildingState>,
  rng: () => number
): BuildingId[] {
  const targets = def.targetBuildings ?? [];
  if (targets.length === 0) return [];

  const activeTargets = shuffleWithRng(
    targets.filter((id) => buildings[id]?.status !== 'inactive'),
    rng
  );
  const inactiveTargets = shuffleWithRng(
    targets.filter((id) => buildings[id]?.status === 'inactive'),
    rng
  );
  const ordered = [...activeTargets, ...inactiveTargets];

  if (def.phenomenon === 'marsquake') {
    // Marsquake: randomly damage 1 exposed infrastructure
    return ordered.slice(0, 1);
  }

  if (def.phenomenon === 'secondary_neutron_cascades') {
    // Secondary Neutron Cascades: randomly malfunction 1 electronic system
    const nonFaulted = activeTargets.filter(
      (id) => (buildings[id].malfunctionDaysRemaining ?? 0) <= 0
    );
    return (nonFaulted.length > 0 ? nonFaulted : ordered).slice(0, 1);
  }

  if (def.phenomenon === 'dust_devils') {
    // Dust Devils: coat Solar Panels (-25% until cleaned), optionally nick Greenhouse
    const selected: BuildingId[] = [];
    if (targets.includes('solar_panels')) selected.push('solar_panels');
    if (buildings.greenhouse.status !== 'inactive' && rng() < 0.35) {
      selected.push('greenhouse');
    }
    return selected.length > 0 ? selected : ordered.slice(0, 1);
  }

  if (def.phenomenon === 'water_ice_clouds') {
    // Water Ice Clouds: Water Recovery temporarily loses efficiency (+ optional Water Tanks)
    const selected: BuildingId[] = [];
    if (targets.includes('water_recycling')) selected.push('water_recycling');
    const rest = ordered.filter((id) => id !== 'water_recycling');
    if (rest.length > 0 && rng() < 0.5) selected.push(rest[0]);
    return selected;
  }

  if (def.phenomenon === 'solar_storm_response') {
    // Sol 9 Solar Storm: Solar Panels lose 50% until repaired; Battery Bank may malfunction
    const selected: BuildingId[] = [];
    if (targets.includes('solar_panels')) selected.push('solar_panels');
    if (targets.includes('energy_storage') && rng() < 0.8) {
      selected.push('energy_storage');
    }
    if (targets.includes('oxygen_generator') && rng() < 0.45) {
      selected.push('oxygen_generator');
    }
    return selected;
  }

  if (def.phenomenon === 'global_dust_storm') {
    // Sol 29 Global Dust Storm: Solar Panels -70% until cleaned/repaired; Greenhouse reduced
    const selected: BuildingId[] = [];
    if (targets.includes('solar_panels')) selected.push('solar_panels');
    if (targets.includes('greenhouse')) selected.push('greenhouse');
    if (targets.includes('water_recycling') && rng() < 0.6) {
      selected.push('water_recycling');
    }
    return selected;
  }

  // Solar Flare & Solar Energetic Particles
  let hitCount = targets.length;
  if (def.severity === 'minor') {
    hitCount = targets.length >= 3 ? (rng() < 0.6 ? 1 : 2) : 1;
  } else {
    hitCount = targets.length >= 4 ? (rng() < 0.55 ? 2 : 3) : 2;
  }
  return ordered.slice(0, hitCount);
}

function applyEventInfrastructureDamage(params: {
  def: EventDefinition;
  buildings: Record<BuildingId, BuildingState>;
  modifiers?: MissionModifiers;
  impactMap: Map<BuildingId, BuildingEventImpact>;
  seed?: number;
  day?: number;
  difficulty?: DifficultyLevel;
}): { buildings: Record<BuildingId, BuildingState>; consumedExtraDust: boolean } {
  const {
    def,
    buildings,
    modifiers,
    impactMap,
    seed = 1001,
    day = 1,
    difficulty = 'medium',
  } = params;
  const nextBuildings = { ...buildings };
  const rng = createSeededRng((seed >>> 0) + day * 7919 + hashString(def.id));

  const workshop = nextBuildings.maintenance_facility;
  const workshopOperational =
    workshop.status === 'operational' &&
    !(workshop.malfunctionDaysRemaining && workshop.malfunctionDaysRemaining > 0);
  const workshopMitigation = workshopOperational ? 0.72 : 1;
  const campaignFactor = modifiers?.stormDamageFactor ?? 1;
  const diffMult = DISASTER_DAMAGE_MULTIPLIER[difficulty];

  const selectedTargets = selectControlledTargets(def, nextBuildings, rng);
  const startingConditions = new Map<BuildingId, number>();
  const startingStatuses = new Map<BuildingId, BuildingState['status']>();
  for (const id of Object.keys(nextBuildings) as BuildingId[]) {
    startingConditions.set(id, nextBuildings[id].condition);
    startingStatuses.set(id, nextBuildings[id].status);
  }

  const updateImpact = (
    id: BuildingId,
    extra?: Partial<Omit<BuildingEventImpact, 'buildingId' | 'conditionDelta'>>
  ) => {
    const startCond = startingConditions.get(id) ?? nextBuildings[id].condition;
    const prev = impactMap.get(id);
    const becameShutdown =
      startingStatuses.get(id) !== 'inactive' && nextBuildings[id].status === 'inactive';
    impactMap.set(id, {
      buildingId: id,
      conditionDelta: nextBuildings[id].condition - startCond,
      dustAdded: extra?.dustAdded ?? prev?.dustAdded,
      frostAdded: extra?.frostAdded ?? prev?.frostAdded,
      malfunctionKind: extra?.malfunctionKind ?? prev?.malfunctionKind,
      shutdown: Boolean(prev?.shutdown || extra?.shutdown || becameShutdown),
    });
  };

  if (selectedTargets.length > 0 && def.conditionDamage) {
    for (const id of selectedTargets) {
      // Dust Devils coat Solar Panels cleanly without reducing condition so output drops exact 25% until cleaned
      const skipConditionDamageForDustDevilSolar =
        def.phenomenon === 'dust_devils' && id === 'solar_panels';

      if (!skipConditionDamageForDustDevilSolar) {
        const variance = 0.85 + rng() * 0.3;
        const rawDamage =
          def.conditionDamage * variance * workshopMitigation * campaignFactor * diffMult;
        const damage =
          def.severity === 'minor'
            ? Math.max(7, Math.min(22, Math.round(rawDamage)))
            : def.severity === 'major'
            ? Math.max(16, Math.min(40, Math.round(rawDamage)))
            : Math.max(20, Math.min(48, Math.round(rawDamage)));

        nextBuildings[id] = applyBuildingConditionChange(
          nextBuildings[id],
          -damage,
          false,
          def.phenomenon,
          def.severity
        );

        // Keep Solar Panels active/damaged (not 0% shutdown) on Sol 9 / Sol 29 so exact 50% / 70% storm debuff applies
        if (
          id === 'solar_panels' &&
          (def.phenomenon === 'solar_storm_response' || def.phenomenon === 'global_dust_storm') &&
          startingStatuses.get('solar_panels') !== 'inactive' &&
          nextBuildings.solar_panels.condition < 40
        ) {
          nextBuildings.solar_panels = {
            ...nextBuildings.solar_panels,
            condition: 40,
            status: 'damaged',
          };
        }
      }

      let frostAdded: number | undefined;
      let malfunctionKind: BuildingEventImpact['malfunctionKind'];

      if (def.phenomenon === 'water_ice_clouds') {
        const prevFrost = nextBuildings[id].frostLevel ?? 0;
        const added = Math.round((35 + rng() * 25) * diffMult);
        const nextFrost = Math.min(100, prevFrost + added);
        frostAdded = nextFrost - prevFrost;
        malfunctionKind = 'frost';
        nextBuildings[id] = {
          ...nextBuildings[id],
          frostLevel: nextFrost,
          malfunctionDaysRemaining: Math.max(2, nextBuildings[id].malfunctionDaysRemaining ?? 0),
          malfunctionKind: 'frost',
          hasVisibleDamage: true,
          damageCause: def.phenomenon,
          damageSeverity: def.severity,
        };
      } else if (
        def.phenomenon === 'secondary_neutron_cascades' ||
        def.phenomenon === 'solar_energetic_particles'
      ) {
        malfunctionKind = 'electronic';
        if (nextBuildings[id].status !== 'inactive') {
          nextBuildings[id] = {
            ...nextBuildings[id],
            malfunctionDaysRemaining: Math.max(2, nextBuildings[id].malfunctionDaysRemaining ?? 0),
            malfunctionKind: 'electronic',
            hasVisibleDamage: true,
            damageCause: def.phenomenon,
            damageSeverity: def.severity,
          };
        }
      } else if (def.phenomenon === 'solar_storm_response') {
        malfunctionKind = 'electrical';
        if (nextBuildings[id].status !== 'inactive') {
          // Solar Panels remain at 50% until repaired; Battery Bank malfunctions temporarily (3 sols or until repaired)
          const duration = id === 'solar_panels' ? 30 : 3;
          nextBuildings[id] = {
            ...nextBuildings[id],
            malfunctionDaysRemaining: Math.max(
              duration,
              nextBuildings[id].malfunctionDaysRemaining ?? 0
            ),
            malfunctionKind: 'electrical',
            hasVisibleDamage: true,
            damageCause: def.phenomenon,
            damageSeverity: def.severity,
          };
        }
      } else if (def.phenomenon === 'solar_flare_xray_uv') {
        malfunctionKind = 'electrical';
        if (nextBuildings[id].status !== 'inactive') {
          nextBuildings[id] = {
            ...nextBuildings[id],
            malfunctionDaysRemaining: Math.max(1, nextBuildings[id].malfunctionDaysRemaining ?? 0),
            malfunctionKind: 'electrical',
            hasVisibleDamage: true,
            damageCause: def.phenomenon,
            damageSeverity: def.severity,
          };
        }
      } else if (def.phenomenon === 'global_dust_storm') {
        malfunctionKind = 'disrupted';
        if (nextBuildings[id].status !== 'inactive') {
          // Solar Panels remain at -70% until cleaned or repaired; Greenhouse dips for 2 sols
          const duration = id === 'solar_panels' ? 30 : 2;
          nextBuildings[id] = {
            ...nextBuildings[id],
            malfunctionDaysRemaining: Math.max(
              duration,
              nextBuildings[id].malfunctionDaysRemaining ?? 0
            ),
            malfunctionKind: 'disrupted',
            hasVisibleDamage: true,
            damageCause: def.phenomenon,
            damageSeverity: def.severity,
          };
        }
      }

      updateImpact(id, { frostAdded, malfunctionKind });
    }
  }

  // Apply dust accumulation for Dust Devils (exact +50 dust = 25% drop until cleaned) & Global Dust Storm
  let consumedExtraDust = false;
  if (def.phenomenon === 'dust_devils' && def.dustAdded) {
    const beforeDust = nextBuildings.solar_panels.dustLevel;
    const nextDust = Math.min(100, Math.max(50, beforeDust + def.dustAdded));
    nextBuildings.solar_panels = {
      ...nextBuildings.solar_panels,
      dustLevel: nextDust,
    };
    updateImpact('solar_panels', { dustAdded: nextDust - beforeDust });
  } else if (def.dustAdded && (selectedTargets.includes('solar_panels') || def.severity === 'super_major')) {
    const extraDust = modifiers?.extraDustNextStorm ?? 0;
    consumedExtraDust = extraDust > 0;
    const dustRoll = Math.round(def.dustAdded * (0.9 + rng() * 0.2));
    const beforeDust = nextBuildings.solar_panels.dustLevel;
    const nextDust = Math.min(100, beforeDust + dustRoll + extraDust);
    nextBuildings.solar_panels = {
      ...nextBuildings.solar_panels,
      dustLevel: nextDust,
    };
    updateImpact('solar_panels', { dustAdded: nextDust - beforeDust });
  }

  return { buildings: nextBuildings, consumedExtraDust };
}

export function applyInitialEventImpact(state: GameState): {
  nextState: GameState;
  buildingImpacts: BuildingEventImpact[];
  healthDelta: number;
} {
  const activeEvent = state.activeEvent;
  if (!activeEvent || activeEvent.initialDamageApplied) {
    return { nextState: state, buildingImpacts: [], healthDelta: 0 };
  }

  const def = activeEvent.definition;
  const impactMap = new Map<BuildingId, BuildingEventImpact>();
  const { buildings: nextBuildings, consumedExtraDust } = applyEventInfrastructureDamage({
    def,
    buildings: state.buildings,
    modifiers: state.modifiers,
    impactMap,
    seed: state.seed,
    day: state.day,
    difficulty: state.difficulty,
  });

  const existingScars = state.environmentalScars ?? [];
  const hasTodayScars = existingScars.some(
    (s) => s.day === state.day && s.eventId === def.id
  );
  const addedScars = hasTodayScars ? [] : createScarsForEvent(def, state.day);
  const nextScars = [...existingScars, ...addedScars].slice(-28);
  const buildingImpacts = Array.from(impactMap.values());

  const cutsceneActive = isMajorEventCutsceneActive(state);

  // Apply intensity-scaled physical impact shock for non-radiation hazards if crew is outside shelter
  let physicalShockApplied = 0;
  let crewAfterShock = state.crew;
  if (
    !cutsceneActive &&
    (!def.radiationLevel || def.radiationLevel <= 0) &&
    !isCrewProtectedByShelter(state.crew, nextBuildings)
  ) {
    const diffMult = DISASTER_DAMAGE_MULTIPLIER[state.difficulty];
    const baseShock =
      def.phenomenon === 'global_dust_storm'
        ? 6
        : def.phenomenon === 'marsquake'
        ? 4
        : 2;
    const rawShock = Math.max(1, Math.round(baseShock * diffMult));
    const nextCond = Math.max(12, state.crew.condition - rawShock);
    physicalShockApplied = state.crew.condition - nextCond;
    crewAfterShock = {
      ...state.crew,
      condition: nextCond,
    };
  }

  const withInfra: GameState = {
    ...state,
    crew: crewAfterShock,
    buildings: nextBuildings,
    environmentalScars: nextScars,
    modifiers: {
      ...state.modifiers,
      extraDustNextStorm: consumedExtraDust ? 0 : state.modifiers.extraDustNextStorm,
    },
    activeEvent: {
      ...activeEvent,
      initialDamageApplied: true,
      appliedBuildingImpacts: buildingImpacts,
      totalHazardHealthLost: (activeEvent.totalHazardHealthLost ?? 0) + physicalShockApplied,
    },
  };

  if (cutsceneActive) {
    return {
      buildingImpacts,
      nextState: withInfra,
      healthDelta: 0,
    };
  }

  // Apply exact radiation damage at impact if crew is outside shelter
  const { nextState: withRadiation, healthDelta: radDelta } = applyRadiationImpactDamage(withInfra);

  return {
    buildingImpacts,
    nextState: withRadiation,
    healthDelta: radDelta - physicalShockApplied,
  };
}

export function applyMajorEventDecision(
  choiceId: string,
  state: GameState
): {
  nextState: GameState;
  buildingImpacts: BuildingEventImpact[];
} {
  const activeEvent = state.activeEvent;
  if (!activeEvent || !activeEvent.definition.choices) {
    return { nextState: state, buildingImpacts: [] };
  }

  const choice = activeEvent.definition.choices.find((c) => c.id === choiceId);
  if (!choice) {
    return { nextState: state, buildingImpacts: [] };
  }

  const fx = choice.immediateEffect;
  const buildingImpacts: BuildingEventImpact[] = [];

  let nextBuildings = { ...state.buildings };
  if (fx.buildingDeltas) {
    for (const [bId, delta] of Object.entries(fx.buildingDeltas) as Array<[BuildingId, number]>) {
      if (!delta) continue;
      const before = nextBuildings[bId].condition;
      nextBuildings[bId] = applyBuildingConditionChange(
        nextBuildings[bId],
        delta,
        false,
        delta < 0 ? activeEvent.definition.phenomenon : undefined,
        delta < 0 ? activeEvent.definition.severity : undefined
      );
      const actualDelta = nextBuildings[bId].condition - before;
      if (actualDelta !== 0) {
        buildingImpacts.push({ buildingId: bId, conditionDelta: actualDelta });
      }
    }
  }

  if (fx.solarDustDelta) {
    const beforeDust = nextBuildings.solar_panels.dustLevel;
    const nextDust = Math.max(0, Math.min(100, beforeDust + fx.solarDustDelta));
    nextBuildings.solar_panels = {
      ...nextBuildings.solar_panels,
      dustLevel: nextDust,
    };
  }

  const nextRawResources: ResourceAmounts = { ...state.resources };
  if (fx.resourcesDelta) {
    for (const key of ['oxygen', 'water', 'food', 'energy'] as ResourceType[]) {
      const delta = fx.resourcesDelta[key] ?? 0;
      nextRawResources[key] = Math.max(0, nextRawResources[key] + delta);
    }
  }
  const nextResources = clampResourcesToCapacity(nextRawResources, state.capacities);

  const shelterOperational = nextBuildings.radiation_shelter.status !== 'inactive';
  const decisionShelteredCrew = Boolean(fx.setInShelter && shelterOperational);
  const nextInShelter = decisionShelteredCrew ? true : state.crew.inShelter;

  const nextCrew: CrewState = {
    ...state.crew,
    energy: Math.max(0, Math.min(100, state.crew.energy + (fx.crewEnergyDelta ?? 0))),
    condition: Math.max(12, Math.min(100, state.crew.condition + (fx.crewConditionDelta ?? 0))),
    radiationExposure: Math.max(
      0,
      Math.min(100, state.crew.radiationExposure + (fx.crewRadiationDelta ?? 0))
    ),
    inShelter: nextInShelter,
  };

  const addedHours = fx.timeHoursCost ?? 0;
  const clock = computeWorkClockMetrics(state.hoursElapsed + addedHours);

  const nextModifiers: MissionModifiers = {
    solarOutputBonusPct: Math.max(
      -30,
      Math.min(40, state.modifiers.solarOutputBonusPct + (fx.solarOutputBonusPctDelta ?? 0))
    ),
    stormDamageFactor: Math.max(
      0.4,
      Math.min(
        1.5,
        Number(
          (state.modifiers.stormDamageFactor * (fx.stormDamageFactorMultiplier ?? 1)).toFixed(2)
        )
      )
    ),
    extraDustNextStorm: Math.max(
      0,
      state.modifiers.extraDustNextStorm + (fx.extraDustNextStormDelta ?? 0)
    ),
    cropBoostDaysLeft: Math.max(
      state.modifiers.cropBoostDaysLeft,
      fx.cropBoostDays ?? 0
    ),
    lastDecisionNote: {
      id: `dec_${state.day}_${choice.id}`,
      headline: choice.gilHeadline,
      outcome: choice.gilOutcome,
      futureWarning: choice.gilFutureWarning,
      urgency: choice.urgency,
    },
    decisionHistory: [
      ...state.modifiers.decisionHistory,
      {
        day: state.day,
        eventId: activeEvent.definition.id,
        choiceId: choice.id,
        choiceTitle: choice.title,
        summary: choice.gilOutcome,
      },
    ],
  };

  const nextState: GameState = {
    ...state,
    ...clock,
    resources: nextResources,
    buildings: nextBuildings,
    crew: nextCrew,
    modifiers: nextModifiers,
    activeEvent: {
      ...activeEvent,
      selectedChoiceId: choice.id,
      shelterUsed: Boolean(
        activeEvent.shelterUsed || decisionShelteredCrew || nextInShelter
      ),
      mitigationSummary: choice.title,
    },
    keyDecisions: [
      ...state.keyDecisions,
      `Sol ${state.day}: ${activeEvent.definition.title} — ${choice.title}`,
    ],
  };

  return { nextState, buildingImpacts };
}

export function resolveEventAtEndOfDay(params: {
  activeEvent: ActiveEvent;
  buildings: Record<BuildingId, BuildingState>;
  resources: ResourceAmounts;
  crew: CrewState;
  modifiers?: MissionModifiers;
  seed?: number;
  day?: number;
  difficulty?: DifficultyLevel;
}): {
  buildings: Record<BuildingId, BuildingState>;
  resources: ResourceAmounts;
  radiationGain: number;
  crewEnergyPenalty: number;
  crewConditionPenalty: number;
  buildingImpacts: BuildingEventImpact[];
  consumedExtraDust: boolean;
  outcomeSummary: string;
} {
  const {
    activeEvent,
    buildings,
    resources,
    crew,
    modifiers,
    seed = 1001,
    day,
    difficulty = 'medium',
  } = params;
  const def: EventDefinition = activeEvent.definition;

  let nextBuildings = { ...buildings };
  let nextResources = { ...resources };
  const impactMap = new Map<BuildingId, BuildingEventImpact>();

  const workshop = buildings.maintenance_facility;
  const workshopOperational =
    workshop.status === 'operational' &&
    !(workshop.malfunctionDaysRemaining && workshop.malfunctionDaysRemaining > 0);

  let consumedExtraDust = false;
  let buildingImpacts: BuildingEventImpact[] = activeEvent.appliedBuildingImpacts ?? [];

  if (!activeEvent.initialDamageApplied) {
    const applied = applyEventInfrastructureDamage({
      def,
      buildings: nextBuildings,
      modifiers,
      impactMap,
      seed,
      day: day ?? activeEvent.dayTriggered,
      difficulty,
    });
    nextBuildings = applied.buildings;
    consumedExtraDust = applied.consumedExtraDust;
    buildingImpacts = Array.from(impactMap.values());
  }

  // Scale resource losses by difficulty + enforce offline storage consequences
  const lossMult = DISASTER_RESOURCE_LOSS_MULTIPLIER[difficulty];
  const combinedLoss: Partial<ResourceAmounts> = {};
  if (def.resourceLoss) {
    for (const k of ['oxygen', 'water', 'food', 'energy'] as ResourceType[]) {
      const base = def.resourceLoss[k] ?? 0;
      if (base > 0) {
        combinedLoss[k] = Math.max(1, Math.round(base * lossMult));
      }
    }
  }

  // Storage facility importance during disasters:
  if (nextBuildings.food_storage.status === 'inactive') {
    const extraFoodLoss = Math.max(2, Math.round((def.severity === 'minor' ? 3 : 5) * lossMult));
    combinedLoss.food = (combinedLoss.food ?? 0) + extraFoodLoss;
  }
  if (
    nextBuildings.water_storage.status === 'inactive' &&
    (def.phenomenon === 'water_ice_clouds' || def.phenomenon === 'marsquake')
  ) {
    combinedLoss.water = (combinedLoss.water ?? 0) + Math.max(2, Math.round(4 * lossMult));
  }
  if (
    nextBuildings.oxygen_storage.status === 'inactive' &&
    (def.phenomenon === 'marsquake' ||
      def.phenomenon === 'solar_storm_response' ||
      def.phenomenon === 'solar_energetic_particles')
  ) {
    combinedLoss.oxygen = (combinedLoss.oxygen ?? 0) + Math.max(2, Math.round(4 * lossMult));
  }

  if (Object.keys(combinedLoss).length > 0) {
    nextResources = deductResources(nextResources, combinedLoss);
  }

  // Radiation & environmental shelter protection calculation
  let radiationGain = 0;
  let crewConditionPenalty = 0;
  const summaryParts: string[] = [];
  const shelterUsable = Boolean(
    nextBuildings.radiation_shelter &&
      nextBuildings.radiation_shelter.status !== 'inactive' &&
      nextBuildings.radiation_shelter.condition >= 40
  );
  const protectedInShelter = Boolean(
    isCrewProtectedByShelter(crew, nextBuildings) || activeEvent.shelterUsed
  );

  if (activeEvent.mitigationSummary) {
    summaryParts.push(`Decision: ${activeEvent.mitigationSummary}`);
  }

  const cutsceneUnfinished = Boolean(
    !activeEvent.resolved &&
      !activeEvent.cutsceneCompleted &&
      def.cutscene &&
      def.cutscene.length > 0
  );

  if (cutsceneUnfinished) {
    radiationGain = 0;
    crewConditionPenalty = 0;
  } else if (def.radiationLevel && def.radiationLevel > 0) {
    const shelter = nextBuildings.radiation_shelter;
    if (protectedInShelter) {
      const baseEffectiveness = Math.min(0.85, (shelter.condition / 100) * 0.85);
      const shelterEffectiveness = shelterUsable
        ? baseEffectiveness
        : Math.max(0.55, baseEffectiveness);
      radiationGain = Math.max(2, Math.round(def.radiationLevel * (1 - shelterEffectiveness)));
      summaryParts.push(
        shelter.condition < 65
          ? `Damaged shelter shielded crew (${Math.round(shelterEffectiveness * 100)}% blocked)`
          : `Crew safe inside Radiation Shelter (0 HP radiation damage)`
      );
    } else {
      radiationGain = def.radiationLevel;
      if (!activeEvent.radiationPenaltyApplied) {
        crewConditionPenalty = getRadiationOutsideDamageForEvent(def, difficulty);
      }
      summaryParts.push(
        crew.inShelter && (shelter.status === 'inactive' || shelter.condition < 40)
          ? 'Shelter protection inadequate—crew exposed to radiation'
          : `Crew caught outside Radiation Shelter (-${getRadiationOutsideDamageForEvent(def, difficulty)} HP)`
      );
    }
  } else if (protectedInShelter) {
    summaryParts.push('Crew sheltered from hazard effects');
  } else if ((activeEvent.totalHazardHealthLost ?? 0) > 0) {
    summaryParts.push(`Crew outside took -${activeEvent.totalHazardHealthLost}% health`);
  }

  if (def.targetBuildings?.length) {
    summaryParts.push(
      workshopOperational
        ? 'Workshop maintenance softened structural wear'
        : 'Equipment sustained weather wear'
    );
  }

  return {
    buildings: nextBuildings,
    resources: nextResources,
    radiationGain,
    crewEnergyPenalty: cutsceneUnfinished || protectedInShelter ? 0 : def.crewEnergyImpact ?? 0,
    crewConditionPenalty,
    buildingImpacts,
    consumedExtraDust,
    outcomeSummary: summaryParts.join(' · ') || 'Weather event passed',
  };
}

export interface OutdoorHazardSummary {
  hasHazard: boolean;
  isRadiation: boolean;
  label: string;
  riskWarning: string;
}

export function getActiveOutdoorHazardSummary(
  state: Pick<
    GameState,
    'screen' | 'sleepPhase' | 'activeEvent' | 'lingeringHazards' | 'lastDaySummary'
  >
): OutdoorHazardSummary | null {
  if (isMajorEventCutsceneActive(state)) {
    return null;
  }

  const activeEvt = state.activeEvent;
  if (activeEvt && !activeEvt.resolved) {
    const def = activeEvt.definition;
    const isRadiation = Boolean(def.radiationLevel && def.radiationLevel > 0);
    return {
      hasHazard: true,
      isRadiation,
      label: def.title,
      riskWarning: isRadiation
        ? `${def.title} active — outdoor tasks cost Crew Health and increase Radiation Exposure. Enter Shelter for full protection.`
        : `${def.title} active — working outdoors during hazardous weather strains suits and costs Crew Health.`,
    };
  }

  const primaryLingering = state.lingeringHazards?.[0];
  if (primaryLingering) {
    const isRadiation = primaryLingering.kind === 'ionizing_particles';
    return {
      hasHazard: true,
      isRadiation,
      label: primaryLingering.label,
      riskWarning: isRadiation
        ? `${primaryLingering.label} active — outdoor work reduces Crew Health and raises Radiation Exposure.`
        : `${primaryLingering.label} active — working outdoors reduces Crew Health until cleared.`,
    };
  }

  return null;
}

export function applyOutdoorActivityHazardConsequence(
  state: GameState,
  workHours = 2
): {
  nextState: GameState;
  healthDelta: number;
  radiationDelta: number;
  reason: string | null;
} {
  if (isMajorEventCutsceneActive(state) || state.crew.inShelter) {
    return { nextState: state, healthDelta: 0, radiationDelta: 0, reason: null };
  }

  const diffMult = DISASTER_DAMAGE_MULTIPLIER[state.difficulty];
  const hoursFactor = Math.min(1.5, Math.max(0.75, workHours / 2));

  const activeEvt = state.activeEvent;
  if (activeEvt && !activeEvt.resolved) {
    const def = activeEvt.definition;
    const isRadiation = Boolean(def.radiationLevel && def.radiationLevel > 0);

    let baseHpLoss = 3;
    let baseRadGain = 0;

    if (isRadiation) {
      if (def.severity === 'super_major') {
        baseHpLoss = 8;
        baseRadGain = 7;
      } else if (def.severity === 'major') {
        baseHpLoss = 7;
        baseRadGain = 6;
      } else {
        baseHpLoss = 4;
        baseRadGain = 4;
      }
    } else if (def.severity === 'super_major') {
      baseHpLoss = 6;
    } else if (def.severity === 'major') {
      baseHpLoss = 5;
    } else {
      baseHpLoss = 3;
    }

    const hpLoss = Math.max(2, Math.min(12, Math.round(baseHpLoss * diffMult * hoursFactor)));
    const radGain =
      baseRadGain > 0
        ? Math.max(2, Math.min(10, Math.round(baseRadGain * diffMult * hoursFactor)))
        : 0;

    const nextCondition = Math.max(0, state.crew.condition - hpLoss);
    const appliedLoss = state.crew.condition - nextCondition;
    const nextRad = Math.min(100, state.crew.radiationExposure + radGain);
    const appliedRad = nextRad - state.crew.radiationExposure;

    return {
      healthDelta: -appliedLoss,
      radiationDelta: appliedRad,
      reason: isRadiation ? `${def.title} exposure` : `${def.title} hazard`,
      nextState: {
        ...state,
        crew: {
          ...state.crew,
          condition: nextCondition,
          radiationExposure: nextRad,
        },
        activeEvent: {
          ...activeEvt,
          totalHazardHealthLost: (activeEvt.totalHazardHealthLost ?? 0) + appliedLoss,
        },
      },
    };
  }

  const hazards = state.lingeringHazards ?? [];
  if (hazards.length > 0) {
    const worst = hazards.reduce((a, b) =>
      b.dailyHealthDamage > a.dailyHealthDamage ? b : a
    );
    const isRadiation = worst.kind === 'ionizing_particles';
    const hpLoss = Math.max(
      2,
      Math.min(7, Math.round(worst.dailyHealthDamage * 0.55 * diffMult * hoursFactor))
    );
    const radGain = isRadiation ? Math.max(2, Math.round(3 * diffMult)) : 0;

    const nextCondition = Math.max(0, state.crew.condition - hpLoss);
    const appliedLoss = state.crew.condition - nextCondition;
    const nextRad = Math.min(100, state.crew.radiationExposure + radGain);
    const appliedRad = nextRad - state.crew.radiationExposure;

    return {
      healthDelta: -appliedLoss,
      radiationDelta: appliedRad,
      reason: worst.label,
      nextState: {
        ...state,
        crew: {
          ...state.crew,
          condition: nextCondition,
          radiationExposure: nextRad,
        },
      },
    };
  }

  return { nextState: state, healthDelta: 0, radiationDelta: 0, reason: null };
}

