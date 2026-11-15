import { BUILDING_DEFINITIONS, BUILDING_LIST } from '../data/buildings';
import { CROP_MAP } from '../data/crops';
import { EVENT_DEFINITIONS } from '../data/events';
import {
  computeWorkClockMetrics,
  getPhaseForDay,
  MAX_DAILY_HOURS,
  MAX_MISSION_DAYS,
  TOTAL_DAY_HOURS,
  WORK_START_HOUR,
} from '../data/mission';
import { calculateResourceCapacities, createInitialBuildings } from '../systems/buildings';
import { clampResourcesToCapacity } from '../systems/resources';
import { TOTAL_TUTORIAL_STEPS } from '../systems/tutorial';
import {
  ActivityCategory,
  CrewMemberId,
  DailyActivityInstance,
  DailyActivityStatus,
} from '../types/activity';
import {
  BuildingId,
  BuildingMalfunctionKind,
  BuildingState,
  BuildingStatus,
} from '../types/building';
import { ActiveEvent, BuildingEventImpact, EventLogEntry } from '../types/event';
import {
  CrewState,
  DaySummary,
  DifficultyLevel,
  FailureCause,
  GameState,
  LingeringHazard,
  MissionModifiers,
  PlantedCrop,
  ScreenMode,
  SustainabilityAssessment,
  TerrainScar,
} from '../types/game';

const SAVE_STORAGE_KEY = 'mars30_save_v1';
const SAVE_SCHEMA_VERSION = 1;

interface StoredSaveEnvelope {
  version: number;
  savedAt: number;
  state: GameState;
}

export interface SavedMissionPreview {
  day: number;
  maxDays: number;
  difficulty: DifficultyLevel;
  playerName: string;
  screen: ScreenMode;
  savedAt: number;
  operationalCount: number;
  totalFacilities: number;
}

const VALID_SCREENS = new Set<ScreenMode>([
  'INTRO_CINEMATIC',
  'PLAYING',
  'PAUSED',
  'MISSION_REPORT',
  'GAME_OVER',
]);

