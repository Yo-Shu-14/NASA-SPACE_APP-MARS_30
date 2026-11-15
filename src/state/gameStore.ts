import { MAINTENANCE_INTERVALS } from '../data/balance';
import { BUILDING_DEFINITIONS } from '../data/buildings';
import { CROP_MAP } from '../data/crops';
import {
  computeWorkClockMetrics,
  getPhaseForDay,
  MAX_DAILY_HOURS,
  MAX_MISSION_DAYS,
  TOTAL_DAY_HOURS,
  WORK_START_HOUR,
} from '../data/mission';
import { TASK_DEFINITIONS } from '../data/tasks';
import { evaluateSustainability } from '../systems/assessment';
import {
  applyDailyActivityExecution,
  generateDailyActivitiesForSol,
  getActivityTaskAnimKind,
  validateDailyActivity,
} from '../systems/activities';
import { soundFX } from '../systems/audio';
import {
  applyBuildingConditionChange,
  calculateResourceCapacities,
  createInitialBuildings,
  getBuildingUnlockStatus,
} from '../systems/buildings';
import { createInitialCrew, performCrewShortRest, resolveDailyCrewRecovery } from '../systems/crew';
import {
  applyGradualEventHealthTick,
  applyInitialEventImpact,
  applyLateShelterPenalty,
  applyMajorEventDecision,
  applyOutdoorActivityHazardConsequence,
  BuildingEventImpact,
  clearMitigatedLingeringHazards,
  createActiveEventForDay,
  createLingeringHazardForEvent,
  createScarsForEvent,
  finalizeExpiredActiveEvent,
  generateMissionEventSchedule,
  isEventOfficiallyActive,
  isMajorEventCutsceneActive,
  isShelterRequiredEvent,
  resolveEventAtEndOfDay,
  tickLingeringHazardsEndOfDay,
} from '../systems/events';
import { getPostDaySummaryGilHint } from '../systems/gil';
import {
  DAY_ONE_TUTORIAL_STEPS,
  resolveTutorialStepProgress,
  TOTAL_TUTORIAL_STEPS,
} from '../systems/tutorial';
import {
  advanceCropGrowth,
  canPlantCrop,
  harvestMatureCrop,
  plantCropInGreenhouse,
} from '../systems/greenhouse';
import {
  calculateDailyRates,
  clampResourcesToCapacity,
  computeHourlySolarEnergyGain,
  createInitialResources,
} from '../systems/resources';
import { applyTaskExecution, getEffectiveTaskCosts, validateTask } from '../systems/tasks';
import { BuildingId } from '../types/building';
import {
  DaySummary,
  DifficultyLevel,
  FailureCause,
  GameState,
  PendingCrewAction,
  ScreenMode,
} from '../types/game';
import { ResourceAmounts } from '../types/resource';
import {
  getSavedMissionPreview,
  loadSavedMissionState,
  SavedMissionPreview,
  saveMissionState,
} from './saveStorage';

