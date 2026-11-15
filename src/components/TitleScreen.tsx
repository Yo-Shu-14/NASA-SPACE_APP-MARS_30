import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Award,
  Compass,
  Flame,
  Play,
  Rocket,
  Shield,
  UserCheck,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { DIFFICULTY_META, DIFFICULTY_ORDER } from '../data/balance';
import { JEZERO_CRATER_DATA } from '../data/nasa';
import { SavedMissionPreview } from '../state/saveStorage';
import { soundFX } from '../systems/audio';
import { CutsceneSpeaker } from '../types/event';
import { DifficultyLevel } from '../types/game';
import {
  isEditableTarget,
  isInteractiveControlTarget,
  releaseActiveElementFocus,
} from '../utils/keyboard';
import { CrewPortrait } from './icons/CrewPortraits';
import { BuildingIcon, MarsLogoLockup } from './icons/GameIcons';
import { CreditsModal } from './mission/CreditsModal';

interface TitleScreenProps {
  initialDifficulty?: DifficultyLevel;
  initialPlayerName?: string;
  audioMuted?: boolean;
  savedMission?: SavedMissionPreview | null;
  onToggleMute?: () => void;
  onResumeSaved?: () => void;
  onStart: (difficulty: DifficultyLevel, playerName: string) => void;
}

const CREW_PREVIEW: Array<{ speaker: CutsceneSpeaker; label: string }> = [
  { speaker: 'Player', label: 'You' },
  { speaker: 'Brent', label: 'Brent' },
  { speaker: 'MJ', label: 'MJ' },
  { speaker: 'Darryl', label: 'Darryl' },
  { speaker: 'Magno', label: 'Magno' },
  { speaker: 'GIL', label: 'GIL AI' },
];

const DIFFICULTY_ICONS: Record<DifficultyLevel, typeof Shield> = {
  easy: Shield,
  medium: Compass,
  hard: Flame,
};

