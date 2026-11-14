import { getTaskDifficultyCosts } from '../data/balance';
import { BUILDING_DEFINITIONS } from '../data/buildings';
import { computeWorkClockMetrics, TOTAL_DAY_HOURS } from '../data/mission';
import { TASK_DEFINITIONS } from '../data/tasks';
import { BuildingId } from '../types/building';
import { GameState } from '../types/game';
import { ResourceAmounts } from '../types/resource';
import { TaskDefinition, TaskValidationResult } from '../types/task';
import { applyBuildingConditionChange, getBuildingUnlockStatus } from './buildings';
import { canAffordResources, deductResources } from './resources';

export function getTasksForBuilding(buildingId: BuildingId): TaskDefinition[] {
  return TASK_DEFINITIONS.filter((task) => task.buildingId === buildingId);
}

export type ProgressiveCostTier = 'early' | 'mid' | 'late';

export function getCostTierForDay(day: number): ProgressiveCostTier {
  if (day <= 10) return 'early';
  if (day <= 20) return 'mid';
  return 'late';
}

export function getEffectiveTaskCosts(
  task: TaskDefinition,
  state: GameState
): {
  timeHours: number;
  crewEnergyCost: number;
  conditionBonus: number;
  resourceCost: Partial<ResourceAmounts>;
  costTier: ProgressiveCostTier;
} {
  const workshop = state.buildings.maintenance_facility;
  const workshopOperational =
    workshop.status === 'operational' &&
    !(workshop.malfunctionDaysRemaining && workshop.malfunctionDaysRemaining > 0);
  const day = Math.max(1, state.day);
  const costTier = getCostTierForDay(day);
  const conditionBonus = workshopOperational ? 8 : 0;

  const diffCosts = getTaskDifficultyCosts(task, state.difficulty);

  return {
    timeHours: diffCosts.timeHours,
    crewEnergyCost: diffCosts.crewEnergyCost,
    conditionBonus,
    resourceCost: diffCosts.resourceCost,
    costTier,
  };
}

export function validateTask(
  task: TaskDefinition,
  state: GameState,
  preAppliedTimeHours = state.pendingAction?.timeHoursApplied ?? 0
): TaskValidationResult {
  if (state.sleepPhase !== 'idle' || state.sleepingRemaining > 0) {
    return {
      canExecute: false,
      reason: 'Crew is returning inside Habitat to rest',
    };
  }

  if (state.pendingAction?.phase === 'working') {
    return {
      canExecute: false,
      reason: 'Crew is busy finishing a task',
    };
  }

  if (state.crew.inShelter) {
    return {
      canExecute: false,
      reason: 'Crew must stay inside Radiation Storm Shelter until danger passes',
    };
  }

  const unlockStatus = getBuildingUnlockStatus(task.buildingId, state);
  if (!unlockStatus.unlocked) {
    return {
      canExecute: false,
      reason: unlockStatus.reason ?? 'Locked on Sol 1 until prerequisite systems are restored',
    };
  }

  const building = state.buildings[task.buildingId];
  const costs = getEffectiveTaskCosts(task, state);

  // Restoration rule: broken or unrestored systems cannot be cleaned, repaired, or maintained until restored first.
  if (
    task.category === 'minor' &&
    !task.setsOperational &&
    (!building.restoredOnce || building.status === 'inactive')
  ) {
    return {
      canExecute: false,
      reason: 'Restore system first',
    };
  }

  if (task.requiresStatus && !task.requiresStatus.includes(building.status)) {
    return {
      canExecute: false,
      reason: 'Already restored',
    };
  }

  const hasActiveDisruption =
    (building.frostLevel ?? 0) > 0 || (building.malfunctionDaysRemaining ?? 0) > 0;
  if (
    task.maxConditionBelow !== undefined &&
    building.condition >= task.maxConditionBelow &&
    !hasActiveDisruption
  ) {
    return {
      canExecute: false,
      reason: 'Condition is already at peak',
    };
  }

  if (task.minDustAbove !== undefined && building.dustLevel < task.minDustAbove) {
    return {
      canExecute: false,
      reason: 'Panels are already clean',
    };
  }

  if (task.requiresBuildingOperational) {
    const reqBuilding = state.buildings[task.requiresBuildingOperational];
    if (
      reqBuilding.status === 'inactive' ||
      (reqBuilding.malfunctionDaysRemaining ?? 0) > 0
    ) {
      const reqName = BUILDING_DEFINITIONS[task.requiresBuildingOperational].shortName;
      return {
        canExecute: false,
        reason: `Requires active ${reqName}`,
      };
    }
  }

  if (
    state.hoursElapsed + Math.max(0, costs.timeHours - preAppliedTimeHours) >
    TOTAL_DAY_HOURS
  ) {
    return {
      canExecute: false,
      reason: `Past Sol end (needs ${costs.timeHours}h) — End Sol`,
    };
  }

  if (state.crew.energy < costs.crewEnergyCost) {
    return {
      canExecute: false,
      reason: 'Crew too tired — Rest or End Sol',
    };
  }

  if (!canAffordResources(state.resources, costs.resourceCost)) {
    return {
      canExecute: false,
      reason: 'Not enough resources',
    };
  }

  return { canExecute: true };
}

