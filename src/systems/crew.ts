import { STARTING_VALUES } from '../data/balance';
import {
  calculateSleepRecovery,
  computeWorkClockMetrics,
  MAX_CREW_STAMINA,
  TOTAL_DAY_HOURS,
} from '../data/mission';
import { BuildingId, BuildingState } from '../types/building';
import { CrewState, DifficultyLevel } from '../types/game';

export function createInitialCrew(difficulty: DifficultyLevel = 'medium'): CrewState {
  const start = STARTING_VALUES[difficulty];
  return {
    energy: start.stamina,
    condition: start.health,
    radiationExposure: 5,
    inShelter: false,
    restedToday: false,
  };
}

export function performCrewShortRest(
  crew: CrewState,
  hoursElapsed: number,
  buildings: Record<BuildingId, BuildingState>
): {
  crew: CrewState;
  hoursElapsed: number;
  hoursRemaining: number;
  overtimeHours: number;
  rested: boolean;
} {
  if (hoursElapsed + 2 > TOTAL_DAY_HOURS || crew.energy >= 98) {
    return {
      crew,
      ...computeWorkClockMetrics(hoursElapsed),
      rested: false,
    };
  }

  const habOperational = buildings.main_habitat.status === 'operational';
  const recovery = habOperational ? 28 : 16;

  return {
    ...computeWorkClockMetrics(hoursElapsed + 2),
    rested: true,
    crew: {
      ...crew,
      energy: Math.min(MAX_CREW_STAMINA, crew.energy + recovery),
      restedToday: true,
    },
  };
}

export function resolveDailyCrewRecovery(params: {
  crew: CrewState;
  buildings: Record<BuildingId, BuildingState>;
  shortages: string[];
  radiationGain: number;
  lingeringHazardDamage?: number;
  overtimeHours?: number;
  overtimeFatiguePenalty?: number;
  skipRadiationConditionPenalty?: boolean;
}): {
  crew: CrewState;
  energyRecovered: number;
  fatiguePenalty: number;
  sleepHours: number;
  healthDelta: number;
} {
  const {
    crew,
    buildings,
    shortages,
    radiationGain,
    lingeringHazardDamage = 0,
    overtimeHours = 0,
    skipRadiationConditionPenalty = false,
  } = params;
  const habitat = buildings.main_habitat;

  const { sleepHours, staminaRecovery } = calculateSleepRecovery(overtimeHours);
  const nextEnergy = Math.min(MAX_CREW_STAMINA, crew.energy + staminaRecovery);
  const energyRecovered = Math.max(0, nextEnergy - crew.energy);
  const fatiguePenalty = Math.max(0, MAX_CREW_STAMINA - staminaRecovery);

  const nextRadiation = Math.max(
    0,
    Math.min(
      100,
      crew.radiationExposure +
        radiationGain -
        (radiationGain === 0 && !skipRadiationConditionPenalty ? 1 : 0)
    )
  );

  let conditionDelta = 0;
  if (shortages.length > 0) {
    conditionDelta -= shortages.length * 8;
  } else if (habitat.status === 'operational' && nextRadiation < 40 && lingeringHazardDamage === 0) {
    conditionDelta += 3;
  } else if (habitat.status === 'operational' && nextRadiation < 40) {
    conditionDelta += 1;
  }

  if (lingeringHazardDamage > 0) {
    conditionDelta -= lingeringHazardDamage;
  }

  if (!skipRadiationConditionPenalty && radiationGain >= 15) {
    conditionDelta -= Math.round(radiationGain * 0.3);
  }

  const nextCondition = Math.max(0, Math.min(100, crew.condition + conditionDelta));
  const actualHealthDelta = nextCondition - crew.condition;

  return {
    energyRecovered,
    fatiguePenalty,
    sleepHours,
    healthDelta: actualHealthDelta,
    crew: {
      energy: nextEnergy,
      condition: nextCondition,
      radiationExposure: nextRadiation,
      inShelter: false,
      restedToday: false,
    },
  };
}
