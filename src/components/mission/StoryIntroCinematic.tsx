import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FastForward, Pause, Play } from 'lucide-react';
import { CutsceneMood, CutsceneSpeaker } from '../../types/event';
import { soundFX } from '../../systems/audio';
import {
  focusGameplayCanvas,
  isEditableTarget,
  isInteractiveControlTarget,
  releaseActiveElementFocus,
} from '../../utils/keyboard';
import { CrewPortrait } from '../icons/CrewPortraits';

interface StoryIntroCinematicProps {
  playerName: string;
  onComplete: () => void;
}

interface IntroBeat {
  id: string;
  stage: number;
  locationLabel: string;
  durationSec: number;
  speaker: CutsceneSpeaker;
  roleLabel: string;
  mood: CutsceneMood;
  line: (name: string) => string;
}

const INTRO_BEATS: IntroBeat[] = [
  // Stage 0: Space Academy Orbital Staging
  {
    id: 'academy_gil',
    stage: 0,
    locationLabel: 'Orbital Academy',
    durationSec: 3.8,
    speaker: 'GIL',
    roleLabel: 'Outpost AI',
    mood: 'excited',
    line: (name) => `Systems green, ${name}! Ready to command Mars-30?`,
  },
  {
    id: 'academy_leader',
    stage: 0,
    locationLabel: 'Orbital Academy',
    durationSec: 3.8,
    speaker: 'Player',
    roleLabel: 'Crew Leader',
    mood: 'determined',
    line: () => 'Born ready, GIL. Brent, MJ, Darryl, Magno—suit up!',
  },
  // Stage 1: Dormant Outpost Recon
  {
    id: 'recon_darryl',
    stage: 1,
    locationLabel: 'Jezero Outpost Recon',
    durationSec: 4.0,
    speaker: 'Darryl',
    roleLabel: 'Life Support & Safety',
    mood: 'concerned',
    line: () => "That's the old Jezero base. Dust storms knocked it dark years ago.",
  },
  {
    id: 'recon_mj',
    stage: 1,
    locationLabel: 'Jezero Outpost Recon',
    durationSec: 4.0,
    speaker: 'MJ',
    roleLabel: 'Bio-Systems & Water',
    mood: 'determined',
    line: () => "Ten modules offline... Good thing we're here to rebuild it.",
  },
  // Stage 2: Deep Space Transit
  {
    id: 'transit_brent',
    stage: 2,
    locationLabel: 'Mars Approach',
    durationSec: 4.2,
    speaker: 'Brent',
    roleLabel: 'Power Specialist',
    mood: 'alert',
    line: () => 'Approaching Mars! Thin air, freezing nights, and zero magnetic shield.',
  },
  {
    id: 'transit_gil',
    stage: 2,
    locationLabel: 'Mars Approach',
    durationSec: 4.2,
    speaker: 'GIL',
    roleLabel: 'Outpost AI',
    mood: 'calm',
    line: () => "Keep power and air steady, and we'll survive all 30 sols!",
  },
  // Stage 3: Jezero Crater Powered Descent
  {
    id: 'landing_magno',
    stage: 3,
    locationLabel: 'Jezero Crater Descent',
    durationSec: 4.4,
    speaker: 'Magno',
    roleLabel: 'Engineering & Repairs',
    mood: 'alert',
    line: () => "Thrusters firing! Jezero Crater's western rim dead ahead!",
  },
  {
    id: 'landing_leader',
    stage: 3,
    locationLabel: 'Jezero Crater Rim',
    durationSec: 4.2,
    speaker: 'Player',
    roleLabel: 'Crew Leader',
    mood: 'excited',
    line: () => 'Touchdown! Nice flying, crew—unlock the airlock!',
  },
  // Stage 4: Crew Disembarks Spacecraft & Runs Toward Outpost
  {
    id: 'arrival_brent',
    stage: 4,
    locationLabel: 'Outpost Arrival',
    durationSec: 3.4,
    speaker: 'Brent',
    roleLabel: 'Power Specialist',
    mood: 'excited',
    line: () => 'Boots on Mars! Look—there is the outpost up ahead!',
  },
  {
    id: 'arrival_gil',
    stage: 4,
    locationLabel: 'Outpost Arrival',
    durationSec: 3.5,
    speaker: 'GIL',
    roleLabel: 'Outpost AI',
    mood: 'excited',
    line: () => "Let's roll, team! Solar Panels and life support first!",
  },
  {
    id: 'arrival_leader',
    stage: 4,
    locationLabel: 'Outpost Arrival',
    durationSec: 3.6,
    speaker: 'Player',
    roleLabel: 'Crew Leader',
    mood: 'determined',
    line: () => 'Day One starts now. Let’s bring Mars-30 back online!',
  },
];

