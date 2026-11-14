import { BuildingId } from './building';
import { ResourceAmounts } from './resource';

export type TaskCategory = 'major' | 'minor';
export type ObjectivePriority = 'mandatory' | 'optional';

export interface TaskDefinition {
  id: string;
  title: string;
  description: string;
  outcomeText?: string;
  category: TaskCategory;
  objectiveType: ObjectivePriority;
  buildingId: BuildingId;
  timeHours: number;
  crewEnergyCost: number;
  resourceCost: Partial<ResourceAmounts>;
  conditionGain: number;
  dustCleared?: number;
  setsOperational?: boolean;
  requiresStatus?: Array<'operational' | 'damaged' | 'inactive' | 'maintenance'>;
  maxConditionBelow?: number;
  minDustAbove?: number;
  requiresBuildingOperational?: BuildingId;
}

export interface TaskValidationResult {
  canExecute: boolean;
  reason?: string;
}
