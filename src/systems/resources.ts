import {
  getDailyCrewConsumption,
  getFacilityDailyConsumption,
  getFacilityDailyProduction,
  getStartingResources,
} from '../data/balance';
import { BUILDING_LIST } from '../data/buildings';
import { CROP_MAP } from '../data/crops';
import { RESOURCE_CONFIGS, RESOURCE_ORDER } from '../data/resources';
import { BuildingId, BuildingState } from '../types/building';
import { ActiveEvent } from '../types/event';
import { DifficultyLevel, MissionModifiers, PlantedCrop } from '../types/game';
import { ResourceAmounts, ResourceNetRate, ResourceType } from '../types/resource';
import { getBuildingEffectiveness } from './buildings';

export function createInitialResources(
  difficulty: DifficultyLevel = 'medium'
): ResourceAmounts {
  return getStartingResources(difficulty);
}

export function canAffordResources(
  available: ResourceAmounts,
  cost: Partial<ResourceAmounts>
): boolean {
  for (const key of RESOURCE_ORDER) {
    const needed = cost[key] ?? 0;
    if (available[key] < needed) return false;
  }
  return true;
}

export function deductResources(
  available: ResourceAmounts,
  cost: Partial<ResourceAmounts>
): ResourceAmounts {
  return {
    oxygen: Math.max(0, available.oxygen - (cost.oxygen ?? 0)),
    water: Math.max(0, available.water - (cost.water ?? 0)),
    food: Math.max(0, available.food - (cost.food ?? 0)),
    energy: Math.max(0, available.energy - (cost.energy ?? 0)),
  };
}

export function clampResourcesToCapacity(
  resources: ResourceAmounts,
  capacities: ResourceAmounts
): ResourceAmounts {
  return {
    oxygen: Math.max(0, Math.min(capacities.oxygen, Math.round(resources.oxygen))),
    water: Math.max(0, Math.min(capacities.water, Math.round(resources.water))),
    food: Math.max(0, Math.min(capacities.food, Math.round(resources.food))),
    energy: Math.max(0, Math.min(capacities.energy, Math.round(resources.energy))),
  };
}

export interface DailySimulationRates {
  production: ResourceAmounts;
  consumption: ResourceAmounts;
  waterRecycled: number;
  net: Record<ResourceType, ResourceNetRate>;
  hasPowerForLifeSupport: boolean;
}

