import { BuildingDefinition, BuildingId } from '../types/building';
import { DifficultyLevel } from '../types/game';
import { ResourceAmounts, ResourceType } from '../types/resource';
import { TaskDefinition } from '../types/task';

export const DIFFICULTY_ORDER: DifficultyLevel[] = ['easy', 'medium', 'hard'];

export const DIFFICULTY_META: Record<
  DifficultyLevel,
  { label: string; summary: string }
> = {
  easy: { label: 'Easy', summary: 'More reserves & output' },
  medium: { label: 'Medium', summary: 'Standard Mars balance' },
  hard: { label: 'Hard', summary: 'Tight reserves & costs' },
};

// 1. Starting Values
export const STARTING_VALUES: Record<
  DifficultyLevel,
  {
    health: number;
    stamina: number;
    resources: ResourceAmounts;
    availableHours: number;
  }
> = {
  easy: {
    health: 100,
    stamina: 100,
    resources: { oxygen: 50, water: 50, food: 30, energy: 60 },
    availableHours: 16,
  },
  medium: {
    health: 100,
    stamina: 100,
    resources: { oxygen: 45, water: 45, food: 24, energy: 55 },
    availableHours: 16,
  },
  hard: {
    health: 100,
    stamina: 100,
    resources: { oxygen: 44, water: 44, food: 24, energy: 52 },
    availableHours: 16,
  },
};

// 2. Daily Crew Consumption
export const DAILY_CREW_CONSUMPTION: Record<DifficultyLevel, ResourceAmounts> = {
  easy: { oxygen: 8, water: 8, food: 2, energy: 5 },
  medium: { oxygen: 10, water: 10, food: 3, energy: 6 },
  hard: { oxygen: 12, water: 11, food: 4, energy: 7 },
};

export interface TaskDifficultyCost {
  timeHours: number;
  crewEnergyCost: number;
  resourceCost: Partial<ResourceAmounts>;
}

// 3. Infrastructure Repair Costs (Hours / Stamina / Water / Energy)
export const INFRASTRUCTURE_REPAIR_COSTS: Partial<
  Record<BuildingId, Record<DifficultyLevel, TaskDifficultyCost>>
> = {
  solar_panels: {
    easy: { timeHours: 4, crewEnergyCost: 20, resourceCost: { energy: 3 } },
    medium: { timeHours: 4, crewEnergyCost: 25, resourceCost: { energy: 4 } },
    hard: { timeHours: 4, crewEnergyCost: 30, resourceCost: { energy: 5 } },
  },
  radiation_shelter: {
    easy: { timeHours: 4, crewEnergyCost: 20, resourceCost: { water: 2, energy: 7 } },
    medium: { timeHours: 4, crewEnergyCost: 25, resourceCost: { water: 3, energy: 8 } },
    hard: { timeHours: 4, crewEnergyCost: 30, resourceCost: { water: 4, energy: 10 } },
  },
  oxygen_generator: {
    easy: { timeHours: 4, crewEnergyCost: 20, resourceCost: { energy: 7 } },
    medium: { timeHours: 4, crewEnergyCost: 25, resourceCost: { energy: 8 } },
    hard: { timeHours: 4, crewEnergyCost: 30, resourceCost: { energy: 10 } },
  },
  oxygen_storage: {
    easy: { timeHours: 3, crewEnergyCost: 12, resourceCost: { energy: 4 } },
    medium: { timeHours: 3, crewEnergyCost: 15, resourceCost: { energy: 5 } },
    hard: { timeHours: 3, crewEnergyCost: 18, resourceCost: { energy: 6 } },
  },
  energy_storage: {
    easy: { timeHours: 3, crewEnergyCost: 16, resourceCost: { energy: 5 } },
    medium: { timeHours: 3, crewEnergyCost: 20, resourceCost: { energy: 6 } },
    hard: { timeHours: 3, crewEnergyCost: 24, resourceCost: { energy: 8 } },
  },
  water_recycling: {
    easy: { timeHours: 4, crewEnergyCost: 20, resourceCost: { water: 2, energy: 7 } },
    medium: { timeHours: 4, crewEnergyCost: 25, resourceCost: { water: 3, energy: 8 } },
    hard: { timeHours: 4, crewEnergyCost: 30, resourceCost: { water: 4, energy: 10 } },
  },
  water_storage: {
    easy: { timeHours: 3, crewEnergyCost: 12, resourceCost: { water: 2, energy: 4 } },
    medium: { timeHours: 3, crewEnergyCost: 15, resourceCost: { water: 3, energy: 5 } },
    hard: { timeHours: 3, crewEnergyCost: 18, resourceCost: { water: 4, energy: 6 } },
  },
  maintenance_facility: {
    easy: { timeHours: 3, crewEnergyCost: 16, resourceCost: { energy: 5 } },
    medium: { timeHours: 3, crewEnergyCost: 20, resourceCost: { energy: 6 } },
    hard: { timeHours: 3, crewEnergyCost: 24, resourceCost: { energy: 8 } },
  },
  food_storage: {
    easy: { timeHours: 3, crewEnergyCost: 12, resourceCost: { energy: 4 } },
    medium: { timeHours: 3, crewEnergyCost: 15, resourceCost: { energy: 5 } },
    hard: { timeHours: 3, crewEnergyCost: 18, resourceCost: { energy: 6 } },
  },
  greenhouse: {
    easy: { timeHours: 5, crewEnergyCost: 24, resourceCost: { water: 4, energy: 8 } },
    medium: { timeHours: 5, crewEnergyCost: 30, resourceCost: { water: 4, energy: 9 } },
    hard: { timeHours: 5, crewEnergyCost: 36, resourceCost: { water: 5, energy: 11 } },
  },
};

