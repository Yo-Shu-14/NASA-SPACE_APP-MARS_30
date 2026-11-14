import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  ChevronLeft,
  ChevronRight,
  FastForward,
  FileBarChart2,
  ShieldAlert,
} from 'lucide-react';
import { BUILDING_DEFINITIONS } from '../../data/buildings';
import { buildEndingCutscene } from '../../data/endings';
import { soundFX } from '../../systems/audio';
import { GameState } from '../../types/game';
import {
  isEditableTarget,
  isInteractiveControlTarget,
  releaseActiveElementFocus,
} from '../../utils/keyboard';
import { CrewPortrait } from '../icons/CrewPortraits';

interface EndingCutsceneProps {
  state: GameState;
  onComplete: () => void;
}

export function EndingCutscene({ state, onComplete }: EndingCutsceneProps) {
  const spec = useMemo(() => buildEndingCutscene(state), [state]);
  const [beatIndex, setBeatIndex] = useState(0);

  const beats = spec.beats;
  const beat = beats[beatIndex];
  const isLastBeat = beatIndex >= beats.length - 1;

  // Play ending musical cue once on arrival and reset Phaser ending staging on exit
  useEffect(() => {
    soundFX.playEndingCue(spec.kind);
    return () => {
      window.dispatchEvent(
        new CustomEvent('mars30:ending-visual', {
          detail: { reset: true },
        })
      );
      window.dispatchEvent(
        new CustomEvent('mars30:cutscene-focus', { detail: { reset: true } })
      );
    };
  }, [spec.kind]);

  // Synchronize live Phaser ending choreography, crew audio reactions & camera framing per beat
  useEffect(() => {
    if (!beat) return;
    soundFX.playCrewReactionCue(beat.speaker, beat.mood);
    window.dispatchEvent(
      new CustomEvent('mars30:ending-visual', {
        detail: {
          endingKind: spec.kind,
          beatIndex,
          totalBeats: beats.length,
          isFinalBeat: isLastBeat,
          focusBuildingId: beat.focusBuildingId,
        },
      })
    );
    window.dispatchEvent(
      new CustomEvent('mars30:cutscene-focus', {
        detail: {
          buildingId: beat.focusBuildingId,
          zoom: beat.cameraZoom ?? 0.96,
        },
      })
    );
  }, [beat, beatIndex, beats.length, isLastBeat, spec.kind]);

  const handleFinish = useCallback(() => {
    releaseActiveElementFocus();
    window.dispatchEvent(
      new CustomEvent('mars30:ending-visual', { detail: { reset: true } })
    );
    window.dispatchEvent(
      new CustomEvent('mars30:cutscene-focus', { detail: { reset: true } })
    );
    onComplete();
  }, [onComplete]);

  const handleNext = useCallback(() => {
    if (isLastBeat) {
      handleFinish();
      return;
    }
    soundFX.playSelect();
    setBeatIndex((idx) => Math.min(beats.length - 1, idx + 1));
  }, [isLastBeat, handleFinish, beats.length]);

  const handleBack = useCallback(() => {
    if (beatIndex <= 0) return;
    soundFX.playSelect();
    setBeatIndex((idx) => Math.max(0, idx - 1));
  }, [beatIndex]);

  // Keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      if (isEditableTarget(e.target)) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (isInteractiveControlTarget(e.target)) return;
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleBack();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleFinish();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleNext, handleBack, handleFinish]);

  if (!beat) {
    return null;
  }

  const playerLabel = state.playerName?.trim() || 'Commander';
  const speakerDisplayName =
    beat.speaker === 'Player' ? `${playerLabel} (You)` : beat.speaker;

  const focusedDef = beat.focusBuildingId
    ? BUILDING_DEFINITIONS[beat.focusBuildingId]
    : null;
  const focusedBuilding = beat.focusBuildingId
    ? state.buildings[beat.focusBuildingId]
    : null;

  const focusTag =
    focusedDef && focusedBuilding
      ? `${focusedDef.shortName}: ${
          focusedBuilding.status === 'operational'
            ? `${focusedBuilding.condition}% Online`
            : focusedBuilding.status === 'damaged'
            ? `${focusedBuilding.condition}% Damaged`
            : 'Offline'
        }`
      : null;

  return (
    <div
      className="fixed inset-0 z-30 pointer-events-none flex flex-col justify-between px-3 sm:p-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-label={spec.title}
    >
      {/* Top Ending Outcome Banner (leaves live Phaser outpost visible center-stage) */}
      <div className="max-w-3xl w-full mx-auto flex items-center justify-between gap-2 pointer-events-auto animate-modal-zoom-in">
        <div
          className="mars-panel min-w-0 flex-1 sm:flex-initial px-3 sm:px-3.5 py-2 rounded-2xl flex items-center gap-2 sm:gap-2.5 shadow-[0_4px_0_#292C2B]"
          style={{ backgroundColor: '#FAF0DC' }}
        >
          <div
            className="w-8 h-8 rounded-xl border-2 border-[#292C2B] flex items-center justify-center shrink-0 text-[#FAF0DC]"
            style={{ backgroundColor: spec.accentColor }}
          >
            {spec.isVictory ? (
              <Award className="w-5 h-5" aria-hidden="true" />
            ) : (
              <ShieldAlert className="w-5 h-5" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <div
              className="text-[10px] font-extrabold uppercase tracking-wide truncate"
              style={{ color: spec.accentColor }}
            >
              {spec.badgeText}
            </div>
            <div className="text-xs sm:text-sm font-extrabold text-[#292C2B] truncate">
              {spec.title}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleFinish}
          className="mars-btn min-h-[44px] px-3 sm:px-3.5 py-2 rounded-2xl bg-[#FAF0DC] hover:bg-[#F1D8A8] text-[#292C2B] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <FastForward className="w-3.5 h-3.5 text-[#B94F32]" aria-hidden="true" />
          <span className="sm:hidden">Report</span>
          <span className="hidden sm:inline">View Report</span>
        </button>
      </div>

      {/* Bottom Comic-Ink Crew Dialogue Deck */}
      <div className="max-w-3xl w-full mx-auto pointer-events-auto">
        <div className="mars-panel rounded-3xl overflow-hidden bg-[#FAF0DC] shadow-[0_6px_0_#292C2B]">
          {/* Beat Progress Bar */}
          <div className="h-1.5 w-full bg-[#E9D7B5] flex">
            {beats.map((b, i) => (
              <div
                key={b.id}
                className="flex-1 transition-all duration-300 border-r border-[#FAF0DC]/60 last:border-r-0"
                style={{
                  backgroundColor: i <= beatIndex ? spec.accentColor : 'transparent',
                }}
              />
            ))}
          </div>

          <div className="p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3.5 max-h-[54dvh] overflow-y-auto overscroll-contain sm:max-h-none sm:overflow-visible">
            {/* Character Portrait */}
            <div className="flex items-center gap-3 sm:block shrink-0">
              <div
                key={beat.id}
                className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl bg-[#F1D8A8] border-2 border-[#292C2B] flex items-center justify-center shadow-[0_3px_0_#292C2B] shrink-0 animate-speech-pop"
              >
                <CrewPortrait
                  speaker={beat.speaker}
                  mood={beat.mood}
                  className="w-12 h-12 sm:w-16 sm:h-16"
                />
              </div>
              <div className="sm:hidden min-w-0 flex-1">
                <div className="text-sm font-extrabold text-[#292C2B] truncate">
                  {speakerDisplayName}
                </div>
                <div className="text-[11px] font-bold text-[#477C9B] truncate">
                  {beat.roleLabel}
                </div>
                {focusTag && (
                  <span className="mt-1 inline-block px-2 py-0.5 rounded-lg bg-[#477C9B]/15 border border-[#477C9B] text-[10px] font-extrabold text-[#292C2B]">
                    {focusTag}
                  </span>
                )}
              </div>
            </div>

            {/* Dialogue Copy & Outpost Status Tag */}
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="hidden sm:flex flex-wrap items-center gap-2">
                <span className="text-sm font-extrabold text-[#292C2B]">
                  {speakerDisplayName}
                </span>
                <span className="text-[11px] font-bold text-[#477C9B]">
                  {beat.roleLabel}
                </span>
                {focusTag && (
                  <span className="ml-auto px-2 py-0.5 rounded-lg bg-[#477C9B]/15 border border-[#477C9B] text-[10px] font-extrabold text-[#292C2B]">
                    {focusTag}
                  </span>
                )}
              </div>

              <p className="text-xs sm:text-base font-extrabold text-[#292C2B] leading-snug">
                “{beat.line}”
              </p>

              {/* Controls Row */}
              <div className="pt-1 flex items-center justify-between gap-2">
                <span
                  className="text-[11px] font-extrabold text-[#292C2B]/60 font-mono-tabular"
                  aria-label={`Line ${beatIndex + 1} of ${beats.length}`}
                >
                  {beatIndex + 1}/{beats.length}
                </span>

                <div className="flex items-center gap-2">
                  {beatIndex > 0 && (
                    <button
                      type="button"
                      onClick={handleBack}
                      className="mars-btn px-3 py-2 rounded-xl bg-[#F1D8A8] hover:bg-[#E9B77B] text-[#292C2B] text-xs font-extrabold flex items-center gap-1 cursor-pointer min-h-[44px]"
                    >
                      <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                      <span>Back</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleNext}
                    className="mars-btn px-4 py-2 rounded-xl text-[#FAF0DC] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer min-h-[44px]"
                    style={{
                      backgroundColor: isLastBeat ? spec.accentColor : '#B94F32',
                    }}
                  >
                    {isLastBeat ? (
                      <>
                        <FileBarChart2 className="w-4 h-4" aria-hidden="true" />
                        <span>View Mission Report</span>
                      </>
                    ) : (
                      <>
                        <span>Next</span>
                        <ChevronRight className="w-4 h-4" aria-hidden="true" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