export function calculateDailyRates(params: {
  buildings: Record<BuildingId, BuildingState>;
  currentResources: ResourceAmounts;
  greenhouseCrop: PlantedCrop | null;
  activeEvent: ActiveEvent | null;
  modifiers?: MissionModifiers;
  difficulty?: DifficultyLevel;
}): DailySimulationRates {
  const {
    buildings,
    currentResources,
    greenhouseCrop,
    activeEvent,
    modifiers,
    difficulty = 'medium',
  } = params;

  const production: ResourceAmounts = { oxygen: 0, water: 0, food: 0, energy: 0 };
  const consumption: ResourceAmounts = getDailyCrewConsumption(difficulty);

  // 1. Solar energy generation first
  const solarState = buildings.solar_panels;
  const solarProd = getFacilityDailyProduction('solar_panels', difficulty).energy ?? 0;
  let solarOutput = solarProd * getBuildingEffectiveness(solarState);
  if (modifiers?.solarOutputBonusPct) {
    solarOutput *= Math.max(0.5, 1 + modifiers.solarOutputBonusPct / 100);
  }
  if (activeEvent?.definition.solarPenaltyFactor) {
    solarOutput *= Math.max(0.25, 1 - activeEvent.definition.solarPenaltyFactor);
  }
  production.energy += Math.round(solarOutput);

  // 2. Calculate total energy demand of active powered facilities
  let facilityEnergyDemand = 0;
  for (const def of BUILDING_LIST) {
    if (!def.requiresPower) continue;
    const state = buildings[def.id];
    if (state.status === 'inactive') continue;
    const opCost = getFacilityDailyConsumption(def);
    facilityEnergyDemand += opCost.energy ?? 0;
  }

  // Optional crop energy surcharge if any crop defines one
  const cropDef = greenhouseCrop ? CROP_MAP[greenhouseCrop.cropId] : null;
  if (cropDef && buildings.greenhouse.status !== 'inactive' && !greenhouseCrop?.isMature) {
    facilityEnergyDemand += cropDef.dailyEnergyNeed;
  }

  consumption.energy += facilityEnergyDemand;

  // Determine available power factor for life support facilities
  // Battery Bank provides emergency reserve buffering during power deficits
  const totalAvailableEnergy = currentResources.energy + production.energy;
  const batteryOperational =
    buildings.energy_storage.status !== 'inactive' &&
    (buildings.energy_storage.malfunctionDaysRemaining ?? 0) <= 0;
  const powerFactor =
    consumption.energy <= 0
      ? 1
      : totalAvailableEnergy >= consumption.energy
      ? 1
      : batteryOperational && totalAvailableEnergy >= 6
      ? Math.max(0.35, totalAvailableEnergy / consumption.energy)
      : totalAvailableEnergy > 0
      ? Math.max(0, totalAvailableEnergy / consumption.energy)
      : 0;
  const hasPowerForLifeSupport = powerFactor > 0;

  // 3. Other facility production and operating water consumption
  for (const def of BUILDING_LIST) {
    if (def.id === 'solar_panels') continue;
    const state = buildings[def.id];
    if (state.status === 'inactive') continue;

    const eff = getBuildingEffectiveness(state) * (def.requiresPower ? powerFactor : 1);
    const prod = getFacilityDailyProduction(def.id, difficulty);

    if (eff > 0) {
      if (prod.oxygen) {
        production.oxygen += Math.round(prod.oxygen * eff);
      }
      if (prod.water) {
        production.water += Math.round(prod.water * eff);
      }
      if (prod.food) {
        production.food += Math.round(prod.food * eff);
      }
    }

    const opCost = getFacilityDailyConsumption(def);
    if (opCost.water) {
      consumption.water += opCost.water;
    }
  }

  if (cropDef && buildings.greenhouse.status !== 'inactive' && !greenhouseCrop?.isMature) {
    consumption.water += cropDef.dailyWaterNeed;
  }

  // Water recycling share metric (reported from Water Recovery output without double-adding)
  const recyclerState = buildings.water_recycling;
  const recyclerDef = BUILDING_LIST.find((b) => b.id === 'water_recycling')!;
  const waterRecycled =
    recyclerState.status !== 'inactive' && hasPowerForLifeSupport
      ? Math.round(production.water * (recyclerDef.waterRecoveryRate ?? 0.75))
      : 0;

  const net = {} as Record<ResourceType, ResourceNetRate>;
  for (const key of RESOURCE_ORDER) {
    net[key] = {
      production: production[key],
      consumption: consumption[key],
      net: production[key] - consumption[key],
    };
  }

  return {
    production,
    consumption,
    waterRecycled,
    net,
    hasPowerForLifeSupport,
  };
}

export const MARTIAN_DAYTIME_START = 7.0; // 7:00 AM (matches Martian sunrise -> daylight)
export const MARTIAN_DAYTIME_END = 17.5; // 5:30 PM (before dusk fade)

export function isMartianDaytimeHour(hoursElapsed: number): boolean {
  return hoursElapsed >= MARTIAN_DAYTIME_START && hoursElapsed < MARTIAN_DAYTIME_END;
}

export function isSunnyMartianWeather(activeEvent: ActiveEvent | null): boolean {
  if (!activeEvent) return true;
  if (
    activeEvent.definition.phenomenon === 'global_dust_storm' ||
    activeEvent.definition.phenomenon === 'dust_devils'
  ) {
    return false;
  }
  return !(
    activeEvent.definition.solarPenaltyFactor &&
    activeEvent.definition.solarPenaltyFactor > 0
  );
}

export type SolarHourlyMode = 'full' | 'reduced' | 'stopped';

