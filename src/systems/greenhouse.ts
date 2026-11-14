import { CROP_MAP } from '../data/crops';
import { computeWorkClockMetrics, TOTAL_DAY_HOURS } from '../data/mission';
import { BuildingId, BuildingState } from '../types/building';
import { PlantedCrop } from '../types/game';
import { ResourceAmounts } from '../types/resource';
import { getBuildingEffectiveness } from './buildings';
import { canAffordResources, deductResources } from './resources';

export function canPlantCrop(params: {
  cropId: string;
  greenhouse: BuildingState;
  currentCrop: PlantedCrop | null;
  resources: ResourceAmounts;
  hoursElapsed: number;
  inShelter?: boolean;
  preAppliedTimeHours?: number;
}): { ok: boolean; reason?: string } {
  const {
    cropId,
    greenhouse,
    currentCrop,
    resources,
    hoursElapsed,
    inShelter = false,
    preAppliedTimeHours = 0,
  } = params;
  const def = CROP_MAP[cropId];
  if (!def) return { ok: false, reason: 'Unknown crop' };

  if (inShelter) {
    return { ok: false, reason: 'Crew is sheltering inside Radiation Storm Shelter' };
  }

  if (greenhouse.status === 'inactive') {
    return { ok: false, reason: 'Restore the Greenhouse before planting' };
  }

  if (currentCrop) {
    return { ok: false, reason: 'A crop is already growing in the Greenhouse' };
  }

  if (hoursElapsed + Math.max(0, 1 - preAppliedTimeHours) > TOTAL_DAY_HOURS) {
    return { ok: false, reason: 'Past Sol end — End Sol to sleep' };
  }

  if (
    !canAffordResources(resources, {
      water: def.seedWaterCost,
      energy: def.seedEnergyCost,
    })
  ) {
    return {
      ok: false,
      reason: `Needs ${def.seedWaterCost} Water and ${def.seedEnergyCost} Energy`,
    };
  }

  return { ok: true };
}

export function plantCropInGreenhouse(params: {
  cropId: string;
  day: number;
  resources: ResourceAmounts;
  hoursElapsed: number;
  preAppliedTimeHours?: number;
}): {
  crop: PlantedCrop;
  resources: ResourceAmounts;
  hoursElapsed: number;
  hoursRemaining: number;
  overtimeHours: number;
} {
  const { cropId, day, resources, hoursElapsed, preAppliedTimeHours = 0 } = params;
  const def = CROP_MAP[cropId];
  const clock = computeWorkClockMetrics(hoursElapsed + Math.max(0, 1 - preAppliedTimeHours));

  return {
    crop: {
      cropId,
      plantedDay: day,
      growthProgress: 0,
      growthDaysRequired: def.growthDays,
      isMature: false,
      health: 100,
    },
    resources: deductResources(resources, {
      water: def.seedWaterCost,
      energy: def.seedEnergyCost,
    }),
    ...clock,
  };
}

export function advanceCropGrowth(params: {
  crop: PlantedCrop | null;
  buildings: Record<BuildingId, BuildingState>;
  hadEnoughWater: boolean;
  hadEnoughEnergy: boolean;
  eventPenalty?: number;
  cropBoostDaysLeft?: number;
}): { crop: PlantedCrop | null; growthDelta: number; justMatured: boolean } {
  const {
    crop,
    buildings,
    hadEnoughWater,
    hadEnoughEnergy,
    eventPenalty = 0,
    cropBoostDaysLeft = 0,
  } = params;
  if (!crop) return { crop: null, growthDelta: 0, justMatured: false };
  if (crop.isMature) return { crop, growthDelta: 0, justMatured: false };

  const greenhouse = buildings.greenhouse;
  if (greenhouse.status === 'inactive' || !hadEnoughWater || !hadEnoughEnergy) {
    return {
      crop: {
        ...crop,
        health: Math.max(20, crop.health - 15),
      },
      growthDelta: 0,
      justMatured: false,
    };
  }

  const eff = getBuildingEffectiveness(greenhouse);
  const boost = cropBoostDaysLeft > 0 ? 0.35 : 0;
  const rawGrowth = Math.max(0.3, eff + boost - eventPenalty);
  const nextProgress = Math.min(
    crop.growthDaysRequired,
    Number((crop.growthProgress + rawGrowth).toFixed(2))
  );
  const isMature = nextProgress >= crop.growthDaysRequired;

  return {
    growthDelta: Number((nextProgress - crop.growthProgress).toFixed(2)),
    justMatured: isMature && !crop.isMature,
    crop: {
      ...crop,
      growthProgress: nextProgress,
      isMature,
      health: Math.min(100, crop.health + (eff >= 0.7 ? 5 : 0)),
    },
  };
}

export function harvestMatureCrop(params: {
  crop: PlantedCrop | null;
  resources: ResourceAmounts;
  capacities: ResourceAmounts;
  hoursElapsed: number;
  inShelter?: boolean;
  preAppliedTimeHours?: number;
}): {
  crop: PlantedCrop | null;
  resources: ResourceAmounts;
  hoursElapsed: number;
  hoursRemaining: number;
  overtimeHours: number;
  harvestedAmount: number;
} {
  const {
    crop,
    resources,
    capacities,
    hoursElapsed,
    inShelter = false,
    preAppliedTimeHours = 0,
  } = params;
  const remainingHour = Math.max(0, 1 - preAppliedTimeHours);
  if (inShelter || !crop || !crop.isMature || hoursElapsed + remainingHour > TOTAL_DAY_HOURS) {
    return {
      crop,
      resources,
      ...computeWorkClockMetrics(hoursElapsed),
      harvestedAmount: 0,
    };
  }

  const def = CROP_MAP[crop.cropId];
  const healthFactor = Math.max(0.6, crop.health / 100);
  const yieldAmount = Math.round(def.harvestFoodYield * healthFactor);
  const nextFood = Math.min(capacities.food, resources.food + yieldAmount);
  const actualAdded = nextFood - resources.food;

  return {
    crop: null,
    resources: {
      ...resources,
      food: nextFood,
    },
    ...computeWorkClockMetrics(hoursElapsed + remainingHour),
    harvestedAmount: actualAdded,
  };
}