// 4. Maintenance Costs & Intervals
export const MAINTENANCE_COSTS: Partial<
  Record<BuildingId, Record<DifficultyLevel, TaskDifficultyCost>>
> = {
  water_storage: {
    easy: { timeHours: 1, crewEnergyCost: 8, resourceCost: { energy: 2 } },
    medium: { timeHours: 2, crewEnergyCost: 10, resourceCost: { energy: 3 } },
    hard: { timeHours: 3, crewEnergyCost: 15, resourceCost: { energy: 5 } },
  },
  food_storage: {
    easy: { timeHours: 1, crewEnergyCost: 8, resourceCost: { energy: 2 } },
    medium: { timeHours: 2, crewEnergyCost: 10, resourceCost: { energy: 3 } },
    hard: { timeHours: 3, crewEnergyCost: 15, resourceCost: { energy: 4 } },
  },
  solar_panels: {
    easy: { timeHours: 1, crewEnergyCost: 10, resourceCost: { energy: 3 } },
    medium: { timeHours: 2, crewEnergyCost: 15, resourceCost: { energy: 4 } },
    hard: { timeHours: 3, crewEnergyCost: 20, resourceCost: { energy: 5 } },
  },
};

export const MAINTENANCE_INTERVALS: Partial<Record<BuildingId, number>> = {
  solar_panels: 3,
  water_storage: 5,
  food_storage: 5,
};

// 5. Daily Production & Battery Storage Capacity
export const DAILY_PRODUCTION_BY_DIFFICULTY: Partial<
  Record<BuildingId, Record<DifficultyLevel, Partial<ResourceAmounts>>>
> = {
  solar_panels: {
    easy: { energy: 22 },
    medium: { energy: 19 },
    hard: { energy: 17 },
  },
  oxygen_generator: {
    easy: { oxygen: 12 },
    medium: { oxygen: 12 },
    hard: { oxygen: 13 },
  },
  water_recycling: {
    easy: { water: 12 },
    medium: { water: 12 },
    hard: { water: 14 },
  },
  greenhouse: {
    easy: { food: 4 },
    medium: { food: 4 },
    hard: { food: 4 },
  },
};

export const BATTERY_STORAGE_CAPACITY_BY_DIFFICULTY: Record<DifficultyLevel, number> = {
  easy: 80,
  medium: 60,
  hard: 50,
};

// 6. Facility Operating Costs
export const FACILITY_OPERATING_COSTS: Partial<
  Record<BuildingId, Partial<ResourceAmounts>>
> = {
  oxygen_generator: { energy: 2 },
  water_recycling: { energy: 2 },
  greenhouse: { energy: 2, water: 1 },
  solar_panels: {},
  energy_storage: {},
};

// 7. Sleeping & Stamina
export const SLEEP_STAMINA_BALANCE = {
  maxStamina: 100,
  recoveryPerHour: 10,
  normalBedtimeHour: 21, // 9:00 PM
  normalWakeHour: 7, // 7:00 AM
  normalSleepHours: 10, // 9:00 PM -> 7:00 AM = 10 hours
  maxRecovery: 100,
} as const;

// 8. Disaster & Hazard Scaling Across Easy / Medium / Hard
export const DISASTER_DAMAGE_MULTIPLIER: Record<DifficultyLevel, number> = {
  easy: 0.75,
  medium: 1.0,
  hard: 1.35,
};

