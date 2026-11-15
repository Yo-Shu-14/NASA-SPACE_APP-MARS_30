import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FastForward, ShieldAlert } from 'lucide-react';
import { BUILDING_DEFINITIONS } from '../../data/buildings';
import { ActiveEvent } from '../../types/event';
import { GameState } from '../../types/game';
import { soundFX } from '../../systems/audio';
import {
  isEditableTarget,
  isInteractiveControlTarget,
  releaseActiveElementFocus,
} from '../../utils/keyboard';
import { CrewPortrait } from '../icons/CrewPortraits';
import { EventIcon } from '../icons/GameIcons';

interface MajorEventCutsceneProps {
  event: ActiveEvent;
  state: GameState;
  onComplete: () => void;
}

export function MajorEventCutscene({
  event,
  state,
  onComplete,
}: MajorEventCutsceneProps) {
  const beats = event.definition.cutscene ?? [];
  const [beatIndex, setBeatIndex] = useState(0);

  const beat = beats[beatIndex];
  const isLastBeat = beatIndex >= beats.length - 1;

  // Opening major-event audio sting matched to this specific Mars hazard
  useEffect(() => {
    soundFX.playMajorEventSting(event.definition.id);
  }, [event.definition.id]);

  // Dispatch live Phaser camera focus & subtle crew reaction cue per dialogue beat
  useEffect(() => {
    if (!beat) return;
    soundFX.playCrewReactionCue(beat.speaker, beat.mood);
    window.dispatchEvent(
      new CustomEvent('mars30:cutscene-focus', {
        detail: {
          buildingId: beat.focusBuildingId,
          zoom: beat.cameraZoom ?? 1.0,
        },
      })
    );
  }, [beat]);

  // Restore standard outpost camera framing when the cutscene finishes or unmounts
  useEffect(() => {
    return () => {
      window.dispatchEvent(
        new CustomEvent('mars30:cutscene-focus', { detail: { reset: true } })
      );
    };
  }, []);

  const handleFinish = useCallback(() => {
    releaseActiveElementFocus();
    soundFX.playEventMomentCue('choices_ready');
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

  // Keyboard navigation for fast classroom play
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
  const formattedLine = beat.line.replace(/\{playerName\}/g, playerLabel);

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

  const isSuperMajor = event.definition.severity === 'super_major';
  const accentColor = isSuperMajor ? '#C94B43' : '#B94F32';
  const targetBuildings = event.definition.targetBuildings ?? [];
  const vignetteColor =
    event.definition.phenomenon === 'solar_energetic_particles'
      ? 'rgba(192, 132, 252, 0.28)'
      : event.definition.phenomenon === 'global_dust_storm'
      ? 'rgba(215, 123, 74, 0.34)'
      : 'rgba(201, 75, 67, 0.30)';

  return (
    <div
      className="fixed inset-0 z-30 pointer-events-none flex flex-col justify-between px-3 sm:p-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      style={{
        boxShadow: `inset 0 0 110px ${vignetteColor}`,
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`${event.definition.title} Crew Briefing`}
    >
      {/* Top Storm Alert Banner (leaves full live Phaser world visible in center!) */}
      <div className="max-w-3xl w-full mx-auto flex items-center justify-between gap-2 pointer-events-auto animate-modal-zoom-in">
        <div
          className="mars-panel min-w-0 flex-1 sm:flex-initial px-3 sm:px-3.5 py-2 rounded-2xl flex items-center gap-2 sm:gap-2.5 shadow-[0_4px_0_#292C2B]"
          style={{ backgroundColor: '#FAF0DC' }}
        >
          <div
            className="w-8 h-8 rounded-xl border-2 border-[#292C2B] flex items-center justify-center shrink-0"
            style={{ backgroundColor: accentColor }}
          >
            <EventIcon phenomenon={event.definition.phenomenon} className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-wide text-[#B94F32] truncate">
              Sol {event.dayTriggered} · Incoming Event Briefing
            </div>
            <div className="text-xs sm:text-sm font-extrabold text-[#292C2B] truncate">
              {event.definition.title}
            </div>
          </div>
          {event.definition.radiationLevel ? (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#C94B43] text-[#FAF0DC] border border-[#292C2B] text-[10px] font-extrabold shrink-0">
              <ShieldAlert className="w-3 h-3" aria-hidden="true" />
              <span>RAD HAZARD</span>
            </span>
          ) : (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#D77B4A] text-[#FAF0DC] border border-[#292C2B] text-[10px] font-extrabold shrink-0">
              <ShieldAlert className="w-3 h-3" aria-hidden="true" />
              <span>STORM RISK</span>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleFinish}
          className="mars-btn min-h-[44px] px-3 sm:px-3.5 py-2 rounded-2xl bg-[#FAF0DC] hover:bg-[#F1D8A8] text-[#292C2B] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <FastForward className="w-3.5 h-3.5 text-[#B94F32]" aria-hidden="true" />
          <span className="sm:hidden">Skip</span>
          <span className="hidden sm:inline">Jump to Outpost</span>
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
                  backgroundColor: i <= beatIndex ? accentColor : 'transparent',
                }}
              />
            ))}
          </div>

          <div className="p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3.5 max-h-[56dvh] overflow-y-auto overscroll-contain sm:max-h-none sm:overflow-visible">
            {/* Character Portrait synced to exact Phaser astronaut palette */}
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

            {/* Dialogue Copy & Outpost Impact Tag Strip */}
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
                “{formattedLine}”
              </p>

              {/* Impact Telemetry Strip */}
              <div className="flex flex-wrap items-center gap-1 pt-0.5">
                <span className="px-2 py-0.5 rounded-md bg-[#FDE8E6] border border-[#C94B43]/60 text-[10px] font-extrabold text-[#8C2F1C]">
                  {event.definition.radiationLevel
                    ? 'Outdoors: -HP & +Radiation'
                    : 'Outdoors: -HP Storm Strain'}
                </span>
                {targetBuildings.slice(0, 4).map((bId) => {
                  const isFocused = beat.focusBuildingId === bId;
                  return (
                    <span
                      key={bId}
                      className={`px-2 py-0.5 rounded-md border text-[10px] font-extrabold ${
                        isFocused
                          ? 'bg-[#B94F32] text-[#FAF0DC] border-[#292C2B]'
                          : 'bg-[#F1D8A8]/80 text-[#292C2B]/85 border-[#292C2B]/25'
                      }`}
                    >
                      {BUILDING_DEFINITIONS[bId].shortName}
                    </span>
                  );
                })}
              </div>

              {/* Controls Row */}
              <div className="pt-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5" aria-label={`Line ${beatIndex + 1} of ${beats.length}`}>
                  <span className="text-[11px] font-extrabold text-[#292C2B]/60 font-mono-tabular">
                    {beatIndex + 1}/{beats.length}
                  </span>
                </div>

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
                      backgroundColor: isLastBeat ? '#396344' : accentColor,
                    }}
                  >
                    <span>{isLastBeat ? 'Take Command' : 'Next'}</span>
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
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