export function TitleScreen({
  initialDifficulty = 'medium',
  initialPlayerName = '',
  audioMuted = false,
  savedMission = null,
  onToggleMute,
  onResumeSaved,
  onStart,
}: TitleScreenProps) {
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(initialDifficulty);
  const [playerName, setPlayerName] = useState<string>(
    initialPlayerName && initialPlayerName !== 'Commander' ? initialPlayerName : ''
  );
  const [isClosing, setIsClosing] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const startTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (startTimerRef.current !== null) {
        window.clearTimeout(startTimerRef.current);
      }
    };
  }, []);

  const resolvedName = playerName.trim().slice(0, 24) || 'Commander';

  const handleStartWithZoom = useCallback(() => {
    if (isClosing) return;
    releaseActiveElementFocus();
    soundFX.unlockAudio();
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      onStart(difficulty, resolvedName);
      return;
    }
    setIsClosing(true);
    startTimerRef.current = window.setTimeout(() => {
      startTimerRef.current = null;
      onStart(difficulty, resolvedName);
    }, 180);
  }, [isClosing, onStart, difficulty, resolvedName]);

  const handleResumeWithZoom = useCallback(() => {
    if (isClosing || !onResumeSaved) return;
    releaseActiveElementFocus();
    soundFX.unlockAudio();
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      onResumeSaved();
      return;
    }
    setIsClosing(true);
    startTimerRef.current = window.setTimeout(() => {
      startTimerRef.current = null;
      onResumeSaved();
    }, 180);
  }, [isClosing, onResumeSaved]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (showCredits || e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      if (isEditableTarget(e.target)) {
        if (e.key === 'Enter') {
          e.preventDefault();
          releaseActiveElementFocus();
          handleStartWithZoom();
        }
        return;
      }
      if (isInteractiveControlTarget(e.target)) {
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleStartWithZoom();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleStartWithZoom, showCredits]);

  return (
    <div
      className={`fixed inset-0 z-20 flex justify-center p-3 sm:p-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[#292C2B]/42 overflow-y-auto overscroll-contain transition-opacity duration-[180ms] ${
        isClosing ? 'opacity-0' : 'animate-backdrop-fade opacity-100'
      }`}
    >
      <div
        className={`my-auto mars-panel max-w-xl w-full p-4 sm:p-7 ${
          isClosing ? 'animate-modal-zoom-out' : 'animate-modal-zoom-in'
        }`}
      >
        {/* Quiet Mission Context, Credits & Audio Control */}
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] font-bold text-[#292C2B]/75 truncate">
            <span>Jezero Crater</span>
            <span aria-hidden="true"> · </span>
            <span className="font-mono-tabular">{JEZERO_CRATER_DATA.coordinates}</span>
            <span aria-hidden="true"> · </span>
            <span>30-Sol Mission</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={isClosing}
              onClick={() => {
                soundFX.unlockAudio();
                soundFX.playSelect();
                setShowCredits(true);
              }}
              aria-label="Open Credits and Acknowledgments"
              className="mars-btn min-h-[44px] sm:min-h-[40px] px-2.5 sm:px-3 bg-[#FAF0DC] hover:bg-[#FFF8EB] text-[#292C2B] text-xs font-extrabold flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Award className="w-4 h-4 text-[#B94F32] shrink-0" aria-hidden="true" />
              <span>Credits</span>
            </button>

            {onToggleMute && (
              <button
                type="button"
                onClick={() => {
                  soundFX.unlockAudio();
                  onToggleMute();
                }}
                aria-label={audioMuted ? 'Unmute music and sound effects' : 'Mute music and sound effects'}
                className="mars-btn w-11 h-11 sm:w-10 sm:h-10 bg-[#FAF0DC] hover:bg-[#FFF8EB] text-[#292C2B] flex items-center justify-center shrink-0 cursor-pointer"
              >
                {audioMuted ? (
                  <VolumeX className="w-4 h-4 text-[#C94B43]" aria-hidden="true" />
                ) : (
                  <Volume2 className="w-4 h-4 text-[#477C9B]" aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Hero Title Emblem */}
        <div className="mt-2 text-center">
          <MarsLogoLockup />
          <p className="mt-2 text-xs sm:text-sm font-semibold text-[#292C2B]/85 max-w-md mx-auto leading-snug text-balance">
            Rebuild an abandoned Martian outpost and keep your crew alive for 30 sols.
          </p>
        </div>

        

        {/* Visual Crew Roster Strip */}
        <div className="mt-3 px-2.5 py-2 sm:px-3 sm:py-2.5">
          <div className="grid grid-cols-6 gap-1 sm:gap-1.5 text-center">
            {CREW_PREVIEW.map((member) => (
              <div key={member.speaker} className="flex flex-col items-center">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#FAF0DC] border border-[#292C2B]/30 flex items-center justify-center overflow-hidden">
                  <CrewPortrait
                    speaker={member.speaker}
                    mood={member.speaker === 'GIL' ? 'determined' : 'calm'}
                    className="w-8 h-8 sm:w-9 sm:h-9"
                  />
                </div>
                <span className="mt-1 text-[10px] font-extrabold text-[#292C2B] truncate max-w-full">
                  {member.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Crew Leader Callsign & Difficulty */}
        <div className="mt-4 space-y-3">
          <div className="text-left">
            <label
              htmlFor="astronaut-name-input"
              className="flex items-center justify-between text-xs font-extrabold text-[#292C2B] mb-1.5"
            >
              <span className="flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-[#B94F32]" aria-hidden="true" />
                Crew Leader Name
              </span>
              <span className="text-[11px] font-semibold text-[#292C2B]/60">Optional</span>
            </label>
            <input
              id="astronaut-name-input"
              type="text"
              maxLength={24}
              value={playerName}
              readOnly={isClosing}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Commander"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF0DC] border-2 border-[#292C2B] text-sm font-bold text-[#292C2B] placeholder:text-[#292C2B]/45 focus:outline-none focus:ring-2 focus:ring-[#477C9B]"
            />
          </div>

          <div
            className="grid grid-cols-1 sm:grid-cols-3 gap-2"
            role="radiogroup"
            aria-label="Mission difficulty"
          >
            {DIFFICULTY_ORDER.map((level) => {
              const active = difficulty === level;
              const meta = DIFFICULTY_META[level];
              const Icon = DIFFICULTY_ICONS[level];
              return (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={isClosing}
                  onClick={() => {
                    soundFX.unlockAudio();
                    soundFX.playSelect();
                    setDifficulty(level);
                  }}
                  className={`mars-btn min-h-[44px] py-2.5 px-3 sm:px-2.5 rounded-xl text-left cursor-pointer transition-colors ${
                    active
                      ? 'bg-[#477C9B] text-[#FAF0DC]'
                      : 'bg-[#FAF0DC] hover:bg-[#FFF8EB] text-[#292C2B]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-extrabold leading-tight">
                    <Icon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        active ? 'text-[#FAF0DC]' : 'text-[#B94F32]'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="whitespace-nowrap">{meta.label}</span>
                  </div>
                  <div className="text-[11px] sm:text-[10px] font-semibold opacity-85 mt-1 leading-tight">
                    {meta.summary}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
          {savedMission && onResumeSaved && (
            <button
              type="button"
              disabled={isClosing}
              onClick={handleResumeWithZoom}
              className="mars-btn w-full sm:flex-1 min-h-[48px] py-2.5 px-4 bg-[#718B78] hover:bg-[#5f7866] text-[#FAF0DC] flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play className="w-5 h-5 shrink-0 fill-current" aria-hidden="true" />
              <div className="text-left min-w-0">
                <div className="text-sm sm:text-base font-extrabold leading-tight truncate">
                  {savedMission.screen === 'MISSION_REPORT' || savedMission.screen === 'GAME_OVER'
                    ? `View Sol ${savedMission.day} Report`
                    : `Continue Sol ${savedMission.day}/${savedMission.maxDays}`}
                </div>
                <div className="text-[10px] font-bold opacity-90 truncate">
                  {savedMission.playerName} · {DIFFICULTY_META[savedMission.difficulty].label}
                </div>
              </div>
            </button>
          )}

          <button
            type="button"
            disabled={isClosing}
            onClick={handleStartWithZoom}
            className={`mars-btn w-full ${
              savedMission && onResumeSaved ? 'sm:flex-1' : ''
            } min-h-[48px] py-3 sm:py-3.5 px-6 bg-[#B94F32] hover:bg-[#a64429] text-[#FAF0DC] text-base sm:text-lg font-extrabold tracking-tight flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap`}
          >
            <Rocket className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span>{savedMission && onResumeSaved ? 'New Mission' : 'Start Mission'}</span>
          </button>
        </div>

     
      </div>

      {showCredits && <CreditsModal onClose={() => setShowCredits(false)} />}
    </div>
  );
}