const VALID_DIFFICULTIES = new Set<DifficultyLevel>(['easy', 'medium', 'hard']);
const VALID_BUILDING_STATUSES = new Set<BuildingStatus>([
  'operational',
  'damaged',
  'inactive',
  'maintenance',
]);
const VALID_MALFUNCTION_KINDS = new Set<BuildingMalfunctionKind>([
  'electrical',
  'electronic',
  'frost',
  'disrupted',
]);
const VALID_FAILURE_CAUSES = new Set<FailureCause>([
  'oxygen',
  'water',
  'food',
  'radiation',
  'condition',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampFinite(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function sanitizeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
}

function sanitizeBuildingImpacts(value: unknown): BuildingEventImpact[] {
  if (!Array.isArray(value)) return [];
  const validIds = new Set<string>(BUILDING_LIST.map((b) => b.id));
  const result: BuildingEventImpact[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.buildingId !== 'string' || !validIds.has(item.buildingId)) {
      continue;
    }
    result.push({
      buildingId: item.buildingId as BuildingId,
      conditionDelta: typeof item.conditionDelta === 'number' && Number.isFinite(item.conditionDelta)
        ? item.conditionDelta
        : 0,
      dustAdded: typeof item.dustAdded === 'number' && Number.isFinite(item.dustAdded)
        ? item.dustAdded
        : undefined,
      frostAdded: typeof item.frostAdded === 'number' && Number.isFinite(item.frostAdded)
        ? item.frostAdded
        : undefined,
      malfunctionKind:
        typeof item.malfunctionKind === 'string' &&
        VALID_MALFUNCTION_KINDS.has(item.malfunctionKind as BuildingMalfunctionKind)
          ? (item.malfunctionKind as BuildingMalfunctionKind)
          : undefined,
      shutdown: typeof item.shutdown === 'boolean' ? item.shutdown : undefined,
    });
  }
  return result;
}

function sanitizeBuildings(rawBuildings: unknown): Record<BuildingId, BuildingState> | null {
  if (!isRecord(rawBuildings)) return null;
  const base = createInitialBuildings();
  const next = { ...base };

  for (const def of BUILDING_LIST) {
    const raw = rawBuildings[def.id];
    const fallback = base[def.id];
    if (!isRecord(raw)) {
      next[def.id] = fallback;
      continue;
    }

    const status =
      typeof raw.status === 'string' && VALID_BUILDING_STATUSES.has(raw.status as BuildingStatus)
        ? (raw.status as BuildingStatus)
        : fallback.status;

    const malfunctionKind =
      typeof raw.malfunctionKind === 'string' &&
      VALID_MALFUNCTION_KINDS.has(raw.malfunctionKind as BuildingMalfunctionKind)
        ? (raw.malfunctionKind as BuildingMalfunctionKind)
        : undefined;

    next[def.id] = {
      id: def.id,
      status,
      condition: clampInt(raw.condition, 0, 100, fallback.condition),
      dustLevel: clampInt(raw.dustLevel, 0, 100, fallback.dustLevel),
      frostLevel:
        typeof raw.frostLevel === 'number' && Number.isFinite(raw.frostLevel)
          ? clampInt(raw.frostLevel, 0, 100, 0)
          : fallback.frostLevel,
      malfunctionDaysRemaining:
        typeof raw.malfunctionDaysRemaining === 'number' &&
        Number.isFinite(raw.malfunctionDaysRemaining)
          ? Math.max(0, Math.round(raw.malfunctionDaysRemaining))
          : undefined,
      malfunctionKind,
      restoredOnce: typeof raw.restoredOnce === 'boolean' ? raw.restoredOnce : fallback.restoredOnce,
      timesMaintained: clampInt(raw.timesMaintained, 0, 10000, fallback.timesMaintained),
      lastMaintainedDay:
        typeof raw.lastMaintainedDay === 'number' && Number.isFinite(raw.lastMaintainedDay)
          ? clampInt(raw.lastMaintainedDay, 1, MAX_MISSION_DAYS, 1)
          : fallback.lastMaintainedDay,
      hasVisibleDamage:
        typeof raw.hasVisibleDamage === 'boolean' ? raw.hasVisibleDamage : fallback.hasVisibleDamage,
      damageCause: typeof raw.damageCause === 'string' ? (raw.damageCause as BuildingState['damageCause']) : undefined,
      damageSeverity:
        raw.damageSeverity === 'minor' ||
        raw.damageSeverity === 'major' ||
        raw.damageSeverity === 'super_major'
          ? raw.damageSeverity
          : undefined,
    };
  }

  return next;
}

function sanitizeCrew(rawCrew: unknown): CrewState | null {
  if (!isRecord(rawCrew)) return null;
  if (
    typeof rawCrew.energy !== 'number' ||
    !Number.isFinite(rawCrew.energy) ||
    typeof rawCrew.condition !== 'number' ||
    !Number.isFinite(rawCrew.condition)
  ) {
    return null;
  }

  return {
    energy: clampInt(rawCrew.energy, 0, 100, 100),
    condition: clampInt(rawCrew.condition, 0, 100, 100),
    radiationExposure: clampInt(rawCrew.radiationExposure, 0, 100, 0),
    inShelter: Boolean(rawCrew.inShelter),
    restedToday: Boolean(rawCrew.restedToday),
  };
}

function sanitizeGreenhouseCrop(rawCrop: unknown): PlantedCrop | null {
  if (!isRecord(rawCrop) || typeof rawCrop.cropId !== 'string') return null;
  const def = CROP_MAP[rawCrop.cropId];
  if (!def) return null;

  const growthDaysRequired = clampFinite(
    rawCrop.growthDaysRequired,
    1,
    30,
    def.growthDays
  );
  const growthProgress = clampFinite(rawCrop.growthProgress, 0, growthDaysRequired, 0);

  return {
    cropId: def.id,
    plantedDay: clampInt(rawCrop.plantedDay, 1, MAX_MISSION_DAYS, 1),
    growthProgress,
    growthDaysRequired,
    isMature: Boolean(rawCrop.isMature) || growthProgress >= growthDaysRequired,
    health: clampInt(rawCrop.health, 0, 100, 100),
  };
}

function sanitizeActiveEvent(rawEvent: unknown): ActiveEvent | null {
  if (!isRecord(rawEvent) || !isRecord(rawEvent.definition)) return null;
  const defId = rawEvent.definition.id;
  if (typeof defId !== 'string' || !(defId in EVENT_DEFINITIONS)) return null;

  const canonicalDef = EVENT_DEFINITIONS[defId];
  const animationDuration =
    canonicalDef.severity === 'major' || canonicalDef.severity === 'super_major' ? 20 : 15;
  const resolved = Boolean(rawEvent.resolved);
  const animationRemaining = resolved
    ? 0
    : clampFinite(rawEvent.animationRemaining, 0, animationDuration, animationDuration);

  return {
    definition: canonicalDef,
    dayTriggered: clampInt(rawEvent.dayTriggered, 1, MAX_MISSION_DAYS, 1),
    resolved,
    cutsceneCompleted:
      typeof rawEvent.cutsceneCompleted === 'boolean' ? rawEvent.cutsceneCompleted : undefined,
    shelterUsed: Boolean(rawEvent.shelterUsed),
    selectedChoiceId:
      typeof rawEvent.selectedChoiceId === 'string' ? rawEvent.selectedChoiceId : undefined,
    mitigationSummary:
      typeof rawEvent.mitigationSummary === 'string' ? rawEvent.mitigationSummary : '',
    animationDuration,
    animationRemaining,
    initialDamageApplied:
      typeof rawEvent.initialDamageApplied === 'boolean'
        ? rawEvent.initialDamageApplied
        : undefined,
    radiationPenaltyApplied:
      typeof rawEvent.radiationPenaltyApplied === 'boolean'
        ? rawEvent.radiationPenaltyApplied
        : undefined,
    aftermathApplied:
      typeof rawEvent.aftermathApplied === 'boolean' ? rawEvent.aftermathApplied : undefined,
    appliedBuildingImpacts: rawEvent.appliedBuildingImpacts
      ? sanitizeBuildingImpacts(rawEvent.appliedBuildingImpacts)
      : undefined,
    hazardDrainRemainder:
      typeof rawEvent.hazardDrainRemainder === 'number' &&
      Number.isFinite(rawEvent.hazardDrainRemainder)
        ? rawEvent.hazardDrainRemainder
        : undefined,
    totalHazardHealthLost:
      typeof rawEvent.totalHazardHealthLost === 'number' &&
      Number.isFinite(rawEvent.totalHazardHealthLost)
        ? rawEvent.totalHazardHealthLost
        : undefined,
    shelterEnteredLate:
      typeof rawEvent.shelterEnteredLate === 'boolean' ? rawEvent.shelterEnteredLate : undefined,
    lateEntryHealthPenalty:
      typeof rawEvent.lateEntryHealthPenalty === 'number' &&
      Number.isFinite(rawEvent.lateEntryHealthPenalty)
        ? rawEvent.lateEntryHealthPenalty
        : undefined,
  };
}

function sanitizeModifiers(raw: unknown): MissionModifiers {
  const fallback: MissionModifiers = {
    solarOutputBonusPct: 0,
    stormDamageFactor: 1,
    extraDustNextStorm: 0,
    cropBoostDaysLeft: 0,
    lastDecisionNote: null,
    decisionHistory: [],
  };
  if (!isRecord(raw)) return fallback;

  const decisionHistory = Array.isArray(raw.decisionHistory)
    ? raw.decisionHistory
        .filter((item): item is MissionModifiers['decisionHistory'][number] => {
          return (
            isRecord(item) &&
            typeof item.day === 'number' &&
            typeof item.eventId === 'string' &&
            typeof item.choiceId === 'string' &&
            typeof item.choiceTitle === 'string' &&
            typeof item.summary === 'string'
          );
        })
    : [];

  let lastDecisionNote: MissionModifiers['lastDecisionNote'] = null;
  if (
    isRecord(raw.lastDecisionNote) &&
    typeof raw.lastDecisionNote.id === 'string' &&
    typeof raw.lastDecisionNote.headline === 'string' &&
    typeof raw.lastDecisionNote.outcome === 'string' &&
    typeof raw.lastDecisionNote.futureWarning === 'string'
  ) {
    lastDecisionNote = {
      id: raw.lastDecisionNote.id,
      headline: raw.lastDecisionNote.headline,
      outcome: raw.lastDecisionNote.outcome,
      futureWarning: raw.lastDecisionNote.futureWarning,
      urgency:
        raw.lastDecisionNote.urgency === 'alert' ||
        raw.lastDecisionNote.urgency === 'warning' ||
        raw.lastDecisionNote.urgency === 'info'
          ? raw.lastDecisionNote.urgency
          : 'info',
    };
  }

  return {
    solarOutputBonusPct: clampFinite(raw.solarOutputBonusPct, -100, 200, 0),
    stormDamageFactor: clampFinite(raw.stormDamageFactor, 0.1, 3, 1),
    extraDustNextStorm: clampFinite(raw.extraDustNextStorm, 0, 100, 0),
    cropBoostDaysLeft: clampInt(raw.cropBoostDaysLeft, 0, 30, 0),
    lastDecisionNote,
    decisionHistory,
  };
}

function sanitizeLingeringHazards(raw: unknown): LingeringHazard[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is LingeringHazard => {
    return (
      isRecord(item) &&
      typeof item.id === 'string' &&
      (item.kind === 'toxic_dust' ||
        item.kind === 'ionizing_particles' ||
        item.kind === 'frost_haze') &&
      typeof item.label === 'string' &&
      typeof item.description === 'string' &&
      typeof item.daysRemaining === 'number' &&
      item.daysRemaining > 0 &&
      typeof item.dailyHealthDamage === 'number'
    );
  });
}

