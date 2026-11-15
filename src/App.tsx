import { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { BuildingPanel } from './components/buildings/BuildingPanel';
import { GILPanel } from './components/gil/GILPanel';
import { BottomRightControls, EndDayDock, GameHUD } from './components/hud/GameHUD';
import {
  DaySummaryModal,
  DescriptionModal,
  DescriptionModalData,
  GilDayHintModal,
  PauseModal,
} from './components/mission/MissionModals';
import { EndingCutscene } from './components/mission/EndingCutscene';
import { MajorEventCutscene } from './components/mission/MajorEventCutscene';
import { MissionReport } from './components/mission/MissionReport';
import { StoryIntroCinematic } from './components/mission/StoryIntroCinematic';
import { RepairMinigameModal } from './components/minigames/RepairMinigameModal';
import {
  getAvailableTaskItems,
  MajorTasksSidebar,
} from './components/tasks/MajorTasksSidebar';
import { TitleScreen } from './components/TitleScreen';
import { BUILDING_DEFINITIONS } from './data/buildings';
import { SUBJECT_DESCRIPTIONS } from './data/nasa';
import { PhaserGameHost } from './game/PhaserGameHost';
import { gameStore, WorldFeedbackEvent } from './state/gameStore';
import { MusicTheme, soundFX } from './systems/audio';
import { isMajorEventCutsceneActive } from './systems/events';
import { GameState } from './types/game';
import {
  focusGameplayCanvas,
  isEditableTarget,
  releaseActiveElementFocus,
} from './utils/keyboard';

export default function App() {
  const [state, setState] = useState<GameState>(() => gameStore.getState());
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [tutorialStepFeedback, setTutorialStepFeedback] = useState<string | null>(null);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [descriptionModal, setDescriptionModal] = useState<DescriptionModalData | null>(null);
  const [eventImpactFlashKey, setEventImpactFlashKey] = useState<number | null>(null);

  useEffect(() => {
    const unsubscribe = gameStore.subscribe((next) => {
      setState(next);
    });
    return unsubscribe;
  }, []);

  // Unlock Web Audio gracefully on first user interaction so soft Main Menu music starts cleanly
  useEffect(() => {
    const unlock = () => {
      soundFX.unlockAudio();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Orchestrate non-repetitive atmospheric background music across screens, cutscenes & major events
  useEffect(() => {
    let theme: MusicTheme = 'none';
    if (state.screen === 'PAUSED') {
      theme = 'none';
    } else if (state.screen === 'TITLE_MENU') {
      theme = 'main_menu';
    } else if (state.screen === 'INTRO_CINEMATIC') {
      theme = 'intro_cutscene';
    } else if (state.screen === 'MISSION_REPORT' || state.screen === 'GAME_OVER') {
      if (!state.endingCutsceneCompleted) {
        if (state.screen === 'GAME_OVER') {
          theme = 'ending_failure';
        } else if (state.assessment?.passed) {
          theme = 'ending_victory';
        } else {
          theme = 'ending_survived_failed';
        }
      } else {
        theme =
          state.screen === 'MISSION_REPORT' && state.assessment?.passed
            ? 'mission_report_pass'
            : 'mission_report_fail';
      }
    } else if (
      state.screen === 'PLAYING' &&
      state.activeEvent &&
      !state.activeEvent.resolved &&
      state.activeEvent.definition.severity !== 'minor'
    ) {
      const id = state.activeEvent.definition.id;
      if (id === 'solar_storm_response') {
        theme = 'event_solar_storm';
      } else if (id === 'solar_energetic_particles') {
        theme = 'event_sep_storm';
      } else if (id === 'global_dust_storm') {
        theme = 'event_global_dust';
      } else {
        theme = 'gameplay_ambient';
      }
    } else if (state.screen === 'PLAYING') {
      theme = 'gameplay_ambient';
    }
    soundFX.setMusicTheme(theme);
  }, [
    state.screen,
    state.endingCutsceneCompleted,
    state.assessment?.passed,
    state.activeEvent?.definition.id,
    state.activeEvent?.definition.severity,
    state.activeEvent?.resolved,
  ]);

  // Immediate clear feedback banner after every player action & tutorial step
  useEffect(() => {
    let timer: number | undefined;
    let tutorialTimer: number | undefined;
    let impactTimer: number | undefined;
    const unsubFeedback = gameStore.onFeedback((evt: WorldFeedbackEvent) => {
      let msg = '';
      if (evt.type === 'task') {
        const bName = BUILDING_DEFINITIONS[evt.buildingId].shortName;
        msg = `${evt.label} — ${bName} updated!`;
      } else if (evt.type === 'plant') {
        msg = 'Seeds planted in Greenhouse!';
      } else if (evt.type === 'harvest') {
        msg = `Got +${evt.amount} Food!`;
      } else if (evt.type === 'shelter') {
        msg = evt.inShelter
          ? 'All crew & GIL inside Shelter!'
          : 'Crew back outside — tasks ready!';
      } else if (evt.type === 'decision') {
        msg = `Plan chosen: ${evt.choiceTitle}`;
      } else if (evt.type === 'event_impact') {
        msg = 'Outpost systems took weather damage!';
        setEventImpactFlashKey(Date.now());
        window.clearTimeout(impactTimer);
        impactTimer = window.setTimeout(() => setEventImpactFlashKey(null), 540);
      } else if (evt.type === 'systems_unlocked') {
        const names = evt.buildings
          .map((id) => BUILDING_DEFINITIONS[id].shortName)
          .join(', ');
        msg = `Unlocked: ${names}!`;
      } else if (evt.type === 'tutorial_step_complete') {
        msg = `Step Complete: ${evt.label}`;
        setTutorialStepFeedback(evt.label);
        window.clearTimeout(tutorialTimer);
        tutorialTimer = window.setTimeout(() => setTutorialStepFeedback(null), 2600);
      }
      if (msg) {
        setActionToast(msg);
        window.clearTimeout(timer);
        timer = window.setTimeout(() => setActionToast(null), 2800);
      }
    });

    return () => {
      unsubFeedback();
      window.clearTimeout(timer);
      window.clearTimeout(tutorialTimer);
      window.clearTimeout(impactTimer);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      if (e.key !== 'Escape') return;
      if (isEditableTarget(e.target)) {
        releaseActiveElementFocus();
        return;
      }
      const current = gameStore.getState();
      const hasCenteredModalOpen =
        Boolean(descriptionModal) ||
        current.screen === 'PAUSED' ||
        (current.screen === 'PLAYING' &&
          (isMajorEventCutsceneActive(current) ||
            Boolean(current.lastDaySummary) ||
            Boolean(current.gilDayHint) ||
            (current.pendingAction?.phase === 'working' &&
              current.pendingAction.kind === 'task')));

      if (hasCenteredModalOpen) return;

      if (current.screen === 'PLAYING') {
        if (leftDrawerOpen) {
          setLeftDrawerOpen(false);
        } else if (current.selectedBuildingId) {
          gameStore.selectBuilding(null);
        } else {
          gameStore.setScreen('PAUSED');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [leftDrawerOpen, descriptionModal]);

  useEffect(() => {
    if (
      state.screen === 'TITLE_MENU' ||
      state.screen === 'INTRO_CINEMATIC' ||
      state.screen === 'GAME_OVER' ||
      state.screen === 'MISSION_REPORT'
    ) {
      setDescriptionModal(null);
      setLeftDrawerOpen(false);
    }
  }, [state.screen]);

  useEffect(() => {
    const handleSelectRocket = () => {
      const entry = SUBJECT_DESCRIPTIONS.orion;
      if (!entry) return;
      if (gameStore.getState().selectedBuildingId) {
        gameStore.selectBuilding(null);
      }
      if (window.innerWidth < 768 || window.innerHeight < 520) {
        setLeftDrawerOpen(false);
      }
      setDescriptionModal({
        title: entry.title,
        description: entry.description,
        imageUrl: entry.imageUrl,
        credit: entry.credit,
        capabilities: entry.capabilities,
      });
    };
    window.addEventListener('mars30:select-rocket', handleSelectRocket);
    return () => window.removeEventListener('mars30:select-rocket', handleSelectRocket);
  }, []);

  // On narrow portrait or short landscape viewports, keep left tasks drawer and building panel mutually exclusive
  useEffect(() => {
    if (
      state.selectedBuildingId &&
      (window.innerWidth < 768 || window.innerHeight < 520)
    ) {
      setLeftDrawerOpen(false);
    }
  }, [state.selectedBuildingId]);

  const isFreeGameplayInputActive =
    state.screen === 'PLAYING' &&
    !descriptionModal &&
    !isMajorEventCutsceneActive(state) &&
    !state.lastDaySummary &&
    !state.gilDayHint &&
    !(state.pendingAction?.phase === 'working' && state.pendingAction.kind === 'task');

  const prevFreeGameplayRef = useRef(false);
  useEffect(() => {
    if (isFreeGameplayInputActive && !prevFreeGameplayRef.current) {
      focusGameplayCanvas();
    }
    prevFreeGameplayRef.current = isFreeGameplayInputActive;
  }, [isFreeGameplayInputActive]);

  const availableTaskCount = getAvailableTaskItems(state).length;
  const isTaskProgressActive =
    state.screen === 'PLAYING' && state.pendingAction?.phase === 'working';
  const isEventCentered = isMajorEventCutsceneActive(state);
  const isDaySummaryCentered =
    state.screen === 'PLAYING' && Boolean(state.lastDaySummary);
  const isGilReportCentered =
    state.screen === 'PLAYING' &&
    !state.lastDaySummary &&
    Boolean(state.gilDayHint) &&
    !isMajorEventCutsceneActive(state);
  const isGilCenteredActive = isEventCentered || isDaySummaryCentered || isGilReportCentered;

  const activeEventDef =
    state.screen === 'PLAYING' && state.activeEvent && !state.activeEvent.resolved
      ? state.activeEvent.definition
      : null;

  const eventEdgeGlowColor =
    activeEventDef?.phenomenon === 'water_ice_clouds'
      ? 'rgba(125, 211, 252, 0.36)'
      : activeEventDef?.phenomenon === 'secondary_neutron_cascades'
      ? 'rgba(167, 139, 250, 0.34)'
      : activeEventDef?.phenomenon === 'solar_energetic_particles'
      ? 'rgba(232, 121, 249, 0.38)'
      : activeEventDef?.phenomenon === 'solar_flare_xray_uv'
      ? 'rgba(244, 197, 82, 0.36)'
      : activeEventDef?.phenomenon === 'solar_storm_response'
      ? 'rgba(201, 75, 67, 0.42)'
      : activeEventDef?.phenomenon === 'global_dust_storm'
      ? 'rgba(215, 123, 74, 0.48)'
      : activeEventDef?.phenomenon === 'dust_devils'
      ? 'rgba(233, 183, 123, 0.3)'
      : activeEventDef?.phenomenon === 'marsquake'
      ? 'rgba(215, 123, 74, 0.34)'
      : null;

  return (
    <main
      className={`relative w-full h-dvh overflow-hidden bg-[#060914] ${
        eventImpactFlashKey && state.screen === 'PLAYING' ? 'animate-event-quake-nudge' : ''
      }`}
    >
      {/* Isolated Phaser 2D Outpost Canvas (always centered and primary focus) */}
      <PhaserGameHost />

      {/* Non-blocking Atmospheric Event Edge Glow & Impact Screen Feedback */}
      {activeEventDef && eventEdgeGlowColor && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[6] pointer-events-none transition-opacity duration-300"
          style={{
            boxShadow: `inset 0 0 ${
              activeEventDef.severity === 'minor' ? '72px' : '118px'
            } ${eventEdgeGlowColor}`,
          }}
        />
      )}
      {eventImpactFlashKey && state.screen === 'PLAYING' && (
        <div
          key={eventImpactFlashKey}
          aria-hidden="true"
          className="fixed inset-0 z-[7] pointer-events-none animate-event-impact-flash"
          style={{
            background:
              activeEventDef?.phenomenon === 'water_ice_clouds'
                ? 'radial-gradient(circle at center, transparent 42%, rgba(187, 232, 255, 0.32) 100%)'
                : activeEventDef?.phenomenon === 'solar_energetic_particles' ||
                  activeEventDef?.phenomenon === 'secondary_neutron_cascades'
                ? 'radial-gradient(circle at center, transparent 42%, rgba(192, 132, 252, 0.34) 100%)'
                : 'radial-gradient(circle at center, transparent 42%, rgba(201, 75, 67, 0.34) 100%)',
          }}
        />
      )}

      {/* Title Screen */}
      {state.screen === 'TITLE_MENU' && (
        <TitleScreen
          initialDifficulty={state.difficulty}
          initialPlayerName={state.playerName}
          audioMuted={state.audioMuted}
          savedMission={gameStore.getSavedMissionPreview()}
          onToggleMute={() => gameStore.toggleMute()}
          onResumeSaved={() => gameStore.resumeSavedMission()}
          onStart={(difficulty, playerName) =>
            gameStore.beginIntro(difficulty, playerName)
          }
        />
      )}

      {/* Story Introduction & Landing Cinematic */}
      {state.screen === 'INTRO_CINEMATIC' && (
        <StoryIntroCinematic
          playerName={state.playerName}
          onComplete={() => gameStore.completeIntro()}
        />
      )}

      {/* Uncluttered Clash-of-Clans-Inspired Gameplay HUD Shell */}
      {(state.screen === 'PLAYING' || state.screen === 'PAUSED') && (
        <div
          data-paused={state.screen === 'PAUSED' ? 'true' : 'false'}
          className="fixed inset-0 z-10 pointer-events-none flex justify-center"
        >
          <div className="w-full max-w-[1440px] h-full pt-[max(0.375rem,env(safe-area-inset-top))] pb-[max(0.375rem,env(safe-area-inset-bottom))] pl-[max(0.375rem,env(safe-area-inset-left))] pr-[max(0.375rem,env(safe-area-inset-right))] mobile-landscape:py-1.5 lg:p-3 flex flex-col gap-1.5 mobile-landscape:gap-1.5 lg:gap-3">
            {/* Row 1: Icon-First Top HUD */}
            <GameHUD
              state={state}
              availableTaskCount={availableTaskCount}
              leftDrawerOpen={leftDrawerOpen}
              isTaskProgressActive={isTaskProgressActive}
              onToggleLeftDrawer={() => {
                setLeftDrawerOpen((v) => {
                  const next = !v;
                  if (next) {
                    gameStore.markTutorialDrawerOpened();
                    if (window.innerWidth < 768 || window.innerHeight < 520) {
                      gameStore.selectBuilding(null);
                    }
                  }
                  return next;
                });
              }}
              onRestCrew={() => gameStore.restCrew()}
              onSelectBuilding={(id) =>
                id ? gameStore.focusBuilding(id) : gameStore.selectBuilding(null)
              }
              onSelectEventDecision={(choiceId) => gameStore.chooseEventDecision(choiceId)}
            />

            {/* Row 2: Open Outpost Stage + Auto-Tucking Side Drawers + Mobile Bottom Sheet + Bottom-Left GIL */}
            <div className="relative flex-1 min-h-0 flex items-stretch justify-between gap-2 lg:gap-3">
              {/* Closable Left Tasks/Systems Drawer */}
              {leftDrawerOpen && (
                <div className="absolute inset-y-0 left-0 z-20 w-[min(285px,calc(100vw-0.75rem))] mobile-landscape:w-[255px] lg:w-[290px] shrink-0 min-h-0 flex flex-col pointer-events-none">
                  <MajorTasksSidebar
                    state={state}
                    minimized={isTaskProgressActive}
                    onClose={() => setLeftDrawerOpen(false)}
                    onRestCrew={() => gameStore.restCrew()}
                    onToggleShelter={() => gameStore.toggleCrewShelter()}
                    onEndDay={() => gameStore.endDay()}
                    onLocateBuilding={(id) => {
                      gameStore.focusBuilding(id);
                      if (window.innerWidth < 768 || window.innerHeight < 520) {
                        setLeftDrawerOpen(false);
                      }
                    }}
                  />
                </div>
              )}

              {/* Bottom-Left GIL Portrait & Speech Bubble */}
              {!leftDrawerOpen && (
                <div
                  className={`absolute bottom-0 left-0 z-10 pointer-events-none ${
                    state.selectedBuildingId
                      ? 'hidden portrait:md:block lg:block'
                      : 'block'
                  }`}
                >
                  <GILPanel
                    state={state}
                    hiddenForCenter={isGilCenteredActive}
                    minimizedForTask={isTaskProgressActive}
                    recentTutorialFeedback={tutorialStepFeedback}
                    onOpenDescription={setDescriptionModal}
                    onFocusBuilding={(id) => gameStore.focusBuilding(id)}
                    onOpenTasksDrawer={() => {
                      if (window.innerWidth < 768 || window.innerHeight < 520) {
                        gameStore.selectBuilding(null);
                      }
                      setLeftDrawerOpen(true);
                      gameStore.markTutorialDrawerOpened();
                    }}
                    onAdvanceTutorial={() => gameStore.advanceTutorialStep()}
                    onSkipTutorial={() => gameStore.skipTutorial()}
                    onDismissMechanicHint={(hintId) => gameStore.dismissMechanicHint(hintId)}
                  />
                </div>
              )}

              {/* Center Open Stage + Quick Action Toast */}
              <div className="flex-1 min-w-0 relative pointer-events-none">
                {actionToast && (
                  <div
                    className={`absolute ${
                      state.selectedBuildingId
                        ? 'top-1 mobile-landscape:top-auto mobile-landscape:bottom-1 md:top-auto md:bottom-1'
                        : 'bottom-1'
                    } left-1/2 -translate-x-1/2 z-20 w-max max-w-[calc(100vw-24px)]`}
                  >
                    <div className="mars-panel-light px-3 py-1.5 lg:px-3.5 lg:py-2 rounded-xl lg:rounded-2xl flex items-center justify-center gap-1.5 lg:gap-2 text-[11px] lg:text-xs font-extrabold text-[#396344] text-center sm:whitespace-nowrap">
                      <CheckCircle2 className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" aria-hidden="true" />
                      <span>{actionToast}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Closable Building Action Card: bottom sheet on mobile portrait, right side card on landscape & desktop */}
              {state.selectedBuildingId && (
                <div className="absolute inset-x-0 bottom-0 mobile-landscape:inset-x-auto mobile-landscape:inset-y-0 mobile-landscape:right-0 md:inset-x-auto md:inset-y-0 md:right-0 z-20 w-full mobile-landscape:w-[258px] md:w-[275px] lg:w-[295px] max-h-[48dvh] mobile-landscape:max-h-full md:max-h-full shrink-0 min-h-0 flex flex-col justify-end mobile-landscape:justify-center md:justify-center pointer-events-none">
                  <BuildingPanel
                    state={state}
                    minimized={isTaskProgressActive}
                    onClose={() => gameStore.selectBuilding(null)}
                    onExecuteTask={(taskId) => gameStore.executeTask(taskId)}
                    onPlantCrop={(cropId) => gameStore.plantCrop(cropId)}
                    onHarvestCrop={() => gameStore.harvestCrop()}
                    onToggleShelter={() => gameStore.toggleCrewShelter()}
                    onOpenDescription={setDescriptionModal}
                  />
                </div>
              )}
            </div>

            {/* Row 3: Centered END DAY Dock + Bottom-Right Map/Audio/Pause Controls */}
            <footer className="relative w-full shrink-0 flex items-center justify-between sm:justify-center gap-2 pointer-events-none">
              <EndDayDock
                state={state}
                isTaskProgressActive={isTaskProgressActive}
                onEndDay={() => gameStore.endDay()}
              />
              <div className="sm:absolute sm:right-0 sm:bottom-0 pointer-events-none">
                <BottomRightControls
                  audioMuted={state.audioMuted}
                  isTaskProgressActive={isTaskProgressActive}
                  onToggleMute={() => gameStore.toggleMute()}
                  onPause={() => gameStore.setScreen('PAUSED')}
                />
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* Major Event Crew Cutscene (runs before player chooses response plan) */}
      {isMajorEventCutsceneActive(state) && state.activeEvent && (
        <>
          <div
            aria-hidden="true"
            className="fixed inset-0 z-[25] pointer-events-auto bg-transparent"
          />
          <MajorEventCutscene
            key={`cutscene_${state.activeEvent.dayTriggered}_${state.activeEvent.definition.id}`}
            event={state.activeEvent}
            state={state}
            onComplete={() => gameStore.completeEventCutscene()}
          />
        </>
      )}

      {/* Daily Summary Modal */}
      {state.screen === 'PLAYING' && state.lastDaySummary && (
        <DaySummaryModal
          key={`summary_${state.lastDaySummary.day}`}
          summary={state.lastDaySummary}
          onContinue={() => gameStore.dismissDaySummary()}
        />
      )}

      {/* Interactive Infrastructure Repair Minigame Modal */}
      {state.screen === 'PLAYING' &&
        state.pendingAction?.phase === 'working' &&
        state.pendingAction.kind === 'task' && (
          <RepairMinigameModal
            key={state.pendingAction.id}
            action={state.pendingAction}
            state={state}
            onComplete={(actionId) => gameStore.completePendingMinigame(actionId)}
            onCancel={() => gameStore.cancelPendingAction()}
          />
        )}

      {/* GIL Morning Hint Modal (centered with blurred/dimmed background after dismissing Day Summary) */}
      {state.screen === 'PLAYING' &&
        !state.lastDaySummary &&
        state.gilDayHint &&
        !isMajorEventCutsceneActive(state) && (
          <GilDayHintModal
            key={state.gilDayHint.id}
            message={state.gilDayHint}
            onDismiss={() => gameStore.dismissGilDayHint()}
          />
        )}

      {/* Pause Overlay */}
      {state.screen === 'PAUSED' && (
        <PauseModal
          onResume={() => gameStore.setScreen('PLAYING')}
          onRestart={() => gameStore.restartMission()}
          onReturnTitle={() => gameStore.returnToTitle()}
        />
      )}

      {/* Distinct Ending Cutscene -> Sol 30 Sustainability Assessment or Failure Report */}
      {(state.screen === 'MISSION_REPORT' || state.screen === 'GAME_OVER') &&
        (!state.endingCutsceneCompleted ? (
          <EndingCutscene
            key={`ending_${state.screen}_${state.day}_${state.failureCause ?? state.assessment?.outcome ?? 'end'}`}
            state={state}
            onComplete={() => gameStore.completeEndingCutscene()}
          />
        ) : (
          <MissionReport
            state={state}
            audioMuted={state.audioMuted}
            onToggleMute={() => gameStore.toggleMute()}
            onPlayAgain={() => gameStore.restartMission()}
            onReplayEnding={() => gameStore.replayEndingCutscene()}
          />
        ))}

      {/* Centered Infrastructure / Subject Description Modal with NASA Photo */}
      {descriptionModal && (
        <DescriptionModal
          key={descriptionModal.title}
          data={descriptionModal}
          onClose={() => {
            setDescriptionModal(null);
            window.dispatchEvent(new CustomEvent('mars30:deselect-rocket'));
          }}
        />
      )}
    </main>
  );
}