function formatOvertimeLabel(hours: number): string {
  const totalMins = Math.max(1, Math.round(hours * 60));
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs <= 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

export type WorldFeedbackEvent =
  | {
      type: 'task_assigned';
      buildingId: BuildingId;
      taskKind: 'restore' | 'repair' | 'clean' | 'plant' | 'harvest';
      label: string;
    }
  | {
      type: 'work_started';
      buildingId: BuildingId;
      taskKind: 'restore' | 'repair' | 'clean' | 'plant' | 'harvest';
      duration: number;
      label: string;
    }
  | {
      type: 'task';
      buildingId: BuildingId;
      label: string;
      taskKind?: 'restore' | 'repair' | 'clean';
      conditionGain?: number;
    }
  | { type: 'plant'; buildingId: 'greenhouse' }
  | { type: 'harvest'; buildingId: 'greenhouse'; amount: number }
  | { type: 'activity'; buildingId: BuildingId; label: string; rewardSummary: string }
  | { type: 'shelter'; inShelter: boolean }
  | { type: 'focus_building'; buildingId: BuildingId }
  | { type: 'decision'; choiceTitle: string; buildingImpacts?: BuildingEventImpact[] }
  | { type: 'event_impact'; eventId: string; buildingImpacts: BuildingEventImpact[] }
  | {
      type: 'event_ended';
      eventId: string;
      title: string;
      hasDamage: boolean;
      spawnedHazardLabel?: string | null;
    }
  | { type: 'sleep_start' }
  | { type: 'end_day'; day: number; buildingImpacts?: BuildingEventImpact[] }
  | { type: 'crew_hazard_damage'; delta: number; reason?: string }
  | { type: 'crew_health_recovery'; delta: number; reason?: string }
  | { type: 'hazard_cleared'; labels: string[] }
  | { type: 'systems_unlocked'; buildings: BuildingId[] }
  | {
      type: 'tutorial_step_complete';
      completedStep: number;
      nextStep: number;
      label: string;
    };

type StateListener = (state: GameState) => void;
type FeedbackListener = (event: WorldFeedbackEvent) => void;

export function createInitialGameState(
  seed = Math.floor(Math.random() * 900000) + 1000,
  difficulty: DifficultyLevel = 'medium',
  playerName = 'Commander'
): GameState {
  const buildings = createInitialBuildings();
  const capacities = calculateResourceCapacities(buildings, difficulty);
  const resources = clampResourcesToCapacity(createInitialResources(difficulty), capacities);
  const scheduledEventDays = generateMissionEventSchedule(seed, difficulty);
  const cleanName = playerName.trim().slice(0, 24) || 'Commander';

  return {
    screen: 'TITLE_MENU',
    playerName: cleanName,
    difficulty,
    day: 1,
    maxDays: MAX_MISSION_DAYS,
    hoursRemaining: MAX_DAILY_HOURS,
    maxDailyHours: MAX_DAILY_HOURS,
    hoursElapsed: WORK_START_HOUR,
    overtimeHours: 0,
    sleepPhase: 'idle',
    sleepingRemaining: 0,
    ongoingTask: null,
    pendingAction: null,
    phase: 1,
    resources,
    capacities,
    buildings,
    selectedBuildingId: null,
    crew: createInitialCrew(difficulty),
    greenhouseCrop: null,
    harvestCount: 0,
    activeEvent: null,
    lingeringHazards: [],
    scheduledEventDays,
    eventHistory: [],
    environmentalScars: [],
    modifiers: {
      solarOutputBonusPct: 0,
      stormDamageFactor: 1,
      extraDustNextStorm: 0,
      cropBoostDaysLeft: 0,
      lastDecisionNote: null,
      decisionHistory: [],
    },
    lastDaySummary: null,
    gilDayHint: null,
    gilAnnouncementDays: [],
    failureReason: null,
    failureCause: null,
    endingCutsceneCompleted: false,
    assessment: null,
    totalTasksCompleted: 0,
    majorTasksCompleted: 0,
    minorTasksCompleted: 0,
    dailyActivities: [],
    activityCooldowns: {},
    dailyActivitiesCompleted: 0,
    keyDecisions: [],
    seed,
    audioMuted: false,
    tutorialSkipped: false,
    tutorialStep: 0,
    tutorialDrawerSeen: false,
    seenMechanicHints: [],
  };
}

class GameStore {
  private state: GameState = createInitialGameState();
  private listeners = new Set<StateListener>();
  private feedbackListeners = new Set<FeedbackListener>();
  private workTicker: ReturnType<typeof setInterval> | undefined;
  private eventAnimTimer: ReturnType<typeof setInterval> | undefined;
  private sleepTimer: ReturnType<typeof setInterval> | undefined;
  private idleTimeTimer: ReturnType<typeof setInterval> | undefined;
  private lastSaveAt = 0;

  constructor() {
    const restored = loadSavedMissionState();
    if (restored) {
      let initialRestored = restored;
      if (
        initialRestored.screen === 'PLAYING' &&
        initialRestored.activeEvent &&
        !initialRestored.activeEvent.resolved &&
        initialRestored.activeEvent.animationRemaining <= 0
      ) {
        initialRestored = finalizeExpiredActiveEvent(initialRestored).nextState;
      }
      this.state = initialRestored;
      soundFX.setMuted(initialRestored.audioMuted);
      if (initialRestored.screen === 'PLAYING') {
        this.startIdleTimeTicker();
        if (
          !initialRestored.lastDaySummary &&
          !initialRestored.gilDayHint &&
          !isMajorEventCutsceneActive(initialRestored) &&
          isEventOfficiallyActive(initialRestored.activeEvent)
        ) {
          this.startEventAnimationTicker();
        }
      }
    }

    if (typeof window !== 'undefined') {
      const flushSave = () => {
        if (this.state.screen !== 'TITLE_MENU') {
          saveMissionState(this.state);
          this.lastSaveAt = Date.now();
        }
      };
      window.addEventListener('pagehide', flushSave);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          flushSave();
        }
      });
    }
  }

  private stopIdleTimeTicker() {
    if (this.idleTimeTimer !== undefined) {
      globalThis.clearInterval(this.idleTimeTimer);
      this.idleTimeTimer = undefined;
    }
  }

  private startIdleTimeTicker() {
    if (this.idleTimeTimer !== undefined) return;
    // Automatic time progression: 1 in-game minute every 2 real-time seconds
    this.idleTimeTimer = globalThis.setInterval(() => {
      const cur = this.state;
      if (
        cur.screen !== 'PLAYING' ||
        cur.sleepPhase !== 'idle' ||
        cur.sleepingRemaining > 0 ||
        cur.lastDaySummary ||
        cur.gilDayHint ||
        (cur.activeEvent && !cur.activeEvent.resolved) ||
        cur.pendingAction !== null ||
        cur.hoursElapsed >= TOTAL_DAY_HOURS
      ) {
        return;
      }

      const clock = computeWorkClockMetrics(cur.hoursElapsed + 1 / 60);
      if (clock.hoursElapsed !== cur.hoursElapsed) {
        this.setState({
          ...cur,
          ...clock,
        });
      }

      const hasBrokenCritical =
        cur.buildings.solar_panels.status === 'inactive' ||
        cur.buildings.oxygen_generator.status === 'inactive' ||
        cur.buildings.water_recycling.status === 'inactive' ||
        Object.values(cur.buildings).some((b) => b.status === 'damaged');
      const isWindy =
        cur.activeEvent?.definition.phenomenon === 'dust_devils' ||
        cur.activeEvent?.definition.phenomenon === 'global_dust_storm' ||
        cur.day % 3 === 0;
      soundFX.playSubtleAmbientPulse(hasBrokenCritical, isWindy);
    }, 2000);
  }

  private stopWorkTicker() {
    if (this.workTicker !== undefined) {
      globalThis.clearInterval(this.workTicker);
      this.workTicker = undefined;
    }
  }

  private startWorkTicker() {
    this.stopWorkTicker();
    this.workTicker = globalThis.setInterval(() => {
      const cur = this.state;
      if (cur.screen !== 'PLAYING' || cur.sleepPhase !== 'idle') {
        return;
      }
      const act = cur.pendingAction;
      if (!act || act.phase !== 'working') {
        this.stopWorkTicker();
        return;
      }

      const nextRem = Math.max(0, Number((act.workRemainingSec - 0.1).toFixed(2)));
      const progress = Math.min(
        1,
        Math.max(0, (act.workDurationSec - nextRem) / Math.max(0.1, act.workDurationSec))
      );
      const targetApplied = act.timeHoursTotal * progress;
      const deltaHours = Math.max(0, targetApplied - act.timeHoursApplied);
      const clock = computeWorkClockMetrics(cur.hoursElapsed + deltaHours);

      if (nextRem <= 0) {
        this.stopWorkTicker();
        this.state = this.withHourlySolarEnergy(cur, {
          ...cur,
          ...clock,
          pendingAction: {
            ...act,
            workRemainingSec: 0,
            timeHoursApplied: targetApplied,
          },
        });
        this.completePendingAction();
      } else {
        this.setState({
          ...cur,
          ...clock,
          pendingAction: {
            ...act,
            workRemainingSec: nextRem,
            timeHoursApplied: targetApplied,
          },
        });
      }
    }, 100);
  }

  private stopSleepTicker() {
    if (this.sleepTimer !== undefined) {
      globalThis.clearInterval(this.sleepTimer);
      this.sleepTimer = undefined;
    }
  }

  private startSleepTicker() {
    this.stopSleepTicker();
    this.sleepTimer = globalThis.setInterval(() => {
      const cur = this.state;
      if (cur.screen !== 'PLAYING' || cur.sleepPhase !== 'sleeping') return;
      if (cur.sleepingRemaining <= 0) {
        this.stopSleepTicker();
        this.completeEndDay();
        return;
      }

      const nextRemaining = Math.max(0, Number((cur.sleepingRemaining - 0.2).toFixed(2)));
      if (nextRemaining <= 0) {
        this.stopSleepTicker();
        this.completeEndDay();
      } else {
        this.setState({
          ...cur,
          sleepingRemaining: nextRemaining,
        });
      }
    }, 200);
  }

  private stopEventAnimationTicker() {
    if (this.eventAnimTimer !== undefined) {
      globalThis.clearInterval(this.eventAnimTimer);
      this.eventAnimTimer = undefined;
    }
  }

  private startEventAnimationTicker() {
    this.stopEventAnimationTicker();
    this.eventAnimTimer = globalThis.setInterval(() => {
      const cur = this.state;
      if (cur.screen !== 'PLAYING' || cur.sleepPhase === 'sleeping') return;
      if (cur.lastDaySummary || cur.gilDayHint || isMajorEventCutsceneActive(cur)) {
        this.stopEventAnimationTicker();
        return;
      }
      const evt = cur.activeEvent;
      if (!evt || evt.animationRemaining <= 0) {
        this.stopEventAnimationTicker();
        return;
      }

      // Event duration is strictly fixed (15s minor / 20s major) regardless of player actions
      const stepSec = 0.25;
      const nextRemaining = Math.max(0, Number((evt.animationRemaining - stepSec).toFixed(2)));

      let updatedState: GameState = {
        ...cur,
        activeEvent: {
          ...evt,
          animationRemaining: nextRemaining,
        },
      };

      const { nextState: healthTickedState, healthDelta } = applyGradualEventHealthTick(
        updatedState,
        stepSec
      );
      updatedState = healthTickedState;

      let emittedImpactNow = false;
      let impactBuildingList: BuildingEventImpact[] = [];
      let impactDamageTaken = 0;

      const impactTriggerAt = evt.animationDuration >= 20 ? 2.5 : 1.8;
      if (!evt.initialDamageApplied && (nextRemaining <= impactTriggerAt || nextRemaining <= 0)) {
        const prevCond = updatedState.crew.condition;
        const { nextState: impactedState, buildingImpacts } = applyInitialEventImpact(updatedState);
        impactDamageTaken = prevCond - impactedState.crew.condition;
        impactBuildingList = buildingImpacts;
        emittedImpactNow = true;
        const nextCapacities = calculateResourceCapacities(
          impactedState.buildings,
          impactedState.difficulty
        );
        updatedState = {
          ...impactedState,
          capacities: nextCapacities,
          resources: clampResourcesToCapacity(impactedState.resources, nextCapacities),
        };
        if (buildingImpacts.length > 0) {
          soundFX.playInfrastructureDamageAudio({
            eventId: evt.definition.id,
            phenomenon: evt.definition.phenomenon,
            severity: evt.definition.severity,
            impacts: buildingImpacts,
          });
        }
        if (impactDamageTaken > 0) {
          soundFX.playHealthWarning(impactDamageTaken >= 15);
        }
        if (updatedState.crew.condition <= 10) {
          this.stopEventAnimationTicker();
          this.stopIdleTimeTicker();
          this.stopSleepTicker();
          this.stopWorkTicker();
          const radFail = Boolean(evt.definition.radiationLevel);
          soundFX.playOutcomeFanfare(radFail ? 'fail_radiation' : 'fail_condition');
          this.setState({
            ...updatedState,
            screen: 'GAME_OVER',
            sleepPhase: 'idle',
            sleepingRemaining: 0,
            ongoingTask: null,
            pendingAction: null,
            activeEvent: null,
            lingeringHazards: [],
            failureCause: radFail ? 'radiation' : 'condition',
            endingCutsceneCompleted: false,
            failureReason: radFail
              ? 'Crew suffered lethal solar radiation exposure outside the Radiation Storm Shelter.'
              : 'Crew health dropped to a critical level from severe Martian hazard exposure.',
          });
          return;
        }
      }

      if (nextRemaining <= 0) {
        this.stopEventAnimationTicker();
        const {
          nextState: finalizedState,
          buildingImpacts: finalImpacts,
          healthDelta: finalHealthDelta,
          spawnedHazardLabel,
        } = finalizeExpiredActiveEvent(updatedState);

        if (finalizedState.crew.condition <= 10) {
          this.stopIdleTimeTicker();
          this.stopSleepTicker();
          this.stopWorkTicker();
          const radFail = Boolean(evt.definition.radiationLevel);
          soundFX.playOutcomeFanfare(radFail ? 'fail_radiation' : 'fail_condition');
          this.setState({
            ...finalizedState,
            screen: 'GAME_OVER',
            sleepPhase: 'idle',
            sleepingRemaining: 0,
            ongoingTask: null,
            pendingAction: null,
            activeEvent: null,
            lingeringHazards: [],
            failureCause: radFail ? 'radiation' : 'condition',
            endingCutsceneCompleted: false,
            failureReason: radFail
              ? 'Crew suffered lethal solar radiation exposure outside the Radiation Storm Shelter.'
              : 'Crew health dropped to a critical level from severe Martian hazard exposure.',
          });
          return;
        }

        soundFX.playEventMomentCue('outcome_resolved');
        this.setState(finalizedState);

        if (impactDamageTaken > 0 || finalHealthDelta < 0) {
          const totalDrop = impactDamageTaken + Math.max(0, -finalHealthDelta);
          if (totalDrop > 0) {
            this.emitFeedback({
              type: 'crew_hazard_damage',
              delta: -totalDrop,
              reason: evt.definition.title,
            });
          }
        }
        if (emittedImpactNow && impactBuildingList.length > 0) {
          this.emitFeedback({
            type: 'event_impact',
            eventId: evt.definition.id,
            buildingImpacts: impactBuildingList,
          });
        }
        const hasDamage = finalImpacts.some(
          (imp) =>
            imp.conditionDelta < 0 ||
            Boolean(imp.dustAdded && imp.dustAdded > 0) ||
            Boolean(imp.frostAdded && imp.frostAdded > 0) ||
            Boolean(imp.malfunctionKind)
        );
        this.emitFeedback({
          type: 'event_ended',
          eventId: evt.definition.id,
          title: evt.definition.title,
          hasDamage,
          spawnedHazardLabel,
        });
        return;
      }

      this.setState(updatedState);
      if (emittedImpactNow) {
        if (impactDamageTaken > 0) {
          this.emitFeedback({
            type: 'crew_hazard_damage',
            delta: -impactDamageTaken,
            reason: evt.definition.title,
          });
        }
        if (impactBuildingList.length > 0) {
          this.emitFeedback({
            type: 'event_impact',
            eventId: evt.definition.id,
            buildingImpacts: impactBuildingList,
          });
        }
      }

      if (healthDelta < 0) {
        soundFX.playHealthWarning(false);
        this.emitFeedback({
          type: 'crew_hazard_damage',
          delta: healthDelta,
          reason: evt.definition.title,
        });
      }
    }, 250);
  }

  public getState(): GameState {
    return this.state;
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public onFeedback(listener: FeedbackListener): () => void {
    this.feedbackListeners.add(listener);
    return () => this.feedbackListeners.delete(listener);
  }

  private withHourlySolarEnergy(prev: GameState, next: GameState): GameState {
    if (
      prev.screen !== 'PLAYING' ||
      next.screen !== 'PLAYING' ||
      next.day !== prev.day ||
      next.hoursElapsed <= prev.hoursElapsed
    ) {
      return next;
    }

    const gain = computeHourlySolarEnergyGain({
      prevHours: prev.hoursElapsed,
      nextHours: next.hoursElapsed,
      buildings: next.buildings,
      activeEvent: next.activeEvent,
    });
    if (gain <= 0) return next;

    return {
      ...next,
      resources: clampResourcesToCapacity(
        {
          ...next.resources,
          energy: next.resources.energy + gain,
        },
        next.capacities
      ),
    };
  }

  private setState(next: GameState) {
    const prevStep = this.state.tutorialStep;
    const wasDayOneActive = this.state.day === 1 && !this.state.tutorialSkipped;
    let computed = this.withHourlySolarEnergy(this.state, next);
    let completedTutorialStep: number | null = null;

    if (
      computed.day === 1 &&
      !computed.tutorialSkipped &&
      computed.tutorialStep < TOTAL_TUTORIAL_STEPS
    ) {
      const resolvedStep = resolveTutorialStepProgress(computed);
      if (resolvedStep !== computed.tutorialStep) {
        computed = { ...computed, tutorialStep: resolvedStep };
      }
    }

    if (
      wasDayOneActive &&
      computed.day === 1 &&
      !computed.tutorialSkipped &&
      computed.tutorialStep > prevStep
    ) {
      completedTutorialStep = prevStep;
    }

    const prevState = this.state;
    this.state = computed;

    if (computed.screen !== 'TITLE_MENU') {
      const isClockOnlyTick =
        prevState.screen === computed.screen &&
        prevState.day === computed.day &&
        prevState.sleepPhase === computed.sleepPhase &&
        prevState.pendingAction === computed.pendingAction &&
        prevState.resources === computed.resources &&
        prevState.buildings === computed.buildings &&
        prevState.crew === computed.crew &&
        prevState.activeEvent === computed.activeEvent &&
        prevState.greenhouseCrop === computed.greenhouseCrop &&
        prevState.selectedBuildingId === computed.selectedBuildingId &&
        prevState.lastDaySummary === computed.lastDaySummary &&
        prevState.gilDayHint === computed.gilDayHint &&
        prevState.audioMuted === computed.audioMuted &&
        prevState.dailyActivities === computed.dailyActivities &&
        prevState.tutorialStep === computed.tutorialStep &&
        prevState.tutorialSkipped === computed.tutorialSkipped;

      const now = Date.now();
      if (!isClockOnlyTick || now - this.lastSaveAt >= 4000) {
        saveMissionState(computed);
        this.lastSaveAt = now;
      }
    }

    for (const listener of this.listeners) {
      listener(this.state);
    }

    if (completedTutorialStep !== null) {
      soundFX.playTutorialStepComplete();
      const spec = DAY_ONE_TUTORIAL_STEPS[completedTutorialStep];
      this.emitFeedback({
        type: 'tutorial_step_complete',
        completedStep: completedTutorialStep,
        nextStep: computed.tutorialStep,
        label: spec?.completedLabel ?? 'Tutorial step complete!',
      });
    }
  }

  private emitFeedback(event: WorldFeedbackEvent) {
    for (const listener of this.feedbackListeners) {
      listener(event);
    }
  }

  public getSavedMissionPreview(): SavedMissionPreview | null {
    return getSavedMissionPreview();
  }

  public resumeSavedMission(): boolean {
    const restored = loadSavedMissionState();
    if (!restored) return false;
    this.stopWorkTicker();
    this.stopEventAnimationTicker();
    this.stopSleepTicker();
    this.stopIdleTimeTicker();
    soundFX.playSelect();
    soundFX.setMuted(restored.audioMuted);
    let nextRestored = restored;
    if (
      nextRestored.screen === 'PLAYING' &&
      nextRestored.activeEvent &&
      !nextRestored.activeEvent.resolved &&
      nextRestored.activeEvent.animationRemaining <= 0
    ) {
      nextRestored = finalizeExpiredActiveEvent(nextRestored).nextState;
    }
    this.setState(nextRestored);
    if (nextRestored.screen === 'PLAYING') {
      this.startIdleTimeTicker();
      if (
        !nextRestored.lastDaySummary &&
        !nextRestored.gilDayHint &&
        !isMajorEventCutsceneActive(nextRestored) &&
        isEventOfficiallyActive(nextRestored.activeEvent)
      ) {
        this.startEventAnimationTicker();
      }
    }
    return true;
  }

  public beginIntro(difficulty?: DifficultyLevel, playerName?: string) {
    this.stopWorkTicker();
    this.stopEventAnimationTicker();
    this.stopSleepTicker();
    this.stopIdleTimeTicker();
    soundFX.playSelect();
    const chosenDifficulty = difficulty ?? this.state.difficulty;
    const chosenName = (playerName ?? this.state.playerName).trim().slice(0, 24) || 'Commander';
    const freshSeed = Math.floor(Math.random() * 900000) + 1000;
    const fresh = createInitialGameState(freshSeed, chosenDifficulty, chosenName);
    fresh.screen = 'INTRO_CINEMATIC';
    fresh.audioMuted = this.state.audioMuted;
    fresh.selectedBuildingId = null;
    this.setState(fresh);
  }

  public completeIntro() {
    if (this.state.screen !== 'INTRO_CINEMATIC') return;
    soundFX.playSelect();
    this.setState({
      ...this.state,
      screen: 'PLAYING',
    });
    this.startIdleTimeTicker();
  }

  public startMission(difficulty?: DifficultyLevel, playerName?: string) {
    this.stopWorkTicker();
    this.stopEventAnimationTicker();
    this.stopSleepTicker();
    this.stopIdleTimeTicker();
    soundFX.playSelect();
    const chosenDifficulty = difficulty ?? this.state.difficulty;
    const chosenName = (playerName ?? this.state.playerName).trim().slice(0, 24) || 'Commander';
    const freshSeed = Math.floor(Math.random() * 900000) + 1000;
    const fresh = createInitialGameState(freshSeed, chosenDifficulty, chosenName);
    fresh.screen = 'PLAYING';
    fresh.audioMuted = this.state.audioMuted;
    fresh.selectedBuildingId = null;
    this.setState(fresh);
    this.startIdleTimeTicker();
  }

  public restartMission(newSeed?: number, difficulty?: DifficultyLevel) {
    this.stopWorkTicker();
    this.stopEventAnimationTicker();
    this.stopSleepTicker();
    this.stopIdleTimeTicker();
    soundFX.playSelect();
    const fresh = createInitialGameState(
      newSeed ?? Math.floor(Date.now() % 100000),
      difficulty ?? this.state.difficulty,
      this.state.playerName
    );
    fresh.screen = 'PLAYING';
    fresh.audioMuted = this.state.audioMuted;
    fresh.selectedBuildingId = null;
    this.setState(fresh);
    this.startIdleTimeTicker();
  }

  public returnToTitle() {
    this.stopWorkTicker();
    this.stopEventAnimationTicker();
    this.stopSleepTicker();
    this.stopIdleTimeTicker();
    // Flush current non-TITLE_MENU mission state before switching to TITLE_MENU so progress isn't lost
    if (this.state.screen !== 'TITLE_MENU') {
      saveMissionState(this.state);
      this.lastSaveAt = Date.now();
    }
    soundFX.playSelect();
    const fresh = createInitialGameState(
      this.state.seed,
      this.state.difficulty,
      this.state.playerName
    );
    fresh.audioMuted = this.state.audioMuted;
    this.setState(fresh);
  }

  public setScreen(screen: ScreenMode) {
    if (screen === 'PAUSED') {
      this.stopEventAnimationTicker();
    }
    this.setState({
      ...this.state,
      screen,
    });
    if (screen === 'PLAYING') {
      this.startIdleTimeTicker();
      if (
        !this.state.lastDaySummary &&
        !this.state.gilDayHint &&
        !isMajorEventCutsceneActive(this.state) &&
        isEventOfficiallyActive(this.state.activeEvent)
      ) {
        this.startEventAnimationTicker();
      }
    }
  }

  public toggleMute() {
    const nextMuted = !this.state.audioMuted;
    soundFX.setMuted(nextMuted);
    this.setState({
      ...this.state,
      audioMuted: nextMuted,
    });
  }

  public selectBuilding(buildingId: BuildingId | null) {
    if (this.state.screen !== 'PLAYING' && buildingId !== null) return;
    if (buildingId !== this.state.selectedBuildingId && buildingId !== null) {
      const b = this.state.buildings[buildingId];
      const unlocked = getBuildingUnlockStatus(buildingId, this.state).unlocked;
      soundFX.playBuildingInspectCue({
        buildingId,
        status: b.status,
        malfunctionKind: b.malfunctionKind,
        dustLevel: b.dustLevel,
        frostLevel: b.frostLevel,
        locked: !unlocked,
      });
    } else if (buildingId === null && this.state.selectedBuildingId !== null) {
      soundFX.playSelect();
    }
    this.setState({
      ...this.state,
      selectedBuildingId: buildingId,
    });
  }

  public focusBuilding(buildingId: BuildingId) {
    if (this.state.screen !== 'PLAYING') return;
    const b = this.state.buildings[buildingId];
    const unlocked = getBuildingUnlockStatus(buildingId, this.state).unlocked;
    soundFX.playBuildingInspectCue({
      buildingId,
      status: b.status,
      malfunctionKind: b.malfunctionKind,
      dustLevel: b.dustLevel,
      frostLevel: b.frostLevel,
      locked: !unlocked,
    });
    this.setState({
      ...this.state,
      selectedBuildingId: buildingId,
    });
    this.emitFeedback({ type: 'focus_building', buildingId });
  }

  public skipTutorial() {
    if (this.state.tutorialSkipped) return;
    soundFX.playSelect();
    this.setState({
      ...this.state,
      tutorialSkipped: true,
      tutorialStep: TOTAL_TUTORIAL_STEPS,
    });
  }

  public advanceTutorialStep() {
    if (this.state.tutorialSkipped) return;
    soundFX.playSelect();
    this.setState({
      ...this.state,
      tutorialStep: Math.min(TOTAL_TUTORIAL_STEPS, this.state.tutorialStep + 1),
    });
  }

  public markTutorialDrawerOpened() {
    if (this.state.day !== 1 || this.state.tutorialSkipped || this.state.tutorialDrawerSeen) return;
    this.setState({
      ...this.state,
      tutorialDrawerSeen: true,
    });
  }

  public dismissMechanicHint(hintId: string) {
    if (!hintId || this.state.seenMechanicHints.includes(hintId)) return;
    soundFX.playSelect();
    this.setState({
      ...this.state,
      seenMechanicHints: [...this.state.seenMechanicHints, hintId],
    });
  }

  public completeEndingCutscene() {
    if (
      (this.state.screen !== 'MISSION_REPORT' && this.state.screen !== 'GAME_OVER') ||
      this.state.endingCutsceneCompleted
    ) {
      return;
    }
    soundFX.playSelect();
    this.setState({
      ...this.state,
      endingCutsceneCompleted: true,
    });
  }

  public replayEndingCutscene() {
    if (this.state.screen !== 'MISSION_REPORT' && this.state.screen !== 'GAME_OVER') {
      return;
    }
    soundFX.playSelect();
    this.setState({
      ...this.state,
      endingCutsceneCompleted: false,
    });
  }

  public executeTask(taskId: string) {
    if (
      this.state.screen !== 'PLAYING' ||
      this.state.sleepPhase !== 'idle' ||
      this.state.sleepingRemaining > 0 ||
      this.state.pendingAction?.phase === 'working' ||
      isMajorEventCutsceneActive(this.state)
    ) {
      return;
    }

    const task = TASK_DEFINITIONS.find((t) => t.id === taskId);
    if (!task) return;

    const validation = validateTask(task, this.state);
    if (!validation.canExecute) return;

    const taskKind: 'restore' | 'repair' | 'clean' =
      task.dustCleared && task.category === 'minor'
        ? 'clean'
        : task.category === 'major'
        ? 'restore'
        : 'repair';
    const workDurationSec = taskKind === 'restore' ? 3.0 : 2.4;
    const costs = getEffectiveTaskCosts(task, this.state);

    const action: PendingCrewAction = {
      id: `act_${Date.now()}_${task.id}`,
      kind: 'task',
      buildingId: task.buildingId,
      taskId: task.id,
      taskKind,
      assignedCrew: 'Player',
      label: task.title,
      phase: 'walking',
      workDurationSec,
      workRemainingSec: workDurationSec,
      timeHoursTotal: costs.timeHours,
      timeHoursApplied: 0,
    };

    soundFX.playSelect();
    this.setState({
      ...this.state,
      pendingAction: action,
      ongoingTask: null,
    });
    this.emitFeedback({
      type: 'task_assigned',
      buildingId: task.buildingId,
      taskKind,
      label: task.title,
    });
  }

  public notifyCrewArrived(actionId: string) {
    const cur = this.state;
    if (
      cur.screen !== 'PLAYING' ||
      cur.sleepPhase !== 'idle' ||
      cur.sleepingRemaining > 0 ||
      !cur.pendingAction ||
      cur.pendingAction.id !== actionId ||
      cur.pendingAction.phase !== 'walking'
    ) {
      return;
    }

    const act = cur.pendingAction;
    if (act.kind === 'task') {
      const task = TASK_DEFINITIONS.find((t) => t.id === act.taskId);
      if (!task || !validateTask(task, cur).canExecute) {
        this.setState({ ...cur, pendingAction: null, ongoingTask: null });
        return;
      }
    } else if (act.kind === 'plant') {
      const check = canPlantCrop({
        cropId: act.cropId ?? '',
        greenhouse: cur.buildings.greenhouse,
        currentCrop: cur.greenhouseCrop,
        resources: cur.resources,
        hoursElapsed: cur.hoursElapsed,
        inShelter: cur.crew.inShelter,
      });
      if (!check.ok) {
        this.setState({ ...cur, pendingAction: null, ongoingTask: null });
        return;
      }
    } else if (act.kind === 'harvest') {
      const remainingHour = Math.max(0, 1 - act.timeHoursApplied);
      if (
        cur.crew.inShelter ||
        !cur.greenhouseCrop?.isMature ||
        cur.hoursElapsed + remainingHour > TOTAL_DAY_HOURS
      ) {
        this.setState({ ...cur, pendingAction: null, ongoingTask: null });
        return;
      }
    } else if (act.kind === 'activity') {
      const activity = cur.dailyActivities.find((a) => a.id === act.activityId);
      if (!activity || !validateDailyActivity(activity, cur, act.timeHoursApplied).canExecute) {
        this.setState({ ...cur, pendingAction: null, ongoingTask: null });
        return;
      }
    }

    const isInteractiveTask = act.kind === 'task';
    const workingAction: PendingCrewAction = {
      ...act,
      phase: 'working',
      workDurationSec: isInteractiveTask ? 0 : act.workDurationSec,
      workRemainingSec: isInteractiveTask ? 0 : act.workDurationSec,
    };

    soundFX.playWorkStart(workingAction.taskKind);
    this.setState({
      ...cur,
      pendingAction: workingAction,
      ongoingTask:
        act.kind === 'task' && act.taskId
          ? { taskId: act.taskId, buildingId: act.buildingId }
          : null,
    });
    this.emitFeedback({
      type: 'work_started',
      buildingId: workingAction.buildingId,
      taskKind: workingAction.taskKind,
      duration: workingAction.workDurationSec,
      label: workingAction.label,
    });
    if (!isInteractiveTask) {
      this.startWorkTicker();
    }
  }

  public cancelPendingAction() {
    const cur = this.state;
    if (!cur.pendingAction) return;
    this.stopWorkTicker();
    soundFX.playSelect();
    this.setState({
      ...cur,
      pendingAction: null,
      ongoingTask: null,
    });
  }

  public completePendingMinigame(actionId: string) {
    const cur = this.state;
    if (
      cur.screen !== 'PLAYING' ||
      cur.sleepPhase !== 'idle' ||
      !cur.pendingAction ||
      cur.pendingAction.id !== actionId ||
      cur.pendingAction.kind !== 'task'
    ) {
      return;
    }
    this.completePendingAction();
  }

  public completePendingAction() {
    const cur = this.state;
    if (cur.screen !== 'PLAYING' || cur.sleepPhase !== 'idle') return;
    const act = cur.pendingAction;
    if (!act) return;

    this.stopWorkTicker();
    const cleanState: GameState = {
      ...cur,
      pendingAction: null,
      ongoingTask: null,
    };

    if (act.kind === 'task') {
      const task = TASK_DEFINITIONS.find((t) => t.id === act.taskId);
      if (!task || !validateTask(task, cleanState, act.timeHoursApplied).canExecute) {
        this.setState(cleanState);
        return;
      }

      const prevCondition = cleanState.buildings[task.buildingId].condition;
      const executedState = applyTaskExecution(task, cleanState, act.timeHoursApplied);
      const hazardExposure = applyOutdoorActivityHazardConsequence(
        executedState,
        Math.max(1, act.timeHoursTotal)
      );
      let nextState = hazardExposure.nextState;
      const hazardCheck = clearMitigatedLingeringHazards(
        nextState.lingeringHazards,
        nextState.buildings
      );
      const nextCapacities = calculateResourceCapacities(
        nextState.buildings,
        nextState.difficulty
      );
      nextState = {
        ...nextState,
        ongoingTask: null,
        pendingAction: null,
        lingeringHazards: hazardCheck.remaining,
        capacities: nextCapacities,
        resources: clampResourcesToCapacity(nextState.resources, nextCapacities),
      };

      const newlyUnlocked = (Object.keys(nextState.buildings) as BuildingId[]).filter(
        (bId) =>
          !getBuildingUnlockStatus(bId, cleanState).unlocked &&
          getBuildingUnlockStatus(bId, nextState).unlocked
      );

      if (hazardExposure.healthDelta < 0 && nextState.crew.condition <= 10) {
        this.stopEventAnimationTicker();
        this.stopIdleTimeTicker();
        this.stopSleepTicker();
        this.stopWorkTicker();
        const radFail = Boolean(
          nextState.activeEvent?.definition.radiationLevel ||
            cleanState.lingeringHazards.some((h) => h.kind === 'ionizing_particles')
        );
        soundFX.playOutcomeFanfare(radFail ? 'fail_radiation' : 'fail_condition');
        this.setState({
          ...nextState,
          screen: 'GAME_OVER',
          sleepPhase: 'idle',
          sleepingRemaining: 0,
          ongoingTask: null,
          pendingAction: null,
          activeEvent: null,
          lingeringHazards: [],
          failureCause: radFail ? 'radiation' : 'condition',
          endingCutsceneCompleted: false,
          failureReason: radFail
            ? 'Crew suffered critical radiation and hazard exposure while working outdoors.'
            : 'Crew health dropped to a critical level from working outdoors during severe hazards.',
        });
        return;
      }

      soundFX.playRepair();
      if (hazardExposure.healthDelta < 0) {
        soundFX.playHealthWarning(hazardExposure.healthDelta <= -8);
      }
      if (hazardCheck.cleared.length > 0) {
        soundFX.playHealthRecovery();
      }
      this.setState(nextState);
      const taskKind: 'restore' | 'repair' | 'clean' =
        task.dustCleared && task.category === 'minor'
          ? 'clean'
          : task.category === 'major'
          ? 'restore'
          : 'repair';
      const conditionGain = Math.max(
        0,
        nextState.buildings[task.buildingId].condition - prevCondition
      );
      this.emitFeedback({
        type: 'task',
        buildingId: task.buildingId,
        label: task.title,
        taskKind,
        conditionGain,
      });
      if (hazardExposure.healthDelta < 0) {
        this.emitFeedback({
          type: 'crew_hazard_damage',
          delta: hazardExposure.healthDelta,
          reason: hazardExposure.reason ?? 'Outdoor hazard exposure',
        });
      }
      if (hazardCheck.cleared.length > 0) {
        this.emitFeedback({
          type: 'hazard_cleared',
          labels: hazardCheck.cleared.map((h) => h.label),
        });
      }
      if (newlyUnlocked.length > 0) {
        this.emitFeedback({
          type: 'systems_unlocked',
          buildings: newlyUnlocked,
        });
      }
    } else if (act.kind === 'plant' && act.cropId) {
      const check = canPlantCrop({
        cropId: act.cropId,
        greenhouse: cleanState.buildings.greenhouse,
        currentCrop: cleanState.greenhouseCrop,
        resources: cleanState.resources,
        hoursElapsed: cleanState.hoursElapsed,
        inShelter: cleanState.crew.inShelter,
        preAppliedTimeHours: act.timeHoursApplied,
      });
      if (!check.ok) {
        this.setState(cleanState);
        return;
      }

      const result = plantCropInGreenhouse({
        cropId: act.cropId,
        day: cleanState.day,
        resources: cleanState.resources,
        hoursElapsed: cleanState.hoursElapsed,
        preAppliedTimeHours: act.timeHoursApplied,
      });

      const plantedState: GameState = {
        ...cleanState,
        greenhouseCrop: result.crop,
        resources: result.resources,
        hoursElapsed: result.hoursElapsed,
        hoursRemaining: result.hoursRemaining,
        overtimeHours: result.overtimeHours,
        keyDecisions: [
          ...cleanState.keyDecisions,
          `Sol ${cleanState.day}: Planted Greenhouse crops`,
        ],
      };
      const hazardExposure = applyOutdoorActivityHazardConsequence(
        plantedState,
        Math.max(1, act.timeHoursTotal)
      );
      const nextState = hazardExposure.nextState;

      if (hazardExposure.healthDelta < 0 && nextState.crew.condition <= 10) {
        this.stopEventAnimationTicker();
        this.stopIdleTimeTicker();
        this.stopSleepTicker();
        this.stopWorkTicker();
        soundFX.playOutcomeFanfare('fail_condition');
        this.setState({
          ...nextState,
          screen: 'GAME_OVER',
          sleepPhase: 'idle',
          sleepingRemaining: 0,
          ongoingTask: null,
          pendingAction: null,
          activeEvent: null,
          lingeringHazards: [],
          failureCause: 'condition',
          endingCutsceneCompleted: false,
          failureReason:
            'Crew health dropped to a critical level from working outdoors during severe hazards.',
        });
        return;
      }

      soundFX.playPlantSeeds();
      if (hazardExposure.healthDelta < 0) {
        soundFX.playHealthWarning(hazardExposure.healthDelta <= -8);
      }
      this.setState(nextState);
      this.emitFeedback({ type: 'plant', buildingId: 'greenhouse' });
      if (hazardExposure.healthDelta < 0) {
        this.emitFeedback({
          type: 'crew_hazard_damage',
          delta: hazardExposure.healthDelta,
          reason: hazardExposure.reason ?? 'Outdoor hazard exposure',
        });
      }
    } else if (act.kind === 'harvest') {
      const result = harvestMatureCrop({
        crop: cleanState.greenhouseCrop,
        resources: cleanState.resources,
        capacities: cleanState.capacities,
        hoursElapsed: cleanState.hoursElapsed,
        inShelter: cleanState.crew.inShelter,
        preAppliedTimeHours: act.timeHoursApplied,
      });
      if (result.harvestedAmount <= 0) {
        this.setState(cleanState);
        return;
      }

      const harvestedState: GameState = {
        ...cleanState,
        greenhouseCrop: result.crop,
        resources: result.resources,
        hoursElapsed: result.hoursElapsed,
        hoursRemaining: result.hoursRemaining,
        overtimeHours: result.overtimeHours,
        harvestCount: cleanState.harvestCount + 1,
        keyDecisions: [
          ...cleanState.keyDecisions,
          `Sol ${cleanState.day}: Harvested +${result.harvestedAmount} Food`,
        ],
      };
      const hazardExposure = applyOutdoorActivityHazardConsequence(
        harvestedState,
        Math.max(1, act.timeHoursTotal)
      );
      const nextState = hazardExposure.nextState;

      if (hazardExposure.healthDelta < 0 && nextState.crew.condition <= 10) {
        this.stopEventAnimationTicker();
        this.stopIdleTimeTicker();
        this.stopSleepTicker();
        this.stopWorkTicker();
        soundFX.playOutcomeFanfare('fail_condition');
        this.setState({
          ...nextState,
          screen: 'GAME_OVER',
          sleepPhase: 'idle',
          sleepingRemaining: 0,
          ongoingTask: null,
          pendingAction: null,
          activeEvent: null,
          lingeringHazards: [],
          failureCause: 'condition',
          endingCutsceneCompleted: false,
          failureReason:
            'Crew health dropped to a critical level from working outdoors during severe hazards.',
        });
        return;
      }

      soundFX.playHarvest();
      if (hazardExposure.healthDelta < 0) {
        soundFX.playHealthWarning(hazardExposure.healthDelta <= -8);
      }
      this.setState(nextState);
      this.emitFeedback({
        type: 'harvest',
        buildingId: 'greenhouse',
        amount: result.harvestedAmount,
      });
      if (hazardExposure.healthDelta < 0) {
        this.emitFeedback({
          type: 'crew_hazard_damage',
          delta: hazardExposure.healthDelta,
          reason: hazardExposure.reason ?? 'Outdoor hazard exposure',
        });
      }
    } else if (act.kind === 'activity' && act.activityId) {
      const activity = cleanState.dailyActivities.find((a) => a.id === act.activityId);
      if (
        !activity ||
        !validateDailyActivity(activity, cleanState, act.timeHoursApplied).canExecute
      ) {
        this.setState(cleanState);
        return;
      }

      const executedState = applyDailyActivityExecution(
        activity,
        cleanState,
        act.timeHoursApplied
      );
      const hazardExposure = activity.isOutdoor
        ? applyOutdoorActivityHazardConsequence(
            executedState,
            Math.max(1, act.timeHoursTotal)
          )
        : { nextState: executedState, healthDelta: 0, radiationDelta: 0, reason: null };

      let nextState = hazardExposure.nextState;
      const hazardCheck = clearMitigatedLingeringHazards(
        nextState.lingeringHazards,
        nextState.buildings
      );
      const nextCapacities = calculateResourceCapacities(
        nextState.buildings,
        nextState.difficulty
      );
      nextState = {
        ...nextState,
        ongoingTask: null,
        pendingAction: null,
        lingeringHazards: hazardCheck.remaining,
        capacities: nextCapacities,
        resources: clampResourcesToCapacity(nextState.resources, nextCapacities),
      };

      if (hazardExposure.healthDelta < 0 && nextState.crew.condition <= 10) {
        this.stopEventAnimationTicker();
        this.stopIdleTimeTicker();
        this.stopSleepTicker();
        this.stopWorkTicker();
        const radFail = Boolean(
          nextState.activeEvent?.definition.radiationLevel ||
            cleanState.lingeringHazards.some((h) => h.kind === 'ionizing_particles')
        );
        soundFX.playOutcomeFanfare(radFail ? 'fail_radiation' : 'fail_condition');
        this.setState({
          ...nextState,
          screen: 'GAME_OVER',
          sleepPhase: 'idle',
          sleepingRemaining: 0,
          ongoingTask: null,
          pendingAction: null,
          activeEvent: null,
          lingeringHazards: [],
          failureCause: radFail ? 'radiation' : 'condition',
          endingCutsceneCompleted: false,
          failureReason: radFail
            ? 'Crew suffered critical radiation and hazard exposure during outdoor operations.'
            : 'Crew health dropped to a critical level from outdoor hazards.',
        });
        return;
      }

      if (activity.category === 'maintenance') {
        soundFX.playRepair();
      } else if (
        (activity.reward.crewHealthDelta ?? 0) > 0 ||
        (activity.reward.crewRadiationDelta ?? 0) < 0
      ) {
        soundFX.playHealthRecovery();
      } else {
        soundFX.playHarvest();
      }
      if (hazardExposure.healthDelta < 0) {
        soundFX.playHealthWarning(hazardExposure.healthDelta <= -8);
      }

      this.setState(nextState);
      this.emitFeedback({
        type: 'activity',
        buildingId: activity.buildingId,
        label: activity.title,
        rewardSummary: activity.rewardSummary,
      });
      if (hazardExposure.healthDelta < 0) {
        this.emitFeedback({
          type: 'crew_hazard_damage',
          delta: hazardExposure.healthDelta,
          reason: hazardExposure.reason ?? 'Outdoor hazard exposure',
        });
      }
      if (hazardCheck.cleared.length > 0) {
        this.emitFeedback({
          type: 'hazard_cleared',
          labels: hazardCheck.cleared.map((h) => h.label),
        });
      }
    }
  }

  public restCrew() {
    if (
      this.state.screen !== 'PLAYING' ||
      this.state.sleepPhase !== 'idle' ||
      this.state.sleepingRemaining > 0 ||
      this.state.pendingAction?.phase === 'working' ||
      isMajorEventCutsceneActive(this.state)
    ) {
      return;
    }
    const res = performCrewShortRest(
      this.state.crew,
      this.state.hoursElapsed,
      this.state.buildings
    );
    if (!res.rested) return;

    soundFX.playSelect();
    this.setState({
      ...this.state,
      pendingAction: null,
      ongoingTask: null,
      crew: res.crew,
      hoursElapsed: res.hoursElapsed,
      hoursRemaining: res.hoursRemaining,
      overtimeHours: res.overtimeHours,
    });
  }

  public toggleCrewShelter() {
    if (
      this.state.screen !== 'PLAYING' ||
      this.state.sleepPhase !== 'idle' ||
      this.state.sleepingRemaining > 0 ||
      this.state.pendingAction?.phase === 'working' ||
      isMajorEventCutsceneActive(this.state)
    ) {
      return;
    }
    const shelter = this.state.buildings.radiation_shelter;
    const nextInShelter = !this.state.crew.inShelter;
    // Entering shelter requires a restored, non-inactive shelter; leaving shelter is always permitted
    if (nextInShelter && (!shelter.restoredOnce || shelter.status === 'inactive')) return;

    let baseState = this.state;
    let latePenalty = 0;
    if (nextInShelter) {
      const lateResult = applyLateShelterPenalty(baseState);
      baseState = lateResult.nextState;
      latePenalty = lateResult.penalty;
    }

    const hazardActiveOnExit =
      !nextInShelter &&
      (isEventOfficiallyActive(this.state.activeEvent) ||
        (this.state.lingeringHazards?.length ?? 0) > 0);

    soundFX.playShelterToggle(nextInShelter);
    if (latePenalty > 0) {
      soundFX.playHealthWarning(latePenalty >= 12);
    } else if (hazardActiveOnExit && isShelterRequiredEvent(this.state.activeEvent)) {
      soundFX.playHealthWarning(false);
    }

    const extraNotes: string[] = [];
    if (nextInShelter && isShelterRequiredEvent(baseState.activeEvent)) {
      extraNotes.push(
        latePenalty > 0
          ? `Sol ${baseState.day}: Entered shelter late (-${latePenalty}% crew health)`
          : `Sol ${baseState.day}: Moved crew to Radiation Storm Shelter`
      );
    } else if (hazardActiveOnExit) {
      const exitNote = `Sol ${baseState.day}: Stepped outside during active hazard`;
      if (!baseState.keyDecisions.includes(exitNote)) {
        extraNotes.push(exitNote);
      }
    }

    const nextActiveEvent =
      nextInShelter &&
      baseState.activeEvent &&
      isShelterRequiredEvent(baseState.activeEvent)
        ? {
            ...baseState.activeEvent,
            shelterUsed: true,
          }
        : baseState.activeEvent;

    this.setState({
      ...baseState,
      pendingAction: null,
      ongoingTask: null,
      activeEvent: nextActiveEvent,
      crew: {
        ...baseState.crew,
        inShelter: nextInShelter,
      },
      keyDecisions:
        extraNotes.length > 0
          ? [...baseState.keyDecisions, ...extraNotes]
          : baseState.keyDecisions,
    });
    this.emitFeedback({ type: 'shelter', inShelter: nextInShelter });
    if (latePenalty > 0) {
      this.emitFeedback({
        type: 'crew_hazard_damage',
        delta: -latePenalty,
        reason: 'Late to shelter',
      });
    }
  }

  public plantCrop(cropId: string) {
    if (
      this.state.screen !== 'PLAYING' ||
      this.state.sleepPhase !== 'idle' ||
      this.state.sleepingRemaining > 0 ||
      this.state.pendingAction?.phase === 'working' ||
      isMajorEventCutsceneActive(this.state)
    ) {
      return;
    }
    const check = canPlantCrop({
      cropId,
      greenhouse: this.state.buildings.greenhouse,
      currentCrop: this.state.greenhouseCrop,
      resources: this.state.resources,
      hoursElapsed: this.state.hoursElapsed,
      inShelter: this.state.crew.inShelter,
    });
    if (!check.ok) return;

    const cropDef = CROP_MAP[cropId];
    const workDurationSec = 2.4;
    const action: PendingCrewAction = {
      id: `act_${Date.now()}_plant_${cropId}`,
      kind: 'plant',
      buildingId: 'greenhouse',
      cropId,
      taskKind: 'plant',
      assignedCrew: 'Player',
      label: cropDef ? `Plant ${cropDef.name}` : 'Plant Crops',
      phase: 'walking',
      workDurationSec,
      workRemainingSec: workDurationSec,
      timeHoursTotal: 1,
      timeHoursApplied: 0,
    };

    soundFX.playSelect();
    this.setState({
      ...this.state,
      pendingAction: action,
      ongoingTask: null,
    });
    this.emitFeedback({
      type: 'task_assigned',
      buildingId: 'greenhouse',
      taskKind: 'plant',
      label: action.label,
    });
  }

  public harvestCrop() {
    if (
      this.state.screen !== 'PLAYING' ||
      this.state.sleepPhase !== 'idle' ||
      this.state.sleepingRemaining > 0 ||
      this.state.pendingAction?.phase === 'working' ||
      isMajorEventCutsceneActive(this.state)
    ) {
      return;
    }
    if (
      this.state.crew.inShelter ||
      !this.state.greenhouseCrop?.isMature ||
      this.state.hoursElapsed + 1 > TOTAL_DAY_HOURS
    ) {
      return;
    }

    const workDurationSec = 2.4;
    const action: PendingCrewAction = {
      id: `act_${Date.now()}_harvest`,
      kind: 'harvest',
      buildingId: 'greenhouse',
      taskKind: 'harvest',
      assignedCrew: 'Player',
      label: 'Harvest Crops',
      phase: 'walking',
      workDurationSec,
      workRemainingSec: workDurationSec,
      timeHoursTotal: 1,
      timeHoursApplied: 0,
    };

    soundFX.playSelect();
    this.setState({
      ...this.state,
      pendingAction: action,
      ongoingTask: null,
    });
    this.emitFeedback({
      type: 'task_assigned',
      buildingId: 'greenhouse',
      taskKind: 'harvest',
      label: action.label,
    });
  }

  public startDailyActivity(activityId: string) {
    if (
      this.state.screen !== 'PLAYING' ||
      this.state.sleepPhase !== 'idle' ||
      this.state.sleepingRemaining > 0 ||
      this.state.pendingAction?.phase === 'working' ||
      isMajorEventCutsceneActive(this.state)
    ) {
      return;
    }

    const activity = this.state.dailyActivities.find((a) => a.id === activityId);
    if (!activity) return;
    const validation = validateDailyActivity(activity, this.state);
    if (!validation.canExecute) return;

    const taskKind = getActivityTaskAnimKind(activity.category);
    const performInsideShelter = this.state.crew.inShelter && !activity.isOutdoor;
    const targetBuildingId: BuildingId = performInsideShelter
      ? 'radiation_shelter'
      : activity.buildingId;

    const action: PendingCrewAction = {
      id: `act_${Date.now()}_${activity.id}`,
      kind: 'activity',
      buildingId: targetBuildingId,
      activityId: activity.id,
      activityCategory: activity.category,
      taskKind,
      assignedCrew: activity.assignedCrew,
      label: activity.title,
      phase: performInsideShelter ? 'working' : 'walking',
      workDurationSec: activity.workDurationSec,
      workRemainingSec: activity.workDurationSec,
      timeHoursTotal: activity.durationHours,
      timeHoursApplied: 0,
    };

    soundFX.playSelect();
    this.setState({
      ...this.state,
      pendingAction: action,
      ongoingTask: null,
    });

    if (performInsideShelter) {
      soundFX.playWorkStart(taskKind);
      this.emitFeedback({
        type: 'work_started',
        buildingId: targetBuildingId,
        taskKind,
        duration: activity.workDurationSec,
        label: activity.title,
      });
      this.startWorkTicker();
    } else {
      this.emitFeedback({
        type: 'task_assigned',
        buildingId: targetBuildingId,
        taskKind,
        label: activity.title,
      });
    }
  }

  public toggleDailyActivityPriority(activityId: string) {
    const idx = this.state.dailyActivities.findIndex((a) => a.id === activityId);
    if (idx === -1) return;
    const target = this.state.dailyActivities[idx];
    if (target.status !== 'available') return;
    soundFX.playSelect();
    const nextList = this.state.dailyActivities.map((item) =>
      item.id === activityId ? { ...item, prioritized: !item.prioritized } : item
    );
    this.setState({
      ...this.state,
      dailyActivities: nextList,
    });
  }

  public ignoreDailyActivity(activityId: string) {
    const target = this.state.dailyActivities.find((a) => a.id === activityId);
    if (!target || target.status !== 'available') return;
    soundFX.playSelect();
    const nextList = this.state.dailyActivities.map((item) =>
      item.id === activityId
        ? { ...item, status: 'ignored' as const, prioritized: false }
        : item
    );
    const nextCooldowns = {
      ...(this.state.activityCooldowns ?? {}),
      [target.templateId]: Math.max(
        this.state.activityCooldowns?.[target.templateId] ?? 0,
        this.state.day + 2
      ),
    };
    this.setState({
      ...this.state,
      dailyActivities: nextList,
      activityCooldowns: nextCooldowns,
    });
  }

  public restoreIgnoredDailyActivity(activityId: string) {
    const target = this.state.dailyActivities.find((a) => a.id === activityId);
    if (!target || target.status !== 'ignored') return;
    soundFX.playSelect();
    const nextList = this.state.dailyActivities.map((item) =>
      item.id === activityId ? { ...item, status: 'available' as const } : item
    );
    this.setState({
      ...this.state,
      dailyActivities: nextList,
    });
  }

  public completeEventCutscene() {
    if (
      this.state.screen !== 'PLAYING' ||
      !this.state.activeEvent ||
      this.state.activeEvent.cutsceneCompleted
    ) {
      return;
    }
    soundFX.playSelect();
    this.setState({
      ...this.state,
      activeEvent: {
        ...this.state.activeEvent,
        cutsceneCompleted: true,
      },
    });
    if (
      !this.state.lastDaySummary &&
      !this.state.gilDayHint &&
      !this.state.activeEvent.resolved &&
      this.state.activeEvent.animationRemaining > 0
    ) {
      this.startEventAnimationTicker();
    }
  }

  public acknowledgeActiveEvent() {
    if (
      this.state.screen !== 'PLAYING' ||
      !this.state.activeEvent ||
      this.state.activeEvent.animationRemaining > 0 ||
      this.state.sleepPhase === 'sleeping' ||
      isMajorEventCutsceneActive(this.state)
    ) {
      return;
    }
    this.stopEventAnimationTicker();
    const { nextState } = finalizeExpiredActiveEvent(this.state);
    this.setState({
      ...nextState,
      crew:
        this.state.sleepPhase === 'returning' && nextState.crew.inShelter
          ? { ...nextState.crew, inShelter: false }
          : nextState.crew,
    });
  }

  public chooseEventDecision(choiceId: string) {
    if (
      this.state.screen !== 'PLAYING' ||
      this.state.sleepPhase === 'sleeping' ||
      isMajorEventCutsceneActive(this.state)
    ) {
      return;
    }
    if (
      !this.state.activeEvent ||
      this.state.activeEvent.resolved ||
      this.state.activeEvent.selectedChoiceId
    ) {
      return;
    }

    const prevCondition = this.state.crew.condition;
    const { nextState, buildingImpacts } = applyMajorEventDecision(choiceId, this.state);
    const hazardCheck = clearMitigatedLingeringHazards(
      nextState.lingeringHazards,
      nextState.buildings
    );
    const nextCapacities = calculateResourceCapacities(nextState.buildings, nextState.difficulty);
    const finalState: GameState = {
      ...nextState,
      lingeringHazards: hazardCheck.remaining,
      capacities: nextCapacities,
      resources: clampResourcesToCapacity(nextState.resources, nextCapacities),
    };

    const healthDelta = finalState.crew.condition - prevCondition;
    soundFX.playDecisionChosen();
    const negativeDecisionImpacts = buildingImpacts.filter((b) => b.conditionDelta < 0);
    if (negativeDecisionImpacts.length > 0 && finalState.activeEvent) {
      soundFX.playInfrastructureDamageAudio({
        eventId: finalState.activeEvent.definition.id,
        phenomenon: finalState.activeEvent.definition.phenomenon,
        severity: finalState.activeEvent.definition.severity,
        impacts: negativeDecisionImpacts,
        impactIntensity: 'decision',
      });
    }
    if (healthDelta > 0) {
      soundFX.playHealthRecovery();
    } else if (healthDelta < 0) {
      soundFX.playHealthWarning(healthDelta <= -10);
    }
    this.setState(finalState);
    this.emitFeedback({
      type: 'decision',
      choiceTitle: finalState.activeEvent?.mitigationSummary ?? 'Decision applied',
      buildingImpacts,
    });
    if (healthDelta > 0) {
      this.emitFeedback({
        type: 'crew_health_recovery',
        delta: healthDelta,
        reason: finalState.activeEvent?.mitigationSummary ?? 'Shelter rest',
      });
    } else if (healthDelta < 0) {
      this.emitFeedback({
        type: 'crew_hazard_damage',
        delta: healthDelta,
        reason: finalState.activeEvent?.definition.title ?? 'Exposure',
      });
    }
  }

  public dismissDaySummary() {
    if (this.state.screen !== 'PLAYING' || !this.state.lastDaySummary) return;
    const prevSummary = this.state.lastDaySummary;
    const nextState: GameState = {
      ...this.state,
      lastDaySummary: null,
    };
    const hasActiveEventToday = Boolean(
      nextState.activeEvent && !nextState.activeEvent.resolved
    );
    const gilDayHint = hasActiveEventToday
      ? null
      : getPostDaySummaryGilHint(nextState, prevSummary);
    const nextAnnouncementDays = gilDayHint
      ? Array.from(new Set([...(nextState.gilAnnouncementDays ?? []), nextState.day]))
      : nextState.gilAnnouncementDays ?? [];
    soundFX.playSelect();
    this.setState({
      ...nextState,
      gilDayHint,
      gilAnnouncementDays: nextAnnouncementDays,
    });
    if (
      !gilDayHint &&
      !isMajorEventCutsceneActive(this.state) &&
      this.state.activeEvent &&
      !this.state.activeEvent.resolved &&
      this.state.activeEvent.animationRemaining > 0
    ) {
      this.startEventAnimationTicker();
    }
  }

  public dismissGilDayHint() {
    if (this.state.screen !== 'PLAYING' || !this.state.gilDayHint) return;
    soundFX.playSelect();
    this.setState({
      ...this.state,
      gilDayHint: null,
    });
    if (
      !isMajorEventCutsceneActive(this.state) &&
      this.state.activeEvent &&
      !this.state.activeEvent.resolved &&
      this.state.activeEvent.animationRemaining > 0
    ) {
      this.startEventAnimationTicker();
    }
  }

  public endDay() {
    if (
      this.state.screen !== 'PLAYING' ||
      this.state.sleepPhase !== 'idle' ||
      this.state.sleepingRemaining > 0 ||
      this.state.pendingAction?.phase === 'working' ||
      isMajorEventCutsceneActive(this.state)
    ) {
      return;
    }
    this.stopWorkTicker();
    soundFX.playSelect();
    this.setState({
      ...this.state,
      sleepPhase: 'returning',
      sleepingRemaining: 3,
      selectedBuildingId: null,
      pendingAction: null,
      ongoingTask: null,
    });
    if (
      this.state.crew.inShelter &&
      isShelterRequiredEvent(this.state.activeEvent) &&
      (this.state.activeEvent?.animationRemaining ?? 0) > 0
    ) {
      this.startEventAnimationTicker();
    }
    this.emitFeedback({ type: 'sleep_start' });
  }

  public beginHabitatSleep() {
    if (
      this.state.screen !== 'PLAYING' ||
      this.state.sleepPhase !== 'returning' ||
      isMajorEventCutsceneActive(this.state)
    ) {
      return;
    }
    if (
      this.state.crew.inShelter &&
      isShelterRequiredEvent(this.state.activeEvent) &&
      isEventOfficiallyActive(this.state.activeEvent) &&
      (this.state.activeEvent?.animationRemaining ?? 0) > 0
    ) {
      return;
    }
    this.stopEventAnimationTicker();
    this.setState({
      ...this.state,
      sleepPhase: 'sleeping',
      sleepingRemaining: 3,
    });
    this.startSleepTicker();
  }

  public completeEndDay() {
    if (this.state.screen !== 'PLAYING' || isMajorEventCutsceneActive(this.state)) return;

    this.stopSleepTicker();
    this.stopWorkTicker();
    const current: GameState = {
      ...this.state,
      sleepPhase: 'idle',
      sleepingRemaining: 0,
      ongoingTask: null,
      pendingAction: null,
    };
    const rates = calculateDailyRates({
      buildings: current.buildings,
      currentResources: current.resources,
      greenhouseCrop: current.greenhouseCrop,
      activeEvent: current.activeEvent,
      modifiers: current.modifiers,
      difficulty: current.difficulty,
    });

    // Apply net daily resource production and consumption
    const rawResources: ResourceAmounts = {
      oxygen: current.resources.oxygen + rates.production.oxygen - rates.consumption.oxygen,
      water: current.resources.water + rates.production.water - rates.consumption.water,
      food: current.resources.food + rates.production.food - rates.consumption.food,
      energy: current.resources.energy + rates.production.energy - rates.consumption.energy,
    };

    const hadEnoughWater = rawResources.water > 0;
    const hadEnoughEnergy = rates.hasPowerForLifeSupport;

    // Track pre-existing temporary malfunctions before end-of-day event fallback runs
    const hadPreExistingMalfunction = new Set<BuildingId>();
    for (const bId of Object.keys(current.buildings) as BuildingId[]) {
      if ((current.buildings[bId].malfunctionDaysRemaining ?? 0) > 0) {
        hadPreExistingMalfunction.add(bId);
      }
    }

    // Resolve active event effects if any occurred today
    let nextBuildings = { ...current.buildings };
    let postEventResources = { ...rawResources };
    let radiationGain = 0;
    let crewEnergyPenalty = 0;
    let buildingImpacts: BuildingEventImpact[] = [];
    let consumedExtraDust = false;
    let nextEventHistory = [...current.eventHistory];

    let nextScars = [...(current.environmentalScars ?? [])];
    let crewConditionAfterEvent = current.crew.condition;
    if (current.activeEvent) {
      const eventRes = resolveEventAtEndOfDay({
        activeEvent: current.activeEvent,
        buildings: nextBuildings,
        resources: postEventResources,
        crew: current.crew,
        modifiers: current.modifiers,
        seed: current.seed,
        day: current.day,
        difficulty: current.difficulty,
      });
      nextBuildings = eventRes.buildings;
      postEventResources = eventRes.resources;
      radiationGain = eventRes.radiationGain;
      crewEnergyPenalty = eventRes.crewEnergyPenalty;
      crewConditionAfterEvent = Math.max(
        0,
        crewConditionAfterEvent - eventRes.crewConditionPenalty
      );
      buildingImpacts = eventRes.buildingImpacts;
      consumedExtraDust = eventRes.consumedExtraDust;

      if (!nextScars.some((s) => s.day === current.day && s.eventId === current.activeEvent!.definition.id)) {
        nextScars = [...nextScars, ...createScarsForEvent(current.activeEvent.definition, current.day)].slice(-28);
      }

      if (
        !nextEventHistory.some(
          (entry) =>
            entry.day === current.day && entry.eventId === current.activeEvent!.definition.id
        )
      ) {
        nextEventHistory.push({
          day: current.day,
          eventId: current.activeEvent.definition.id,
          title: current.activeEvent.definition.title,
          severity: current.activeEvent.definition.severity,
          choiceTitle: current.activeEvent.mitigationSummary || undefined,
          outcomeSummary: eventRes.outcomeSummary,
        });
      }
    }

    // Advance/thaw temporary event malfunctions that already took effect today
    for (const bId of hadPreExistingMalfunction) {
      const b = nextBuildings[bId];
      const rem = b.malfunctionDaysRemaining ?? 0;
      if (rem > 0) {
        const nextRem = Math.max(0, rem - 1);
        const nextFrost = nextRem === 0 ? Math.max(0, (b.frostLevel ?? 0) - 65) : b.frostLevel ?? 0;
        const nextKind = nextRem > 0 ? b.malfunctionKind : nextFrost > 0 ? 'frost' : undefined;
        const stillHasDamage = b.status !== 'operational' || b.condition < 92 || nextFrost > 0 || nextRem > 0;
        nextBuildings[bId] = {
          ...b,
          malfunctionDaysRemaining: nextRem,
          malfunctionKind: nextKind,
          frostLevel: nextFrost,
          hasVisibleDamage: stillHasDamage,
          damageCause: stillHasDamage ? b.damageCause : undefined,
          damageSeverity: stillHasDamage ? b.damageSeverity : undefined,
        };
      }
    }

    // Gentle operational wear, daily Mars dust accumulation, and scheduled maintenance intervals
    const upcomingDay = current.day + 1;
    const solarInterval = MAINTENANCE_INTERVALS.solar_panels ?? 3;
    if (nextBuildings.solar_panels.status !== 'inactive') {
      const daysSinceSolar =
        upcomingDay - (nextBuildings.solar_panels.lastMaintainedDay ?? 1);
      const solarDue = daysSinceSolar > 0 && daysSinceSolar % solarInterval === 0;
      const nextDust = Math.min(
        100,
        Math.max(solarDue ? 15 : 0, nextBuildings.solar_panels.dustLevel + 4)
      );
      nextBuildings.solar_panels = {
        ...nextBuildings.solar_panels,
        dustLevel: nextDust,
      };
      if (solarDue) {
        nextBuildings.solar_panels = applyBuildingConditionChange(
          nextBuildings.solar_panels,
          -5,
          false,
          'wear'
        );
      }
    }

    for (const tankId of ['water_storage', 'food_storage'] as BuildingId[]) {
      const interval = MAINTENANCE_INTERVALS[tankId] ?? 5;
      const b = nextBuildings[tankId];
      if (b.status !== 'inactive') {
        const daysSince = upcomingDay - (b.lastMaintainedDay ?? 1);
        if (daysSince > 0 && daysSince % interval === 0) {
          nextBuildings[tankId] = applyBuildingConditionChange(b, -8, false, 'wear');
        }
      }
    }

    // Staggered Martian environmental wear across active core & support systems so maintenance stays meaningful
    const staggeredWearSchedule: Array<{ id: BuildingId; interval: number; offset: number; wear: number }> = [
      { id: 'oxygen_generator', interval: 3, offset: 0, wear: -5 },
      { id: 'water_recycling', interval: 3, offset: 1, wear: -5 },
      { id: 'greenhouse', interval: 3, offset: 2, wear: -5 },
      { id: 'main_habitat', interval: 4, offset: 1, wear: -5 },
      { id: 'radiation_shelter', interval: 5, offset: 2, wear: -5 },
      { id: 'energy_storage', interval: 5, offset: 3, wear: -5 },
      { id: 'oxygen_storage', interval: 5, offset: 4, wear: -5 },
      { id: 'maintenance_facility', interval: 4, offset: 2, wear: -5 },
    ];
    for (const entry of staggeredWearSchedule) {
      const b = nextBuildings[entry.id];
      if (b.status === 'operational') {
        const daysSince = upcomingDay - (b.lastMaintainedDay ?? 1);
        if (daysSince >= 2 && (current.day + entry.offset) % entry.interval === 0) {
          nextBuildings[entry.id] = applyBuildingConditionChange(b, entry.wear, false, 'wear');
        }
      }
    }

    const nextCapacities = calculateResourceCapacities(nextBuildings, current.difficulty);
    const finalResources = clampResourcesToCapacity(postEventResources, nextCapacities);

    // Check depleted resources before crew recovery
    const shortages: string[] = [];
    if (finalResources.oxygen <= 0) shortages.push('Oxygen');
    if (finalResources.water <= 0) shortages.push('Water');
    if (finalResources.food <= 0) shortages.push('Food');
    if (finalResources.energy <= 0 && nextBuildings.solar_panels.status === 'inactive') {
      shortages.push('Energy');
    }

    // Advance greenhouse crop growth
    const cropUpdate = advanceCropGrowth({
      crop: current.greenhouseCrop,
      buildings: nextBuildings,
      hadEnoughWater,
      hadEnoughEnergy,
      eventPenalty: current.activeEvent?.definition.cropGrowthPenalty ?? 0,
      cropBoostDaysLeft: current.modifiers.cropBoostDaysLeft,
    });

    // Update carry-over modifiers at end of day
    const nextModifiers = {
      ...current.modifiers,
      cropBoostDaysLeft: Math.max(0, current.modifiers.cropBoostDaysLeft - 1),
      extraDustNextStorm: consumedExtraDust ? 0 : current.modifiers.extraDustNextStorm,
      lastDecisionNote: null,
    };

    // Tick pre-existing lingering environmental hazards from prior Sols; preserve any spawned today
    const todayHazardSuffix = `_${current.day}`;
    const hazardsFromPrevSols = (current.lingeringHazards ?? []).filter(
      (h) => !h.id.endsWith(todayHazardSuffix)
    );
    const todaysSpawnedHazards = (current.lingeringHazards ?? []).filter((h) =>
      h.id.endsWith(todayHazardSuffix)
    );
    const preMitigated = clearMitigatedLingeringHazards(hazardsFromPrevSols, nextBuildings);
    const lingeringTick = tickLingeringHazardsEndOfDay(
      preMitigated.remaining,
      current.difficulty,
      current.crew.inShelter,
      nextBuildings.main_habitat.status === 'operational'
    );
    const preMitigatedToday = clearMitigatedLingeringHazards(
      todaysSpawnedHazards,
      nextBuildings
    ).remaining;

    let nextLingeringHazards = [...lingeringTick.remaining];
    for (const h of preMitigatedToday) {
      nextLingeringHazards = [
        ...nextLingeringHazards.filter((existing) => existing.kind !== h.kind),
        h,
      ];
    }
    if (current.activeEvent && !current.activeEvent.aftermathApplied) {
      const spawnedHazard = createLingeringHazardForEvent(
        current.activeEvent.definition,
        current.day
      );
      if (spawnedHazard) {
        const checkedSpawn = clearMitigatedLingeringHazards([spawnedHazard], nextBuildings);
        if (checkedSpawn.remaining.length > 0) {
          nextLingeringHazards = [
            ...nextLingeringHazards.filter((h) => h.kind !== spawnedHazard.kind),
            spawnedHazard,
          ];
        }
      }
    }

    // Crew recovery and radiation/lingering hazard effects
    const startConditionForSummary = current.crew.condition;
    const crewUpdate = resolveDailyCrewRecovery({
      crew: {
        ...current.crew,
        condition: crewConditionAfterEvent,
        energy: Math.max(0, current.crew.energy - crewEnergyPenalty),
      },
      buildings: nextBuildings,
      shortages,
      radiationGain,
      lingeringHazardDamage: lingeringTick.totalDamage,
      overtimeHours: current.overtimeHours,
      skipRadiationConditionPenalty: Boolean(current.activeEvent?.definition.radiationLevel),
    });
    const overtimeFatiguePenalty = current.overtimeHours > 0 ? crewUpdate.fatiguePenalty : 0;
    const totalSummaryHealthDelta = crewUpdate.crew.condition - startConditionForSummary;

    const summaryNotes: string[] = [];
    if (current.overtimeHours > 0) {
      const sleepHoursLabel = Number(crewUpdate.sleepHours.toFixed(1));
      summaryNotes.push(
        `Overtime Fatigue: Worked ${formatOvertimeLabel(current.overtimeHours)} past 9:00 PM — ${sleepHoursLabel}h sleep (+${crewUpdate.energyRecovered}% stamina).`
      );
    }
    if (cropUpdate.justMatured) {
      summaryNotes.push('Greenhouse crops are ripe and ready to harvest!');
    }
    if (current.activeEvent?.mitigationSummary) {
      summaryNotes.push(`Decision Applied: ${current.activeEvent.mitigationSummary}.`);
    }
    if (current.modifiers.cropBoostDaysLeft > 0 && cropUpdate.growthDelta > 0) {
      summaryNotes.push('Overdrive greenhouse lights sped up crop growth.');
    }
    if (current.activeEvent?.definition.radiationLevel) {
      const shelteredDuringBurst =
        current.crew.inShelter || Boolean(current.activeEvent.shelterUsed);
      summaryNotes.push(
        shelteredDuringBurst
          ? current.activeEvent.shelterEnteredLate
            ? `Entered Radiation Storm Shelter late (-${current.activeEvent.lateEntryHealthPenalty ?? 0}% health).`
            : 'Crew sheltered during radiation burst.'
          : 'Crew exposed to solar radiation outside shelter.'
      );
    }
    if (lingeringTick.totalDamage > 0) {
      summaryNotes.push(
        `Lingering Hazard (${lingeringTick.activeLabels.join(', ')}): -${lingeringTick.totalDamage}% crew health.`
      );
    } else if (totalSummaryHealthDelta > 0) {
      summaryNotes.push(
        `Habitat Med-Care restored +${totalSummaryHealthDelta}% crew health overnight.`
      );
    }
    if (nextLingeringHazards.length > 0) {
      summaryNotes.push(
        `Active Outdoor Hazard Tomorrow: ${nextLingeringHazards.map((h) => h.label).join(', ')}.`
      );
    }

    const daySummary: DaySummary = {
      day: current.day,
      production: rates.production,
      consumption: rates.consumption,
      waterRecycled: rates.waterRecycled,
      cropGrowthDelta: cropUpdate.growthDelta,
      cropReadyToHarvest: cropUpdate.justMatured,
      crewEnergyRecovered: crewUpdate.energyRecovered,
      healthDelta: totalSummaryHealthDelta,
      overtimeHours: current.overtimeHours,
      fatiguePenalty: overtimeFatiguePenalty,
      buildingImpacts,
      lingeringHazardLabels: nextLingeringHazards.map((h) => h.label),
      shortages,
      notes: summaryNotes,
    };

    // Check Mission Failure conditions
    let failureReason: string | null = null;
    let failureCause: FailureCause | null = null;
    if (finalResources.oxygen <= 0) {
      failureCause = 'oxygen';
      failureReason =
        'Oxygen reserves dropped to zero. Restore and maintain the Oxygen Generation System earlier to keep breathable air flowing.';
    } else if (finalResources.water <= 0) {
      failureCause = 'water';
      failureReason =
        'Water supplies ran completely dry. Restore the Water Recovery System early to recover used water.';
    } else if (finalResources.food <= 0) {
      failureCause = 'food';
      failureReason =
        'Food rations ran out. Restore the Greenhouse and plant crops early so harvests arrive in time.';
    } else if (crewUpdate.crew.condition <= 10) {
      failureCause = current.activeEvent?.definition.radiationLevel ? 'radiation' : 'condition';
      failureReason =
        'Crew condition reached a critical level from shortages, hazards, or radiation exposure.';
    }

    if (failureReason) {
      this.stopIdleTimeTicker();
      soundFX.playOutcomeFanfare(`fail_${failureCause ?? 'condition'}`);
      this.setState({
        ...current,
        screen: 'GAME_OVER',
        sleepPhase: 'idle',
        sleepingRemaining: 0,
        ongoingTask: null,
        pendingAction: null,
        resources: finalResources,
        capacities: nextCapacities,
        buildings: nextBuildings,
        crew: crewUpdate.crew,
        greenhouseCrop: cropUpdate.crop,
        activeEvent: null,
        lingeringHazards: [],
        eventHistory: nextEventHistory,
        modifiers: nextModifiers,
        lastDaySummary: daySummary,
        gilDayHint: null,
        failureReason,
        failureCause,
        endingCutsceneCompleted: false,
      });
      return;
    }

    // Check End of Day 30 -> Long-Term Sustainability Assessment
    if (current.day >= MAX_MISSION_DAYS) {
      this.stopIdleTimeTicker();
      const completedState: GameState = {
        ...current,
        sleepPhase: 'idle',
        sleepingRemaining: 0,
        ongoingTask: null,
        pendingAction: null,
        resources: finalResources,
        capacities: nextCapacities,
        buildings: nextBuildings,
        crew: crewUpdate.crew,
        greenhouseCrop: cropUpdate.crop,
        activeEvent: null,
        lingeringHazards: [],
        eventHistory: nextEventHistory,
        modifiers: nextModifiers,
        lastDaySummary: null,
        gilDayHint: null,
      };
      const assessment = evaluateSustainability(completedState);
      const outcomeKind = assessment.passed
        ? assessment.outcome === 'Sustainable'
          ? 'victory_sustainable'
          : 'victory_improvements'
        : 'survived_failed';
      soundFX.playOutcomeFanfare(outcomeKind);
      this.setState({
        ...completedState,
        screen: 'MISSION_REPORT',
        failureCause: null,
        endingCutsceneCompleted: false,
        assessment,
      });
      return;
    }

    // Advance to next Martian day (starts at 5:00 AM)
    this.stopEventAnimationTicker();
    const nextDay = current.day + 1;
    const nextEvent = createActiveEventForDay(
      nextDay,
      current.scheduledEventDays,
      current.difficulty
    );

    if (nextEvent) {
      if (nextEvent.definition.severity !== 'minor') {
        soundFX.playMajorEventSting(nextEvent.definition.id);
      } else {
        soundFX.playMinorEventSting(nextEvent.definition.id);
      }
    } else {
      soundFX.playEndDay();
    }
    if (totalSummaryHealthDelta > 0) {
      soundFX.playHealthRecovery();
    } else if (totalSummaryHealthDelta <= -5) {
      soundFX.playHealthWarning(totalSummaryHealthDelta <= -12);
    }

    const nextAnnouncementDays =
      nextEvent && nextEvent.definition.severity !== 'minor'
        ? Array.from(new Set([...(current.gilAnnouncementDays ?? []), nextDay]))
        : current.gilAnnouncementDays ?? [];

    const nextSolBaseState: GameState = {
      ...current,
      day: nextDay,
      hoursRemaining: MAX_DAILY_HOURS,
      hoursElapsed: WORK_START_HOUR,
      overtimeHours: 0,
      sleepPhase: 'idle',
      sleepingRemaining: 0,
      ongoingTask: null,
      pendingAction: null,
      phase: getPhaseForDay(nextDay),
      resources: finalResources,
      capacities: nextCapacities,
      buildings: nextBuildings,
      crew: crewUpdate.crew,
      greenhouseCrop: cropUpdate.crop,
      activeEvent: nextEvent,
      lingeringHazards: nextLingeringHazards,
      eventHistory: nextEventHistory,
      environmentalScars: nextScars,
      modifiers: nextModifiers,
      lastDaySummary: daySummary,
      gilDayHint: null,
      gilAnnouncementDays: nextAnnouncementDays,
      dailyActivities: [],
    };
    const nextDailyActivities = generateDailyActivitiesForSol(nextSolBaseState);

    this.setState({
      ...nextSolBaseState,
      dailyActivities: nextDailyActivities,
    });
    this.emitFeedback({ type: 'end_day', day: nextDay, buildingImpacts });
    if (totalSummaryHealthDelta > 0) {
      this.emitFeedback({
        type: 'crew_health_recovery',
        delta: totalSummaryHealthDelta,
        reason: 'Overnight rest',
      });
    } else if (totalSummaryHealthDelta < 0) {
      this.emitFeedback({
        type: 'crew_hazard_damage',
        delta: totalSummaryHealthDelta,
        reason: lingeringTick.totalDamage > 0 ? 'Lingering hazard' : 'Exposure',
      });
    }
    if (nextDay === 2) {
      const unlockedAtDawn = (Object.keys(nextBuildings) as BuildingId[]).filter(
        (bId) => !getBuildingUnlockStatus(bId, current).unlocked
      );
      if (unlockedAtDawn.length > 0) {
        this.emitFeedback({ type: 'systems_unlocked', buildings: unlockedAtDawn });
      }
    }
  }
}

export const gameStore = new GameStore();

// Helper for getting Building display name safely
export function getFacilityName(id: BuildingId): string {
  return BUILDING_DEFINITIONS[id].name;
}