export function evaluateSolarHourlyMode(
  solar: BuildingState | undefined,
  activeEvent: ActiveEvent | null
): { mode: SolarHourlyMode; reason: string } {
  if (!solar || solar.status === 'inactive' || solar.status === 'maintenance') {
    return { mode: 'stopped', reason: 'Offline — restore to generate' };
  }
  if (solar.dustLevel >= 85) {
    return { mode: 'stopped', reason: 'Heavy dust blocking panels (0/hr)' };
  }
  if ((solar.frostLevel ?? 0) >= 75) {
    return { mode: 'stopped', reason: 'Heavy frost blocking panels (0/hr)' };
  }
  if (
    solar.malfunctionKind === 'disrupted' &&
    (solar.malfunctionDaysRemaining ?? 0) > 0
  ) {
    return { mode: 'stopped', reason: 'Storm disrupted — clean/repair (0/hr)' };
  }
  if (activeEvent?.definition.phenomenon === 'global_dust_storm') {
    return { mode: 'stopped', reason: 'Global dust blackout (0/hr)' };
  }

  const dimmedByWeather = !isSunnyMartianWeather(activeEvent);
  const hasElectricalFault =
    (solar.malfunctionDaysRemaining ?? 0) > 0 &&
    (solar.malfunctionKind === 'electrical' ||
      solar.malfunctionKind === 'electronic' ||
      solar.malfunctionKind === 'frost');
  const moderateDust = solar.dustLevel >= 55;
  const moderateFrost = (solar.frostLevel ?? 0) >= 35;
  const hullDamaged = solar.status === 'damaged';

  if (dimmedByWeather) {
    return { mode: 'reduced', reason: 'Hazy weather dimming sun (+0.5/hr)' };
  }
  if (hasElectricalFault) {
    return { mode: 'reduced', reason: 'Storm fault — partial charge (+0.5/hr)' };
  }
  if (moderateFrost) {
    return { mode: 'reduced', reason: 'Frost buildup reducing rate (+0.5/hr)' };
  }
  if (moderateDust) {
    return { mode: 'reduced', reason: 'Dusty panels — partial charge (+0.5/hr)' };
  }
  if (hullDamaged) {
    return { mode: 'reduced', reason: 'Damaged panels — partial rate (+0.5/hr)' };
  }

  return { mode: 'full', reason: 'Sunny daytime (+1/hr active)' };
}

/**
 * Generates +1 energy unit per sunny Martian daytime hour crossed (7:00 AM – 5:00 PM),
 * adjusts to +1 every 2 hours during hazy weather or minor panel faults,
 * and stops at night or during heavy blockages / global dust storms.
 */
export function computeHourlySolarEnergyGain(params: {
  prevHours: number;
  nextHours: number;
  buildings: Record<BuildingId, BuildingState>;
  activeEvent: ActiveEvent | null;
}): number {
  const { prevHours, nextHours, buildings, activeEvent } = params;
  if (nextHours <= prevHours) return 0;

  const { mode } = evaluateSolarHourlyMode(buildings.solar_panels, activeEvent);
  if (mode === 'stopped') return 0;

  const startTick = Math.floor(prevHours);
  const endTick = Math.floor(nextHours);
  if (endTick <= startTick) return 0;

  let gained = 0;
  for (let h = startTick + 1; h <= endTick; h++) {
    // Daytime hour ticks from 7:00 AM through 5:00 PM (17:00)
    if (h >= 7 && h <= 17) {
      if (mode === 'full') {
        gained += 1;
      } else if (h % 2 === 0) {
        // Forgiving reduced rate (+0.5/hr average) on hazy or partially worn daytime hours
        gained += 1;
      }
    }
  }
  return gained;
}

export interface EnergySourceStat {
  buildingId: BuildingId;
  name: string;
  shortName: string;
  status: BuildingState['status'];
  maxDailyCapacity: number;
  currentDailyOutput: number;
  hourlyDaytimeRate: number;
  maxHourlyDaytimeRate: number;
  contributionPct: number;
  note: string;
}

export interface EnergyGenerationStats {
  sources: EnergySourceStat[];
  totalMaxDailyCapacity: number;
  totalCurrentDailyOutput: number;
  totalDailyDemand: number;
  netDailyEnergy: number;
  currentHourlyRate: number;
  isSunnyDaytimeNow: boolean;
}