export function applyTaskExecution(
  task: TaskDefinition,
  state: GameState,
  preAppliedTimeHours = 0
): GameState {
  const validation = validateTask(task, state, preAppliedTimeHours);
  if (!validation.canExecute) {
    return state;
  }

  const costs = getEffectiveTaskCosts(task, state);
  const currentBuilding = state.buildings[task.buildingId];
  let updatedBuilding = applyBuildingConditionChange(
    currentBuilding,
    task.conditionGain + (task.conditionGain > 10 ? costs.conditionBonus : 0),
    Boolean(task.setsOperational)
  );

  if (task.dustCleared) {
    updatedBuilding = {
      ...updatedBuilding,
      dustLevel: Math.max(0, updatedBuilding.dustLevel - task.dustCleared),
    };
  }

  // Dust-only cleaning clears dust and dust-storm disruption ('disrupted') / frost,
  // while electrical/electronic faults require structural repair (or full restoration).
  const isDustCleanOnly = task.id === 'clean_solar_panels';
  const keepElectricalFault =
    isDustCleanOnly &&
    (currentBuilding.malfunctionDaysRemaining ?? 0) > 0 &&
    (currentBuilding.malfunctionKind === 'electrical' ||
      currentBuilding.malfunctionKind === 'electronic');

  const nextMalfunctionDays = keepElectricalFault
    ? currentBuilding.malfunctionDaysRemaining ?? 0
    : 0;
  const nextMalfunctionKind = keepElectricalFault
    ? currentBuilding.malfunctionKind
    : undefined;
  const nextHasDamage =
    updatedBuilding.status !== 'operational' ||
    updatedBuilding.condition < 92 ||
    nextMalfunctionDays > 0;

  updatedBuilding = {
    ...updatedBuilding,
    frostLevel: 0,
    malfunctionDaysRemaining: nextMalfunctionDays,
    malfunctionKind: nextMalfunctionKind,
    hasVisibleDamage: nextHasDamage,
    damageCause: nextHasDamage ? updatedBuilding.damageCause : undefined,
    damageSeverity: nextHasDamage ? updatedBuilding.damageSeverity : undefined,
    timesMaintained: updatedBuilding.timesMaintained + 1,
    lastMaintainedDay: state.day,
  };

  const nextResources = deductResources(state.resources, costs.resourceCost);
  const buildingDef = BUILDING_DEFINITIONS[task.buildingId];

  const decisionNote =
    task.category === 'major'
      ? `Sol ${state.day}: Restored ${buildingDef.name}`
      : null;

  const remainingHoursToAdd = Math.max(0, costs.timeHours - preAppliedTimeHours);
  const clock = computeWorkClockMetrics(state.hoursElapsed + remainingHoursToAdd);

  return {
    ...state,
    ...clock,
    ongoingTask: null,
    pendingAction: null,
    resources: nextResources,
    crew: {
      ...state.crew,
      energy: Math.max(0, state.crew.energy - costs.crewEnergyCost),
    },
    buildings: {
      ...state.buildings,
      [task.buildingId]: updatedBuilding,
    },
    totalTasksCompleted: state.totalTasksCompleted + 1,
    majorTasksCompleted:
      state.majorTasksCompleted + (task.category === 'major' ? 1 : 0),
    minorTasksCompleted:
      state.minorTasksCompleted + (task.category === 'minor' ? 1 : 0),
    keyDecisions: decisionNote
      ? [...state.keyDecisions, decisionNote]
      : state.keyDecisions,
  };
}
