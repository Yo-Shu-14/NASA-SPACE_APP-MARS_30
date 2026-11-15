import { BuildingId } from './building';
import { ResourceAmounts } from './resource';

export type ActivityCategory = 'maintenance' | 'research' | 'exploration' | 'crew';

export type CrewMemberId = 'Player' | 'Brent' | 'MJ' | 'Darryl' | 'Magno';

export type DailyActivityStatus = 'available' | 'completed' | 'ignored';

export interface CrewSpecialistProfile {
  id: CrewMemberId;
  name: string;
  role: string;
  specialty: string;
  favoredCategories: ActivityCategory[];
}

export interface ActivityReward {
  resourcesDelta?: Partial<ResourceAmounts>;
  buildingConditionDelta?: number;
  dustCleared?: number;
  crewEnergyDelta?: number;
  crewHealthDelta?: number;
  crewRadiationDelta?: number;
  solarOutputBonusPctDelta?: number;
  cropBoostDays?: number;
}

export interface ActivityConditionMatch {
  eligible: boolean;
  weight: number;
  relevanceReason: string;
  targetBuildingId?: BuildingId;
  rewardOverrides?: ActivityReward;
}

export interface DailyActivityTemplate {
  id: string;
  category: ActivityCategory;
  title: string;
  shortDesc: string;
  defaultBuildingId: BuildingId;
  isOutdoor: boolean;
  recommendedCrew: CrewMemberId;
  skillLabel: string;
  skillBonusLabel: string;
  durationHours: number;
  workDurationSec: number;
  crewEnergyCost: number;
  resourceCost: Partial<ResourceAmounts>;
  cooldownSols: number;
  minDay?: number;
  maxDay?: number;
  baseReward: ActivityReward;
  evaluateContext: (ctx: {
    day: number;
    phase: number;
    buildings: Record<BuildingId, import('./building').BuildingState>;
    resources: ResourceAmounts;
    capacities: ResourceAmounts;
    crew: import('./game').CrewState;
    greenhouseCrop: import('./game').PlantedCrop | null;
    activeEvent: import('./event').ActiveEvent | null;
    lingeringHazards: import('./game').LingeringHazard[];
  }) => ActivityConditionMatch;
}

export interface DailyActivityInstance {
  id: string;
  templateId: string;
  dayGenerated: number;
  category: ActivityCategory;
  title: string;
  shortDesc: string;
  relevanceReason: string;
  buildingId: BuildingId;
  isOutdoor: boolean;
  assignedCrew: CrewMemberId;
  skillLabel: string;
  skillBonusLabel: string;
  durationHours: number;
  workDurationSec: number;
  crewEnergyCost: number;
  resourceCost: Partial<ResourceAmounts>;
  reward: ActivityReward;
  rewardSummary: string;
  cooldownSols: number;
  status: DailyActivityStatus;
  prioritized: boolean;
}

export interface ActivityValidationResult {
  canExecute: boolean;
  reason?: string;
}