const STAGE_INDICES = [0, 1, 2, 3, 4] as const;

export function StoryIntroCinematic({
  playerName,
  onComplete,
}: StoryIntroCinematicProps) {
  const [beatIndex, setBeatIndex] = useState(0);
  const [beatElapsed, setBeatElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const completedRef = useRef(false);
  const exitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  const beat = INTRO_BEATS[beatIndex];
  const currentStage = beat.stage;
  const isLastBeat = beatIndex >= INTRO_BEATS.length - 1;

  const triggerComplete = useCallback(
    (skipped = false) => {
      if (completedRef.current) return;
      completedRef.current = true;
      releaseActiveElementFocus();
      if (skipped) {
        window.dispatchEvent(new CustomEvent('mars30:intro-skip'));
      }
      const finish = () => {
        onComplete();
        focusGameplayCanvas();
      };
      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduced || skipped) {
        finish();
        return;
      }
      setIsExiting(true);
      exitTimerRef.current = window.setTimeout(() => {
        exitTimerRef.current = null;
        finish();
      }, 260);
    },
    [onComplete]
  );

  // Sync Phaser OutpostScene camera & spacecraft/disembark visuals whenever stage changes
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('mars30:intro-stage', { detail: { stage: currentStage } })
    );
  }, [currentStage]);

  // Contextual crew & GIL reaction cues as each dialogue beat enters
  useEffect(() => {
    if (beat) {
      soundFX.playCrewReactionCue(beat.speaker, beat.mood);
    }
  }, [beat]);

  // Auto-advance conversational beats cleanly
  useEffect(() => {
    if (paused || isExiting) return;
    const interval = window.setInterval(() => {
      setBeatElapsed((prev) => {
        const dur = INTRO_BEATS[beatIndex]?.durationSec ?? 4;
        const next = prev + 0.1;
        if (next >= dur) {
          if (beatIndex + 1 < INTRO_BEATS.length) {
            setBeatIndex((idx) => Math.min(INTRO_BEATS.length - 1, idx + 1));
            return 0;
          }
          triggerComplete(false);
          return dur;
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, [paused, isExiting, beatIndex, triggerComplete]);

  const handleNext = useCallback(() => {
    soundFX.playSelect();
    if (beatIndex + 1 < INTRO_BEATS.length) {
      setBeatIndex((i) => i + 1);
      setBeatElapsed(0);
    } else {
      triggerComplete(false);
    }
  }, [beatIndex, triggerComplete]);

  const handleBack = useCallback(() => {
    if (beatIndex <= 0) return;
    soundFX.playSelect();
    setBeatIndex((i) => Math.max(0, i - 1));
    setBeatElapsed(0);
  }, [beatIndex]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      if (isEditableTarget(e.target)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        triggerComplete(true);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (isInteractiveControlTarget(e.target)) return;
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleBack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleNext, handleBack, triggerComplete]);

  const cleanName = playerName?.trim() || 'Commander';
  const speakerDisplayName =
    beat.speaker === 'Player' ? `${cleanName} (You)` : beat.speaker;

  return (
    <div
      role="region"
      aria-label="Mars 30 Story Introduction"
      className={`fixed inset-0 z-30 flex flex-col justify-between bg-transparent transition-opacity duration-300 ${
        isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Subtle Top & Bottom Scrims so Live Phaser Animations Remain Clear */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between">
        <div className="h-20 bg-gradient-to-b from-[#060914]/65 to-transparent" />
        <div className="h-44 bg-gradient-to-t from-[#060914]/75 via-[#060914]/25 to-transparent" />
      </div>

      {/* Clean Minimal Top Bar */}
      <div className="relative z-10 w-full max-w-4xl mx-auto px-3 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-4 flex items-center justify-between gap-2 sm:gap-3">
        <div className="min-w-0 px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#FAF0DC] border-2 border-[#292C2B] shadow-[0_3px_0_#292C2B] text-[#292C2B] font-mono-tabular text-[10px] sm:text-[11px] font-extrabold tracking-wider uppercase truncate">
          {beat.locationLabel}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Resume story' : 'Pause story'}
            className="mars-btn px-2.5 sm:px-3 py-2 bg-[#FAF0DC] hover:bg-[#FFF8EB] text-[#292C2B] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer whitespace-nowrap min-h-[42px]"
          >
            {paused ? (
              <>
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Resume</span>
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Pause</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => triggerComplete(true)}
            className="mars-btn px-3 sm:px-4 py-2 bg-[#B94F32] hover:bg-[#A64429] text-[#FAF0DC] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 min-h-[42px]"
          >
            <span>Skip</span>
            <FastForward className="w-4 h-4 shrink-0" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Compact Conversational Dialogue Panel */}
      <div className="relative z-10 w-full max-w-3xl mx-auto px-3 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-6">
        <div className="mars-panel rounded-3xl overflow-hidden bg-[#FAF0DC] shadow-[0_6px_0_#292C2B]">
          {/* Stage Segment Progress Bar */}
          <div className="h-1.5 w-full bg-[#E9D7B5] flex" aria-label="Introduction scene progress">
            {STAGE_INDICES.map((sIdx) => {
              const stageBeats = INTRO_BEATS.filter((b) => b.stage === sIdx);
              const firstIdx = INTRO_BEATS.findIndex((b) => b.stage === sIdx);
              const doneCount = Math.max(0, Math.min(stageBeats.length, beatIndex - firstIdx));
              const activeInStage = beat.stage === sIdx;
              const pct =
                sIdx < currentStage
                  ? 100
                  : activeInStage
                  ? ((doneCount + Math.min(1, beatElapsed / beat.durationSec)) /
                      stageBeats.length) *
                    100
                  : 0;
              return (
                <button
                  key={sIdx}
                  type="button"
                  onClick={() => {
                    if (firstIdx >= 0) {
                      setBeatIndex(firstIdx);
                      setBeatElapsed(0);
                    }
                  }}
                  aria-label={`Jump to stage ${sIdx + 1}`}
                  className="flex-1 h-full border-r border-[#FAF0DC]/70 last:border-r-0 cursor-pointer relative overflow-hidden"
                >
                  <div
                    className="h-full bg-[#B94F32] transition-all duration-100"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </button>
              );
            })}
          </div>

          <div className="p-3 sm:p-4 flex items-start sm:items-center gap-3 sm:gap-3.5 max-h-[52dvh] overflow-y-auto sm:max-h-none sm:overflow-visible">
            {/* Expressive Character Portrait */}
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

            {/* Short Dialogue & Controls */}
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="text-sm font-extrabold text-[#292C2B]">
                  {speakerDisplayName}
                </span>
                <span className="text-[11px] font-bold text-[#477C9B]">
                  {beat.roleLabel}
                </span>
              </div>

              <p className="text-xs sm:text-base font-extrabold text-[#292C2B] leading-snug">
                “{beat.line(cleanName)}”
              </p>

              <div className="pt-1 flex items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold text-[#292C2B]/55 font-mono-tabular">
                  {beatIndex + 1}/{INTRO_BEATS.length}
                </span>

                <div className="flex items-center gap-2">
                  {beatIndex > 0 && (
                    <button
                      type="button"
                      onClick={handleBack}
                      className="mars-btn px-3 py-1.5 rounded-xl bg-[#F1D8A8] hover:bg-[#E9B77B] text-[#292C2B] text-xs font-extrabold flex items-center gap-1 cursor-pointer min-h-[44px]"
                    >
                      <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                      <span>Back</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleNext}
                    className="mars-btn px-4 py-1.5 rounded-xl bg-[#718B78] hover:bg-[#5f7866] text-[#FAF0DC] text-xs font-extrabold flex items-center gap-1 cursor-pointer min-h-[44px]"
                  >
                    <span>{isLastBeat ? 'Begin Mission' : 'Next'}</span>
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