function sanitizeScheduledEvents(raw: unknown): Record<number, string> {
  if (!isRecord(raw)) return {};
  const result: Record<number, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const dayNum = Number(k);
    if (
      Number.isInteger(dayNum) &&
      dayNum >= 1 &&
      dayNum <= MAX_MISSION_DAYS &&
      typeof v === 'string' &&
      v in EVENT_DEFINITIONS
    ) {
      result[dayNum] = v;
    }
  }
  return result;
}

function sanitizeEventHistory(raw: unknown): EventLogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is EventLogEntry => {
    return (
      isRecord(item) &&
      typeof item.day === 'number' &&
      typeof item.eventId === 'string' &&
      typeof item.title === 'string' &&
      typeof item.outcomeSummary === 'string'
    );
  });
}

function sanitizeScars(raw: unknown): TerrainScar[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is TerrainScar => {
    return (
      isRecord(item) &&
      typeof item.id === 'string' &&
      (item.kind === 'solar_scorch' ||
        item.kind === 'sep_crater' ||
        item.kind === 'dust_drift' ||
        item.kind === 'quake_fissure') &&
      typeof item.x === 'number' &&
      Number.isFinite(item.x) &&
      typeof item.y === 'number' &&
      Number.isFinite(item.y) &&
      typeof item.size === 'number' &&
      Number.isFinite(item.size)
    );
  });
}

