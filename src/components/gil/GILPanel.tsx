import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Crosshair,
  SkipForward,
  Sparkles,
  X,
} from 'lucide-react';
import { BUILDING_DEFINITIONS } from '../../data/buildings';
import { SUBJECT_DESCRIPTIONS } from '../../data/nasa';
import { BuildingId } from '../../types/building';
import { GameState } from '../../types/game';
import { soundFX } from '../../systems/audio';
import { getContextualGilMessage } from '../../systems/gil';
import {
  DAY_ONE_TUTORIAL_STEPS,
  getCurrentTutorialStep,
  TOTAL_TUTORIAL_STEPS,
} from '../../systems/tutorial';
import { GilAvatarIcon } from '../icons/GameIcons';
import { DescriptionModalData } from '../mission/MissionModals';

interface GILPanelProps {
  state: GameState;
  hiddenForCenter?: boolean;
  minimizedForTask?: boolean;
  recentTutorialFeedback?: string | null;
  onOpenDescription: (data: DescriptionModalData) => void;
  onFocusBuilding?: (id: BuildingId) => void;
  onOpenTasksDrawer?: () => void;
  onAdvanceTutorial?: () => void;
  onSkipTutorial?: () => void;
  onDismissMechanicHint?: (hintId: string) => void;
}