export function calculateEnergyGenerationStats(params: {
  buildings: Record<BuildingId, BuildingState>;
  currentResources: ResourceAmounts;
  greenhouseCrop: PlantedCrop | null;
  activeEvent: ActiveEvent | null;
  modifiers?: MissionModifiers;
  hoursElapsed: number;
  difficulty?: DifficultyLevel;
}): EnergyGenerationStats {
  const {
    buildings,
    currentResources,
    greenhouseCrop,
    activeEvent,
    modifiers,
    hoursElapsed,
    difficulty = 'medium',
  } = params;

  const rates = calculateDailyRates({
    buildings,
    currentResources,
    greenhouseCrop,
    activeEvent,
    modifiers,
    difficulty,
  });

  const isDaytimeNow = isMartianDaytimeHour(hoursElapsed);
  const isSunnyNow = isSunnyMartianWeather(activeEvent);
  const isSunnyDaytimeNow = isDaytimeNow && isSunnyNow;

  const generatorDefs = BUILDING_LIST.filter((def) => (def.dailyProduction.energy ?? 0) > 0);

  const rawSources = generatorDefs.map((def) => {
    const bState = buildings[def.id];
    const baseCap =
      getFacilityDailyProduction(def.id, difficulty).energy ?? def.dailyProduction.energy ?? 0;
    const isSolar = def.id === 'solar_panels';

    const bonusFactor =
      isSolar && modifiers?.solarOutputBonusPct
        ? Math.max(0.5, 1 + modifiers.solarOutputBonusPct / 100)
        : 1;
    const weatherFactor =
      isSolar && activeEvent?.definition.solarPenaltyFactor
        ? Math.max(0.25, 1 - activeEvent.definition.solarPenaltyFactor)
        : 1;

    const maxDailyCapacity = Math.round(baseCap * bonusFactor);
    const eff = getBuildingEffectiveness(bState);
    const currentDailyOutput = Math.round(baseCap * eff * bonusFactor * weatherFactor);

    const hourlyEval = isSolar
      ? evaluateSolarHourlyMode(bState, activeEvent)
      : { mode: 'stopped' as SolarHourlyMode, reason: 'Active' };
    const hourlyDaytimeRate = !isSolar || !isDaytimeNow
      ? 0
      : hourlyEval.mode === 'full'
      ? 1
      : hourlyEval.mode === 'reduced'
      ? 0.5
      : 0;
    const maxHourlyDaytimeRate = isSolar ? 1 : 0;

    let note = 'Active';
    if (bState.status === 'inactive') {
      note = 'Offline — restore to generate';
    } else if (isSolar) {
      if (hourlyEval.mode === 'stopped') {
        note = hourlyEval.reason;
      } else if (!isDaytimeNow) {
        note =
          hourlyEval.mode === 'reduced'
            ? 'Night — +0.5/hr at 7:00 AM'
            : 'Night/twilight — +1/hr at 7:00 AM';
      } else {
        note = hourlyEval.reason;
      }
    }

    return {
      buildingId: def.id,
      name: def.name,
      shortName: def.shortName,
      status: bState.status,
      maxDailyCapacity,
      currentDailyOutput,
      hourlyDaytimeRate,
      maxHourlyDaytimeRate,
      contributionPct: 0,
      note,
    };
  });

  const totalMaxDailyCapacity = rawSources.reduce((sum, s) => sum + s.maxDailyCapacity, 0);
  const totalCurrentDailyOutput = rawSources.reduce((sum, s) => sum + s.currentDailyOutput, 0);
  const currentHourlyRate = rawSources.reduce((sum, s) => sum + s.hourlyDaytimeRate, 0);

  const sources: EnergySourceStat[] = rawSources.map((s) => ({
    ...s,
    contributionPct:
      totalCurrentDailyOutput > 0
        ? Math.round((s.currentDailyOutput / totalCurrentDailyOutput) * 100)
        : 0,
  }));

  return {
    sources,
    totalMaxDailyCapacity,
    totalCurrentDailyOutput,
    totalDailyDemand: rates.consumption.energy,
    netDailyEnergy: rates.net.energy.net,
    currentHourlyRate,
    isSunnyDaytimeNow,
  };
}

export function detectResourceShortages(
  resources: ResourceAmounts
): ResourceType[] {
  const shortages: ResourceType[] = [];
  for (const key of RESOURCE_ORDER) {
    if (resources[key] <= RESOURCE_CONFIGS[key].criticalThreshold) {
      shortages.push(key);
    }
  }
  return shortages;
}