function sanitizeDaySummary(raw: unknown): DaySummary | null {
  if (!isRecord(raw) || typeof raw.day !== 'number' || !isRecord(raw.production) || !isRecord(raw.consumption)) {
    return null;
  }
  return raw as unknown as DaySummary;
}

function sanitizeGilMessage(raw: unknown): GameState['gilDayHint'] {
  if (
    !isRecord(raw) ||
    raw.speaker !== 'GIL' ||
    typeof raw.id !== 'string' ||
    typeof raw.headline !== 'string' ||
    typeof raw.body !== 'string'
  ) {
    return null;
  }
  return raw as unknown as GameState['gilDayHint'];
}

const VALID_ACTIVITY_CATEGORIES = new Set<ActivityCategory>([
  'maintenance',
  'research',
  'exploration',
  'crew',
]);
const VALID_ACTIVITY_STATUSES = new Set<DailyActivityStatus>([
  'available',
  'completed',
  'ignored',
]);
const VALID_CREW_IDS = new Set<CrewMemberId>(['Player', 'Brent', 'MJ', 'Darryl', 'Magno']);

function sanitizeDailyActivities(raw: unknown): DailyActivityInstance[] {
  if (!Array.isArray(raw)) return [];
  const validBuildingIds = new Set<string>(BUILDING_LIST.map((b) => b.id));
  const items: DailyActivityInstance[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    if (
      typeof item.id !== 'string' ||
      typeof item.templateId !== 'string' ||
      typeof item.title !== 'string' ||
      typeof item.category !== 'string' ||
      !VALID_ACTIVITY_CATEGORIES.has(item.category as ActivityCategory) ||
      typeof item.buildingId !== 'string' ||
      !validBuildingIds.has(item.buildingId)
    ) {
      continue;
    }
    const status: DailyActivityStatus =
      typeof item.status === 'string' && VALID_ACTIVITY_STATUSES.has(item.status as DailyActivityStatus)
        ? (item.status as DailyActivityStatus)
        : 'available';
    const assignedCrew: CrewMemberId =
      typeof item.assignedCrew === 'string' && VALID_CREW_IDS.has(item.assignedCrew as CrewMemberId)
        ? (item.assignedCrew as CrewMemberId)
        : 'Player';

    items.push({
      id: item.id,
      templateId: item.templateId,
      dayGenerated: clampInt(item.dayGenerated, 1, MAX_MISSION_DAYS, 1),
      category: item.category as ActivityCategory,
      title: item.title,
      shortDesc: typeof item.shortDesc === 'string' ? item.shortDesc : '',
      relevanceReason: typeof item.relevanceReason === 'string' ? item.relevanceReason : '',
      buildingId: item.buildingId as BuildingId,
      isOutdoor: Boolean(item.isOutdoor),
      assignedCrew,
      skillLabel: typeof item.skillLabel === 'string' ? item.skillLabel : 'Crew Ops',
      skillBonusLabel: typeof item.skillBonusLabel === 'string' ? item.skillBonusLabel : '',
      durationHours: clampFinite(item.durationHours, 1, 6, 1),
      workDurationSec: clampFinite(item.workDurationSec, 1, 10, 2.2),
      crewEnergyCost: clampInt(item.crewEnergyCost, 0, 50, 0),
      resourceCost: isRecord(item.resourceCost) ? (item.resourceCost as DailyActivityInstance['resourceCost']) : {},
      reward: isRecord(item.reward) ? (item.reward as DailyActivityInstance['reward']) : {},
      rewardSummary: typeof item.rewardSummary === 'string' ? item.rewardSummary : '',
      cooldownSols: clampInt(item.cooldownSols, 1, 20, 4),
      status,
      prioritized: Boolean(item.prioritized),
    });
  }
  return items;
}

