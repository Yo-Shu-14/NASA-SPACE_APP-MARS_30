import { CropDefinition } from '../types/game';

export const CROP_DEFINITIONS: CropDefinition[] = [
  {
    id: 'mars_potatoes',
    name: 'Mars Potatoes',
    growthDays: 9,
    seedWaterCost: 6,
    seedEnergyCost: 4,
    dailyWaterNeed: 0,
    dailyEnergyNeed: 0,
    harvestFoodYield: 100,
    description: 'Hardy, calorie-rich tubers taking 9 Martian sols to reach full harvest.',
  },
  {
    id: 'dwarf_wheat',
    name: 'Dwarf Wheat & Greens',
    growthDays: 7,
    seedWaterCost: 5,
    seedEnergyCost: 4,
    dailyWaterNeed: 0,
    dailyEnergyNeed: 0,
    harvestFoodYield: 78,
    description: 'Fast-growing hydroponic grain and leafy greens ready in 7 Martian sols.',
  },
];

export const CROP_MAP: Record<string, CropDefinition> = Object.fromEntries(
  CROP_DEFINITIONS.map((crop) => [crop.id, crop])
);
