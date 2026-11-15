import {
  CREW_SPECIALISTS,
  DAILY_ACTIVITY_TEMPLATES,
  formatActivityRewardSummary,
} from '../data/activities';
import { BUILDING_DEFINITIONS } from '../data/buildings';
import {
  computeWorkClockMetrics,
  MAX_CREW_STAMINA,
  TOTAL_DAY_HOURS,
} from '../data/mission';
import { TASK_DEFINITIONS } from '../data/tasks';
import {
  ActivityCategory,
  ActivityValidationResult,
  DailyActivityInstance,
} from '../types/activity';
import { GameState } from '../types/game';
import { applyBuildingConditionChange, getBuildingUnlockStatus } from './buildings';
import { isEventOfficiallyActive } from './events';
import { canAffordResources, clampResourcesToCapacity, deductResources } from './resources';
import { validateTask } from './tasks';
import { TOTAL_TUTORIAL_STEPS } from './tutorial';

function seededUnit(seed: number, salt: number): number {
  let x = (seed ^ Math.imul(salt + 1, 2654435761)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x ^= x >>> 16;
  return x / 4294967296;
}

export function getActivityTaskAnimKind(
  category: ActivityCategory
): 'repair' | 'clean' | 'plant' | 'harvest' {
  switch (category) {
    case 'maintenance':
      return 'repair';
    case 'research':
    case 'exploration':
      return 'clean';
    case 'crew':
    default:
      return 'harvest';
  }
}

export function getActivityCrewAvailability(
  activity: DailyActivityInstance,
  state: GameState
): { available: boolean; statusLabel: string } {
  if (state.crew.inShelter && activity.isOutdoor) {
    return { available: false, statusLabel: 'Sheltered (Outdoor blocked)' };
  }
  if (state.crew.energy < activity.crewEnergyCost) {
    return { available: false, statusLabel: 'Low Stamina' };
  }
  if (state.hoursElapsed + activity.durationHours > TOTAL_DAY_HOURS) {
    return { available: false, statusLabel: 'Late in Sol' };
  }
  if (!canAffordResources(state.resources, activity.resourceCost)) {
    return { available: false, statusLabel: 'Low Supplies' };
  }
  const specialist = CREW_SPECIALISTS[activity.assignedCrew];
  return {
    available: true,
    statusLabel: `${specialist.name} Ready`,
  };
}

/**
 * Dynamically generates 0-3 context-aware daily activities for a Sol based on
 * colony conditions, infrastructure wear, resources, crew health/stamina,
 * environmental events/hazards, and template cooldowns.
 * Allows calm/well-balanced Sols to have 0 or 1 activities so the system
 * never turns gameplay into forced busywork.
 */
export function generateDailyActivitiesForSol(state: GameState): DailyActivityInstance[] {
  // Keep Sol 1 onboarding uncluttered while tutorial is active
  if (state.day <= 1 && !state.tutorialSkipped && state.tutorialStep < TOTAL_TUTORIAL_STEPS) {
    return [];
  }

  // Count how many existing urgent repair/restoration tasks are already waiting today
  const urgentTaskCount = TASK_DEFINITIONS.filter((t) => {
    const res = validateTask(t, {
      ...state,
      crew: { ...state.crew, inShelter: false },
    });
    return res.canExecute;
  }).length;

  const isGlobalStormCrisis =
    isEventOfficiallyActive(state.activeEvent) &&
    state.activeEvent?.definition.id === 'global_dust_storm';
  const cooldowns = state.activityCooldowns ?? {};

  // Evaluate all eligible templates against current colony state
  const scoredCandidates = DAILY_ACTIVITY_TEMPLATES.map((tpl, idx) => {
    if (tpl.minDay && state.day < tpl.minDay) return null;
    if (tpl.maxDay && state.day > tpl.maxDay) return null;
    if ((cooldowns[tpl.id] ?? 0) > state.day) return null;

    const unlock = getBuildingUnlockStatus(tpl.defaultBuildingId, state);
    if (!unlock.unlocked) return null;

    const match = tpl.evaluateContext({
      day: state.day,
      phase: state.phase,
      buildings: state.buildings,
      resources: state.resources,
      capacities: state.capacities,
      crew: state.crew,
      greenhouseCrop: state.greenhouseCrop,
      activeEvent: state.activeEvent,
      lingeringHazards: state.lingeringHazards ?? [],
    });

    if (!match.eligible || match.weight <= 0) return null;

    const targetBuildingId = match.targetBuildingId ?? tpl.defaultBuildingId;
    const reward = match.rewardOverrides ?? tpl.baseReward;
    // Slight deterministic jitter (+0..9) to keep ties fresh without breaking relevance priority
    const jitter = seededUnit(state.seed, state.day * 97 + idx) * 9;

    return {
      tpl,
      targetBuildingId,
      reward,
      relevanceReason: match.relevanceReason,
      score: match.weight + jitter,
    };
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (scoredCandidates.length === 0) {
    return [];
  }

  // Sort by highest contextual relevance
  scoredCandidates.sort((a, b) => b.score - a.score);

  // Determine natural activity count for this Sol
  const isCalmBalancedColony =
    !isEventOfficiallyActive(state.activeEvent) &&
    (state.lingeringHazards?.length ?? 0) === 0 &&
    urgentTaskCount === 0 &&
    state.crew.condition >= 85 &&
    state.crew.energy >= 70 &&
    state.resources.oxygen >= 50 &&
    state.resources.water >= 50 &&
    state.resources.food >= 35 &&
    state.resources.energy >= 50;

  const roll = seededUnit(state.seed, state.day * 313 + 17);

  let targetCount = 2;
  if (isGlobalStormCrisis || urgentTaskCount >= 4) {
    // Heavy crisis / busy repair Sol: at most 0–1 urgent support activity (indoor/crew/rad preferred)
    targetCount = roll < 0.35 ? 0 : 1;
  } else if (isCalmBalancedColony) {
    // Peaceful, well-kept Sol: sometimes 0 (quiet Sol!), otherwise 1–2 optional enrichment ops
    if (roll < 0.28) {
      targetCount = 0;
    } else if (roll < 0.72) {
      targetCount = 1;
    } else {
      targetCount = 2;
    }
  } else if (urgentTaskCount >= 2) {
    targetCount = roll < 0.45 ? 1 : 2;
  } else {
    // Quiet repair day but with clear colony needs: 2 to 3 varied activities
    targetCount = roll < 0.22 ? 1 : roll < 0.72 ? 2 : 3;
  }

  if (targetCount === 0) {
    return [];
  }

  // Pick diverse categories (avoid repeating same category or same crew lead on the same Sol)
  const picked: typeof scoredCandidates = [];
  const usedCategories = new Set<ActivityCategory>();
  const usedCrew = new Set<string>();

  for (const cand of scoredCandidates) {
    if (picked.length >= targetCount) break;
    // During global dust storm or high-rad storm, prioritize indoor/crew safety options first
    if (isGlobalStormCrisis && cand.tpl.isOutdoor && picked.length === 0) {
      continue;
    }
    if (usedCategories.has(cand.tpl.category)) continue;
    if (usedCrew.has(cand.tpl.recommendedCrew) && scoredCandidates.length > targetCount) continue;

    picked.push(cand);
    usedCategories.add(cand.tpl.category);
    usedCrew.add(cand.tpl.recommendedCrew);
  }

  // Backfill if crew diversity skipped candidates while we still want targetCount
  if (picked.length < targetCount) {
    for (const cand of scoredCandidates) {
      if (picked.length >= targetCount) break;
      if (picked.some((p) => p.tpl.id === cand.tpl.id)) continue;
      if (usedCategories.has(cand.tpl.category)) continue;
      picked.push(cand);
      usedCategories.add(cand.tpl.category);
    }
  }

  return picked.map(({ tpl, targetBuildingId, reward, relevanceReason }) => ({
    id: `sol${state.day}_${tpl.id}`,
    templateId: tpl.id,
    dayGenerated: state.day,
    category: tpl.category,
    title: tpl.title,
    shortDesc: tpl.shortDesc,
    relevanceReason,
    buildingId: targetBuildingId,
    isOutdoor: tpl.isOutdoor,
    assignedCrew: tpl.recommendedCrew,
    skillLabel: tpl.skillLabel,
    skillBonusLabel: tpl.skillBonusLabel,
    durationHours: tpl.durationHours,
    workDurationSec: tpl.workDurationSec,
    crewEnergyCost: tpl.crewEnergyCost,
    resourceCost: { ...tpl.resourceCost },
    reward: { ...reward },
    rewardSummary: formatActivityRewardSummary(reward, targetBuildingId),
    cooldownSols: tpl.cooldownSols,
    status: 'available',
    prioritized: false,
  }));
}

export function validateDailyActivity(
  activity: DailyActivityInstance,
  state: GameState,
  preAppliedTimeHours = state.pendingAction?.timeHoursApplied ?? 0
): ActivityValidationResult {
  if (state.screen !== 'PLAYING' && state.screen !== 'PAUSED') {
    return { canExecute: false, reason: 'Mission inactive' };
  }
  if (state.sleepPhase !== 'idle' || state.sleepingRemaining > 0) {
    return { canExecute: false, reason: 'Crew is returning to rest' };
  }
  if (state.pendingAction?.phase === 'working') {
    return { canExecute: false, reason: 'Crew is busy finishing an action' };
  }
  if (activity.status !== 'available') {
    return {
      canExecute: false,
      reason: activity.status === 'completed' ? 'Already completed today' : 'Dismissed for today',
    };
  }
  if (state.crew.inShelter && activity.isOutdoor) {
    return {
      canExecute: false,
      reason: 'Crew is in Shelter — Go Outside for outdoor ops',
    };
  }

  const building = state.buildings[activity.buildingId];
  const unlock = getBuildingUnlockStatus(activity.buildingId, state);
  if (!unlock.unlocked) {
    return {
      canExecute: false,
      reason: unlock.shortReason ?? 'Facility locked',
    };
  }
  if (
    activity.buildingId !== 'main_habitat' &&
    activity.category !== 'exploration' &&
    (!building.restoredOnce || building.status === 'inactive')
  ) {
    const bName = BUILDING_DEFINITIONS[activity.buildingId].shortName;
    return {
      canExecute: false,
      reason: `Restore ${bName} first`,
    };
  }

  if (
    state.hoursElapsed + Math.max(0, activity.durationHours - preAppliedTimeHours) >
    TOTAL_DAY_HOURS
  ) {
    return {
      canExecute: false,
      reason: `Not enough time left today (needs ${activity.durationHours}h)`,
    };
  }

  if (state.crew.energy < activity.crewEnergyCost) {
    return {
      canExecute: false,
      reason: 'Crew stamina too low — Rest or choose a Crew recovery activity',
    };
  }

  if (!canAffordResources(state.resources, activity.resourceCost)) {
    return {
      canExecute: false,
      reason: 'Not enough supplies',
    };
  }

  return { canExecute: true };
}

export function applyDailyActivityExecution(
  activity: DailyActivityInstance,
  state: GameState,
  preAppliedTimeHours = 0
): GameState {
  const validation = validateDailyActivity(activity, state, preAppliedTimeHours);
  if (!validation.canExecute) {
    return state;
  }

  let nextResources = deductResources(state.resources, activity.resourceCost);
  if (activity.reward.resourcesDelta) {
    nextResources = {
      oxygen: nextResources.oxygen + (activity.reward.resourcesDelta.oxygen ?? 0),
      water: nextResources.water + (activity.reward.resourcesDelta.water ?? 0),
      food: nextResources.food + (activity.reward.resourcesDelta.food ?? 0),
      energy: nextResources.energy + (activity.reward.resourcesDelta.energy ?? 0),
    };
  }
  nextResources = clampResourcesToCapacity(nextResources, state.capacities);

  let nextBuildings = { ...state.buildings };
  const targetB = nextBuildings[activity.buildingId];
  if (
    targetB &&
    ((activity.reward.buildingConditionDelta ?? 0) !== 0 || (activity.reward.dustCleared ?? 0) > 0)
  ) {
    let updatedB = applyBuildingConditionChange(
      targetB,
      activity.reward.buildingConditionDelta ?? 0,
      false
    );
    if (activity.reward.dustCleared) {
      updatedB = {
        ...updatedB,
        dustLevel: Math.max(0, updatedB.dustLevel - activity.reward.dustCleared),
      };
    }
    if (activity.category === 'maintenance') {
      updatedB = {
        ...updatedB,
        timesMaintained: updatedB.timesMaintained + 1,
        lastMaintainedDay: state.day,
      };
    }
    nextBuildings = {
      ...nextBuildings,
      [activity.buildingId]: updatedB,
    };
  }

  const nextEnergy = Math.max(
    0,
    Math.min(
      MAX_CREW_STAMINA,
      state.crew.energy - activity.crewEnergyCost + (activity.reward.crewEnergyDelta ?? 0)
    )
  );
  const nextCondition = Math.max(
    0,
    Math.min(100, state.crew.condition + (activity.reward.crewHealthDelta ?? 0))
  );
  const nextRadiation = Math.max(
    0,
    Math.min(100, state.crew.radiationExposure + (activity.reward.crewRadiationDelta ?? 0))
  );

  const nextModifiers = {
    ...state.modifiers,
    solarOutputBonusPct: Math.min(
      35,
      state.modifiers.solarOutputBonusPct + (activity.reward.solarOutputBonusPctDelta ?? 0)
    ),
    cropBoostDaysLeft:
      state.modifiers.cropBoostDaysLeft + (activity.reward.cropBoostDays ?? 0),
  };

  const remainingHoursToAdd = Math.max(0, activity.durationHours - preAppliedTimeHours);
  const clock = computeWorkClockMetrics(state.hoursElapsed + remainingHoursToAdd);

  const nextActivities = state.dailyActivities.map((item) =>
    item.id === activity.id ? { ...item, status: 'completed' as const } : item
  );
  const nextCooldowns = {
    ...(state.activityCooldowns ?? {}),
    [activity.templateId]: state.day + activity.cooldownSols,
  };

  return {
    ...state,
    ...clock,
    ongoingTask: null,
    pendingAction: null,
    resources: nextResources,
    buildings: nextBuildings,
    crew: {
      ...state.crew,
      energy: nextEnergy,
      condition: nextCondition,
      radiationExposure: nextRadiation,
    },
    modifiers: nextModifiers,
    dailyActivities: nextActivities,
    activityCooldowns: nextCooldowns,
    dailyActivitiesCompleted: (state.dailyActivitiesCompleted ?? 0) + 1,
  };
}