function sanitizeActivityCooldowns(raw: unknown): Record<string, number> {
  if (!isRecord(raw)) return {};
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      result[k] = clampInt(v, 1, MAX_MISSION_DAYS + 30, 1);
    }
  }
  return result;
}

export function sanitizeAndRestoreGameState(rawState: unknown): GameState | null {
  if (!isRecord(rawState)) return null;

  const rawScreen = rawState.screen;
  if (typeof rawScreen !== 'string' || !VALID_SCREENS.has(rawScreen as ScreenMode)) {
    return null;
  }
  // Returning to the browser drops players right back into active gameplay instead of a frozen pause backdrop
  const screen: ScreenMode = rawScreen === 'PAUSED' ? 'PLAYING' : (rawScreen as ScreenMode);

  const difficulty: DifficultyLevel =
    typeof rawState.difficulty === 'string' &&
    VALID_DIFFICULTIES.has(rawState.difficulty as DifficultyLevel)
      ? (rawState.difficulty as DifficultyLevel)
      : 'medium';

  const playerName =
    typeof rawState.playerName === 'string' && rawState.playerName.trim().length > 0
      ? rawState.playerName.trim().slice(0, 24)
      : 'Commander';

  const seed =
    typeof rawState.seed === 'number' && Number.isFinite(rawState.seed)
      ? Math.round(rawState.seed)
      : Math.floor(Math.random() * 900000) + 1000;

  const day = clampInt(rawState.day, 1, MAX_MISSION_DAYS, 1);
  const hoursElapsed = clampFinite(
    rawState.hoursElapsed,
    WORK_START_HOUR,
    TOTAL_DAY_HOURS,
    WORK_START_HOUR
  );
  const clock = computeWorkClockMetrics(hoursElapsed);

  const buildings = sanitizeBuildings(rawState.buildings);
  if (!buildings) return null;

  const crew = sanitizeCrew(rawState.crew);
  if (!crew) return null;

  if (!isRecord(rawState.resources)) return null;
  const r = rawState.resources;
  if (
    typeof r.oxygen !== 'number' ||
    !Number.isFinite(r.oxygen) ||
    typeof r.water !== 'number' ||
    !Number.isFinite(r.water) ||
    typeof r.food !== 'number' ||
    !Number.isFinite(r.food) ||
    typeof r.energy !== 'number' ||
    !Number.isFinite(r.energy)
  ) {
    return null;
  }

  const capacities = calculateResourceCapacities(buildings, difficulty);
  const resources = clampResourcesToCapacity(
    {
      oxygen: Math.max(0, r.oxygen),
      water: Math.max(0, r.water),
      food: Math.max(0, r.food),
      energy: Math.max(0, r.energy),
    },
    capacities
  );

  const selectedBuildingId =
    typeof rawState.selectedBuildingId === 'string' &&
    rawState.selectedBuildingId in BUILDING_DEFINITIONS
      ? (rawState.selectedBuildingId as BuildingId)
      : null;

  const failureCause =
    typeof rawState.failureCause === 'string' &&
    VALID_FAILURE_CAUSES.has(rawState.failureCause as FailureCause)
      ? (rawState.failureCause as FailureCause)
      : null;

  const assessment = isRecord(rawState.assessment)
    ? (rawState.assessment as unknown as SustainabilityAssessment)
    : null;

  return {
    screen,
    playerName,
    difficulty,
    day,
    maxDays: MAX_MISSION_DAYS,
    maxDailyHours: MAX_DAILY_HOURS,
    ...clock,
    // Always settle transient walk/sleep animations cleanly so refresh never soft-locks
    sleepPhase: 'idle',
    sleepingRemaining: 0,
    ongoingTask: null,
    pendingAction: null,
    phase: getPhaseForDay(day),
    resources,
    capacities,
    buildings,
    selectedBuildingId,
    crew,
    greenhouseCrop: sanitizeGreenhouseCrop(rawState.greenhouseCrop),
    harvestCount: clampInt(rawState.harvestCount, 0, 10000, 0),
    activeEvent: sanitizeActiveEvent(rawState.activeEvent),
    lingeringHazards: sanitizeLingeringHazards(rawState.lingeringHazards),
    scheduledEventDays: sanitizeScheduledEvents(rawState.scheduledEventDays),
    eventHistory: sanitizeEventHistory(rawState.eventHistory),
    environmentalScars: sanitizeScars(rawState.environmentalScars),
    modifiers: sanitizeModifiers(rawState.modifiers),
    lastDaySummary: sanitizeDaySummary(rawState.lastDaySummary),
    gilDayHint: sanitizeGilMessage(rawState.gilDayHint),
    gilAnnouncementDays: sanitizeNumberArray(rawState.gilAnnouncementDays),
    failureReason: typeof rawState.failureReason === 'string' ? rawState.failureReason : null,
    failureCause,
    endingCutsceneCompleted: Boolean(rawState.endingCutsceneCompleted),
    assessment,
    totalTasksCompleted: clampInt(rawState.totalTasksCompleted, 0, 100000, 0),
    majorTasksCompleted: clampInt(rawState.majorTasksCompleted, 0, 100000, 0),
    minorTasksCompleted: clampInt(rawState.minorTasksCompleted, 0, 100000, 0),
    dailyActivities: sanitizeDailyActivities(rawState.dailyActivities),
    activityCooldowns: sanitizeActivityCooldowns(rawState.activityCooldowns),
    dailyActivitiesCompleted: clampInt(rawState.dailyActivitiesCompleted, 0, 100000, 0),
    keyDecisions: sanitizeStringArray(rawState.keyDecisions),
    seed,
    audioMuted: Boolean(rawState.audioMuted),
    tutorialSkipped: Boolean(rawState.tutorialSkipped),
    tutorialStep: clampInt(rawState.tutorialStep, 0, TOTAL_TUTORIAL_STEPS, 0),
    tutorialDrawerSeen: Boolean(rawState.tutorialDrawerSeen),
    seenMechanicHints: sanitizeStringArray(rawState.seenMechanicHints),
  };
}