export const DISASTER_RESOURCE_LOSS_MULTIPLIER: Record<DifficultyLevel, number> = {
  easy: 0.75,
  medium: 1.0,
  hard: 1.35,
};

export const DISASTER_WARNING_DURATION_SEC: Record<
  DifficultyLevel,
  { minor: number; major: number }
> = {
  easy: { minor: 22, major: 28 },
  medium: { minor: 15, major: 20 },
  hard: { minor: 9, major: 12 },
};

export const MINOR_EVENT_COUNTS_BY_DIFFICULTY: Record<
  DifficultyLevel,
  { phase2: number; phase3: number; phase4: number }
> = {
  easy: { phase2: 1, phase3: 2, phase4: 2 }, // Gentle (5 minor events @ 0.75x impact)
  medium: { phase2: 1, phase3: 2, phase4: 2 }, // Moderate (5 minor events @ 1.0x impact)
  hard: { phase2: 2, phase3: 3, phase4: 2 }, // High (7 minor events @ 1.35x impact)
};

export const RADIATION_DAMAGE_OUTSIDE_SHELTER: Record<
  DifficultyLevel,
  { minorFlare: number; solarStorm: number; sep: number }
> = {
  easy: { minorFlare: 30, solarStorm: 30, sep: 60 },
  medium: { minorFlare: 60, solarStorm: 60, sep: 75 },
  hard: { minorFlare: 100, solarStorm: 100, sep: 100 },
};

export function getStartingResources(difficulty: DifficultyLevel): ResourceAmounts {
  return { ...STARTING_VALUES[difficulty].resources };
}

export function getDailyCrewConsumption(difficulty: DifficultyLevel): ResourceAmounts {
  return { ...DAILY_CREW_CONSUMPTION[difficulty] };
}

export function getFacilityDailyProduction(
  buildingId: BuildingId,
  difficulty: DifficultyLevel
): Partial<ResourceAmounts> {
  return DAILY_PRODUCTION_BY_DIFFICULTY[buildingId]?.[difficulty] ?? {};
}

export function getFacilityDailyConsumption(
  def: BuildingDefinition
): Partial<ResourceAmounts> {
  return FACILITY_OPERATING_COSTS[def.id] ?? def.dailyConsumption;
}

export function getFacilityStorageBonus(
  def: BuildingDefinition,
  difficulty: DifficultyLevel
): Partial<Record<ResourceType, number>> {
  if (def.id === 'energy_storage') {
    return { energy: BATTERY_STORAGE_CAPACITY_BY_DIFFICULTY[difficulty] };
  }
  return def.storageBonus ?? {};
}

export function getTaskDifficultyCosts(
  task: TaskDefinition,
  difficulty: DifficultyLevel
): TaskDifficultyCost {
  if (task.category === 'major') {
    const repairCost = INFRASTRUCTURE_REPAIR_COSTS[task.buildingId]?.[difficulty];
    if (repairCost) {
      return {
        timeHours: repairCost.timeHours,
        crewEnergyCost: repairCost.crewEnergyCost,
        resourceCost: { ...repairCost.resourceCost },
      };
    }
  }

  if (
    task.id === 'clean_solar_panels' ||
    task.id === 'maintain_water_storage' ||
    task.id === 'maintain_food_storage'
  ) {
    const maintCost = MAINTENANCE_COSTS[task.buildingId]?.[difficulty];
    if (maintCost) {
      return {
        timeHours: maintCost.timeHours,
        crewEnergyCost: maintCost.crewEnergyCost,
        resourceCost: { ...maintCost.resourceCost },
      };
    }
  }

  // Minor structural repair tasks scale modestly by difficulty while staying below major restoration costs
  const staminaMult = difficulty === 'easy' ? 0.8 : difficulty === 'hard' ? 1.2 : 1;
  const resourceMult = difficulty === 'easy' ? 0.8 : difficulty === 'hard' ? 1.25 : 1;
  const scaledResourceCost: Partial<ResourceAmounts> = {};
  for (const [k, v] of Object.entries(task.resourceCost) as Array<[ResourceType, number]>) {
    if (v && v > 0) {
      scaledResourceCost[k] = Math.max(1, Math.round(v * resourceMult));
    }
  }

  return {
    timeHours: task.timeHours,
    crewEnergyCost: Math.max(5, Math.round(task.crewEnergyCost * staminaMult)),
    resourceCost: scaledResourceCost,
  };
}