export function GILPanel({
  state,
  hiddenForCenter = false,
  minimizedForTask = false,
  recentTutorialFeedback = null,
  onOpenDescription,
  onFocusBuilding,
  onOpenTasksDrawer,
  onAdvanceTutorial,
  onSkipTutorial,
  onDismissMechanicHint,
}: GILPanelProps) {
  const message = getContextualGilMessage(state);
  const tutorialStep = getCurrentTutorialStep(state);
  const isShowingTutorialStep =
    Boolean(tutorialStep) && message.id === `tutorial_step_${tutorialStep?.step}`;
  const isShowingMechanicHint = Boolean(message.mechanicHintId);

  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [forceOpen, setForceOpen] = useState(false);
  const lastSpokenIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (message.urgency === 'alert' || isShowingTutorialStep || isShowingMechanicHint) {
      setForceOpen(false);
    }
  }, [message.id, message.urgency, isShowingTutorialStep, isShowingMechanicHint]);

  const isVisible = forceOpen || dismissedId !== message.id;

  useEffect(() => {
    if (hiddenForCenter || minimizedForTask || !isVisible) return;
    if (lastSpokenIdRef.current !== message.id) {
      lastSpokenIdRef.current = message.id;
      soundFX.playGilChirp(message.emotion);
    }
  }, [hiddenForCenter, minimizedForTask, isVisible, message.id, message.emotion]);

  const accentColor =
    message.urgency === 'alert'
      ? '#C94B43'
      : message.urgency === 'warning'
      ? '#B94F32'
      : '#477C9B';

  const openMessageDescription = () => {
    const key = message.descriptionImageKey;
    const subjectEntry = key ? SUBJECT_DESCRIPTIONS[key] : undefined;
    const buildingEntry =
      key && key in BUILDING_DEFINITIONS
        ? BUILDING_DEFINITIONS[key as BuildingId]
        : undefined;

    if (subjectEntry) {
      onOpenDescription({
        title: message.descriptionSubject ?? subjectEntry.title,
        description: message.scienceTip ?? subjectEntry.description,
        imageUrl: subjectEntry.imageUrl,
        credit: subjectEntry.credit,
      });
      return;
    }

    if (buildingEntry) {
      onOpenDescription({
        title: message.descriptionSubject ?? buildingEntry.name,
        description: message.scienceTip ?? buildingEntry.scienceNote,
        imageUrl: buildingEntry.nasaImageUrl,
        credit: buildingEntry.nasaImageCredit,
      });
      return;
    }

    onOpenDescription({
      title: message.descriptionSubject ?? message.headline,
      description: message.scienceTip ?? message.body,
      imageUrl: SUBJECT_DESCRIPTIONS.jezero.imageUrl,
      credit: SUBJECT_DESCRIPTIONS.jezero.credit,
    });
  };

  if (!isVisible) {
    return (
      <div
        className={`inline-flex items-end transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          hiddenForCenter
            ? 'opacity-0 pointer-events-none'
            : minimizedForTask
            ? 'opacity-75 pointer-events-auto'
            : 'opacity-100 pointer-events-auto'
        }`}
      >
        <button
          type="button"
          data-gil-home="true"
          onClick={() => {
            soundFX.playGilActivate();
            setForceOpen(true);
          }}
          aria-label="Open GIL helper"
          title="Open GIL"
          className={`mars-btn w-11 h-11 lg:w-14 lg:h-14 rounded-xl lg:rounded-2xl bg-[#FAF0DC] hover:bg-[#FFF8EB] flex items-center justify-center cursor-pointer relative ${
            isShowingTutorialStep || isShowingMechanicHint ? 'animate-tutorial-ring' : ''
          }`}
        >
          <GilAvatarIcon
            className="w-8 h-8 lg:w-10 lg:h-10"
            mood={message.urgency}
            emotion={message.emotion}
          />
          {tutorialStep && (
            <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-[#477C9B] text-[#FAF0DC] border-2 border-[#292C2B] text-[10px] font-extrabold leading-none tabular-nums">
              {tutorialStep.step + 1}/{TOTAL_TUTORIAL_STEPS}
            </span>
          )}
        </button>
      </div>
    );
  }

  const remainingSteps = tutorialStep
    ? Math.max(0, TOTAL_TUTORIAL_STEPS - (tutorialStep.step + 1))
    : 0;

  return (
    <div
      className={`flex items-end gap-2 lg:gap-2.5 max-w-[calc(100vw-0.75rem)] mobile-landscape:max-w-[320px] portrait:sm:max-w-[350px] lg:max-w-[390px] animate-speech-pop origin-bottom-left transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        hiddenForCenter
          ? 'opacity-0 pointer-events-none'
          : minimizedForTask
          ? 'pointer-events-none'
          : 'pointer-events-auto opacity-100'
      }`}
      aria-live="polite"
    >
      {/* GIL Portrait Button */}
      <button
        type="button"
        data-gil-home="true"
        onClick={() => {
          setDismissedId(message.id);
          setForceOpen(false);
        }}
        aria-label="Minimize GIL bubble"
        className={`shrink-0 w-12 h-12 mobile-landscape:w-12 mobile-landscape:h-12 portrait:sm:w-16 portrait:sm:h-16 lg:w-20 lg:h-20 rounded-xl lg:rounded-2xl bg-[#FAF0DC] border-2 border-[#292C2B] shadow-[0_3px_0_#292C2B] lg:shadow-[0_4px_0_#292C2B] flex items-center justify-center cursor-pointer hover:bg-[#FFF8EB] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          minimizedForTask
            ? 'opacity-80 pointer-events-none'
            : 'opacity-100 hover:scale-105'
        }`}
      >
        <GilAvatarIcon
          className="w-10 h-10 mobile-landscape:w-10 mobile-landscape:h-10 portrait:sm:w-12 portrait:sm:h-12 lg:w-16 lg:h-16"
          mood={message.urgency}
          emotion={message.emotion}
          isSpeaking={!minimizedForTask}
        />
      </button>

      {/* Speech Bubble */}
      <div
        className={`relative flex-1 min-w-0 mars-panel p-2 mobile-landscape:p-2 lg:p-3 bg-[#FAF0DC] rounded-xl lg:rounded-2xl max-h-[34dvh] mobile-landscape:max-h-[42dvh] portrait:sm:max-h-[38dvh] lg:max-h-none overflow-y-auto overscroll-contain transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          minimizedForTask ? 'opacity-0 translate-y-2 pointer-events-none' : 'opacity-100 translate-y-0'
        }`}
      >
        <div
          aria-hidden="true"
          className="absolute -left-[9px] bottom-4 w-0 h-0 border-y-[7px] border-y-transparent border-r-[9px] border-r-[#292C2B]"
        />
        <div
          aria-hidden="true"
          className="absolute -left-[6px] bottom-[17px] w-0 h-0 border-y-[6px] border-y-transparent border-r-[7px] border-r-[#FAF0DC]"
        />

        {/* Immediate green step-complete feedback banner */}
        {recentTutorialFeedback && (
          <div className="mb-1.5 px-2 py-1 rounded-lg bg-[#718B78]/20 border border-[#396344] flex items-center gap-1.5 text-[11px] font-extrabold text-[#396344] animate-speech-pop">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{recentTutorialFeedback}</span>
          </div>
        )}

        {/* Clear 5-Step Progress Indicator */}
        {tutorialStep && (
          <div className="mb-1.5 space-y-1">
            <div className="flex items-center justify-between gap-2 text-[10px] font-extrabold uppercase tracking-wider text-[#477C9B]">
              <span className="tabular-nums">
                Step {tutorialStep.step + 1} of {TOTAL_TUTORIAL_STEPS} · {tutorialStep.label}
              </span>
              <span className="tabular-nums text-[#292C2B]/70 shrink-0">
                {remainingSteps === 0 ? 'Final step' : `${remainingSteps} left`}
              </span>
            </div>
            <div className="flex items-center gap-1" aria-hidden="true">
              {DAY_ONE_TUTORIAL_STEPS.map((s) => {
                const isDone = s.step < tutorialStep.step;
                const isCurrent = s.step === tutorialStep.step;
                return (
                  <span
                    key={s.step}
                    className={`h-1.5 flex-1 rounded-full border border-[#292C2B]/50 transition-all duration-300 ${
                      isDone
                        ? 'bg-[#718B78]'
                        : isCurrent
                        ? 'bg-[#F4C552]'
                        : 'bg-[#E9D7B5]'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0 space-y-0.5">
            {isShowingMechanicHint && (
              <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#477C9B] text-[#FAF0DC] text-[10px] font-extrabold uppercase tracking-wide">
                <Sparkles className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                <span>New Mechanic</span>
              </div>
            )}
            <div
              className="text-xs font-extrabold leading-tight"
              style={{ color: accentColor }}
            >
              {message.headline}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (message.mechanicHintId && onDismissMechanicHint) {
                onDismissMechanicHint(message.mechanicHintId);
              } else {
                setDismissedId(message.id);
                setForceOpen(false);
              }
            }}
            aria-label="Minimize GIL bubble"
            className="p-2 -mr-1 -mt-1 rounded-lg hover:bg-[#E9B77B]/50 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          </button>
        </div>

        <p className="mt-1 text-xs font-bold text-[#292C2B] leading-snug">
          {message.body}
        </p>

        {/* Action, Tutorial & Mechanic Tip Controls */}
        {(message.scienceTip || isShowingTutorialStep || isShowingMechanicHint) && (
          <div className="mt-2 pt-1.5 border-t border-[#292C2B]/15 flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {isShowingTutorialStep &&
                tutorialStep?.focusBuildingId &&
                state.selectedBuildingId !== tutorialStep.focusBuildingId &&
                onFocusBuilding && (
                  <button
                    type="button"
                    onClick={() => onFocusBuilding(tutorialStep.focusBuildingId!)}
                    className="px-2.5 py-1 rounded-lg bg-[#B94F32] hover:bg-[#A64429] border border-[#292C2B] text-[11px] font-extrabold text-[#FAF0DC] inline-flex items-center gap-1 cursor-pointer animate-tutorial-ring"
                  >
                    <Crosshair className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span>Focus Solar</span>
                  </button>
                )}

              {isShowingTutorialStep && tutorialStep?.requiresDrawerAction && onOpenTasksDrawer && (
                <button
                  type="button"
                  onClick={onOpenTasksDrawer}
                  className="px-2.5 py-1 rounded-lg bg-[#477C9B] hover:bg-[#3A6883] border border-[#292C2B] text-[11px] font-extrabold text-[#FAF0DC] inline-flex items-center gap-1 cursor-pointer animate-tutorial-ring"
                >
                  <ClipboardList className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>Open Tasks</span>
                </button>
              )}

              {isShowingTutorialStep &&
                (tutorialStep?.step === 3 || tutorialStep?.isFinalStep) &&
                onAdvanceTutorial && (
                  <button
                    type="button"
                    onClick={onAdvanceTutorial}
                    className="px-2.5 py-1 rounded-lg bg-[#718B78] hover:bg-[#5F7866] border border-[#292C2B] text-[11px] font-extrabold text-[#FAF0DC] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>{tutorialStep.isFinalStep ? 'Finish Guide' : 'Next Tip'}</span>
                    <ChevronRight className="w-3 h-3 shrink-0" aria-hidden="true" />
                  </button>
                )}

              {isShowingMechanicHint && message.mechanicHintId && onDismissMechanicHint && (
                <button
                  type="button"
                  onClick={() => onDismissMechanicHint(message.mechanicHintId!)}
                  className="px-2.5 py-1 rounded-lg bg-[#718B78] hover:bg-[#5F7866] border border-[#292C2B] text-[11px] font-extrabold text-[#FAF0DC] inline-flex items-center gap-1 cursor-pointer"
                >
                  <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>Got It</span>
                </button>
              )}

              {message.scienceTip && (
                <button
                  type="button"
                  onClick={openMessageDescription}
                  className="px-2 py-1 rounded-lg bg-[#F1D8A8]/85 hover:bg-[#E9B77B]/75 border border-[#292C2B]/30 text-[11px] font-extrabold text-[#477C9B] inline-flex items-center gap-1 cursor-pointer"
                >
                  <BookOpen className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>Info</span>
                </button>
              )}
            </div>

            {tutorialStep && onSkipTutorial && (
              <button
                type="button"
                onClick={onSkipTutorial}
                className="ml-auto px-2 py-1 rounded-lg hover:bg-[#E9B77B]/65 text-[11px] font-extrabold text-[#292C2B]/70 hover:text-[#292C2B] inline-flex items-center gap-1 cursor-pointer"
              >
                <SkipForward className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>Skip Tutorial</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