export function saveMissionState(state: GameState): void {
  if (state.screen === 'TITLE_MENU') return;
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const envelope: StoredSaveEnvelope = {
      version: SAVE_SCHEMA_VERSION,
      savedAt: Date.now(),
      state,
    };
    window.localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Ignore storage quota or private browsing errors gracefully
  }
}

export function loadSavedMissionState(): GameState | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== SAVE_SCHEMA_VERSION) {
      return null;
    }
    return sanitizeAndRestoreGameState(parsed.state);
  } catch {
    return null;
  }
}

export function getSavedMissionPreview(): SavedMissionPreview | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== SAVE_SCHEMA_VERSION) {
      return null;
    }
    const restored = sanitizeAndRestoreGameState(parsed.state);
    if (!restored) return null;
    const operationalCount = BUILDING_LIST.filter(
      (b) => restored.buildings[b.id].status === 'operational'
    ).length;
    return {
      day: restored.day,
      maxDays: restored.maxDays,
      difficulty: restored.difficulty,
      playerName: restored.playerName,
      screen: restored.screen,
      savedAt:
        typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt)
          ? parsed.savedAt
          : Date.now(),
      operationalCount,
      totalFacilities: BUILDING_LIST.length,
    };
  } catch {
    return null;
  }
}

export function clearSavedMissionState(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(SAVE_STORAGE_KEY);
  } catch {
    // Ignore storage errors gracefully
  }
}
