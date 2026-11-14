import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Award,
  Calendar,
  CheckCircle2,
  Film,
  Gamepad2,
  Globe,
  Heart,
  Radiation,
  RotateCcw,
  Shield,
  ShieldAlert,
  Snowflake,
  Sprout,
  Users,
  Volume2,
  VolumeX,
  Wind,
  Wrench,
  XCircle,
} from 'lucide-react';
import { BUILDING_DEFINITIONS, BUILDING_LIST } from '../../data/buildings';
import { EVENT_DEFINITIONS } from '../../data/events';
import { JEZERO_CRATER_DATA, NASA_SIMULATION_BOUNDARY } from '../../data/nasa';
import { soundFX } from '../../systems/audio';
import { getOperationalBuildingCount } from '../../systems/buildings';
import { BuildingId } from '../../types/building';
import { FailureCause, GameState } from '../../types/game';
import { ResourceType } from '../../types/resource';
import { releaseActiveElementFocus } from '../../utils/keyboard';
import { BuildingIcon, CrewStaminaIcon, EventIcon, ResourceIcon } from '../icons/GameIcons';

interface MissionReportProps {
  state: GameState;
  audioMuted?: boolean;
  onToggleMute?: () => void;
  onPlayAgain: () => void;
  onReplayEnding?: () => void;
}

const RESOURCE_META: Array<{
  type: ResourceType;
  label: string;
  unit: string;
  barColor: string;
}> = [
  { type: 'oxygen', label: 'Oxygen', unit: 'O₂', barColor: '#6CA4C4' },
  { type: 'water', label: 'Water', unit: 'H₂O', barColor: '#477C9B' },
  { type: 'food', label: 'Food', unit: 'kcal', barColor: '#D77B4A' },
  { type: 'energy', label: 'Energy', unit: 'kWh', barColor: '#E9B77B' },
];

const FAILURE_CAUSE_META: Record<
  FailureCause,
  {
    title: string;
    subtitle: string;
    linkedBuildings: BuildingId[];
    metricLabel: string;
  }
> = {
  oxygen: {
    title: 'Oxygen Reserves Depleted',
    subtitle: 'Breathable habitat O₂ reached 0, forcing immediate orbital evacuation.',
    linkedBuildings: ['oxygen_generator', 'oxygen_storage', 'solar_panels'],
    metricLabel: 'Final Oxygen',
  },
  water: {
    title: 'Water Reserves Exhausted',
    subtitle: 'Potable H₂O reserves hit 0, halting habitat life support.',
    linkedBuildings: ['water_recycling', 'water_storage', 'solar_panels'],
    metricLabel: 'Final Water',
  },
  food: {
    title: 'Food Supply Ran Out',
    subtitle: 'Outpost food reserves ran dry before the next greenhouse harvest.',
    linkedBuildings: ['greenhouse', 'food_storage', 'water_recycling'],
    metricLabel: 'Final Food',
  },
  radiation: {
    title: 'Critical Radiation Exposure',
    subtitle: 'Severe solar storm exposure exceeded safe astronaut thresholds.',
    linkedBuildings: ['radiation_shelter', 'main_habitat'],
    metricLabel: 'Crew Radiation',
  },
  condition: {
    title: 'Crew Health Critical',
    subtitle: 'Sustained resource shortages and hazard fatigue forced evacuation.',
    linkedBuildings: ['main_habitat', 'oxygen_generator', 'water_recycling'],
    metricLabel: 'Crew Health',
  },
};

function getBuildingStatusDisplay(state: GameState, id: BuildingId) {
  const b = state.buildings[id];
  const isOffline = !b.restoredOnce || b.status === 'inactive';
  const hasFault = !isOffline && (b.malfunctionDaysRemaining ?? 0) > 0;
  const hasFrost = !isOffline && (b.frostLevel ?? 0) >= 20;
  const isDamaged = !isOffline && b.status === 'damaged';
  const isDusty = id === 'solar_panels' && !isOffline && b.dustLevel >= 35;

  if (isOffline) {
    return { label: 'Offline', color: '#8C4D32', barColor: '#9E6245', isOk: false };
  }
  if (hasFault) {
    return {
      label: b.malfunctionKind === 'frost' ? 'Frozen' : 'Fault',
      color: '#C94B43',
      barColor: '#C94B43',
      isOk: false,
    };
  }
  if (isDamaged) {
    return { label: 'Damaged', color: '#B94F32', barColor: '#D77B4A', isOk: false };
  }
  if (hasFrost) {
    return { label: 'Frost', color: '#477C9B', barColor: '#D77B4A', isOk: false };
  }
  if (isDusty) {
    return { label: 'Dusty', color: '#B3693B', barColor: '#D77B4A', isOk: false };
  }
  return { label: 'Online', color: '#396344', barColor: '#718B78', isOk: true };
}

function resolveFailureCause(state: GameState): FailureCause {
  if (state.failureCause) return state.failureCause;
  if (state.resources.oxygen <= 0) return 'oxygen';
  if (state.resources.water <= 0) return 'water';
  if (state.resources.food <= 0) return 'food';
  if (state.crew.radiationExposure >= 100) return 'radiation';
  return 'condition';
}

function ScoreRing({
  score,
  maxScore = 100,
  subtitle,
  ringColor,
}: {
  score: number;
  maxScore?: number;
  subtitle: string;
  ringColor: string;
}) {
  const pct = Math.max(0, Math.min(1, score / Math.max(1, maxScore)));
  const radius = 28;
  const circ = 2 * Math.PI * radius;
  const dashOffset = circ * (1 - pct);

  return (
    <div className="flex items-center gap-2.5 bg-[#FAF0DC] border-2 border-[#292C2B] rounded-xl px-3 py-2 text-[#292C2B] shrink-0">
      <div className="relative w-14 h-14 flex items-center justify-center">
        <svg viewBox="0 0 68 68" className="w-14 h-14 -rotate-90" aria-hidden="true">
          <circle
            cx="34"
            cy="34"
            r={radius}
            fill="none"
            stroke="#E9D7B5"
            strokeWidth="6.5"
          />
          <circle
            cx="34"
            cy="34"
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth="6.5"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <span className="absolute text-sm font-extrabold font-mono-tabular">
          {score}
        </span>
      </div>
      <div className="text-left leading-tight">
        <div className="text-[11px] font-bold text-[#292C2B]/65">{subtitle}</div>
        <div className="text-xs font-extrabold font-mono-tabular">
          / {maxScore}
        </div>
      </div>
    </div>
  );
}

export function MissionReport({
  state,
  audioMuted = false,
  onToggleMute,
  onPlayAgain,
  onReplayEnding,
}: MissionReportProps) {
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const closeWithZoom = useCallback(
    (onDone: () => void) => {
      if (isClosing) return;
      releaseActiveElementFocus();
      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        onDone();
        return;
      }
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
      setIsClosing(true);
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        onDone();
      }, 180);
    },
    [isClosing]
  );

  const isFailure = state.screen === 'GAME_OVER';
  const assessment = state.assessment;
  const didPass = !isFailure && Boolean(assessment?.passed);

  const outcomeBannerStyle = isFailure
    ? 'bg-[#C94B43] text-[#FAF0DC]'
    : !didPass
    ? 'bg-[#B94F32] text-[#FAF0DC]'
    : assessment?.outcome === 'Sustainable'
    ? 'bg-[#396344] text-[#FAF0DC]'
    : 'bg-[#D77B4A] text-[#FAF0DC]';

  const ringColor = isFailure
    ? '#C94B43'
    : !didPass
    ? '#B94F32'
    : assessment?.outcome === 'Sustainable'
    ? '#396344'
    : '#D77B4A';

  const OutcomeIcon = isFailure
    ? ShieldAlert
    : !didPass
    ? AlertTriangle
    : assessment?.outcome === 'Sustainable'
    ? Award
    : CheckCircle2;

  const titleText = isFailure
    ? `Mission Ended on Sol ${state.day}`
    : didPass
    ? `Mission Passed — ${assessment?.outcome}`
    : 'Sol 30 Reached — Outpost Not Sustainable';

  const conciseSummary = isFailure
    ? state.failureReason || 'Crew evacuated safely to orbit after critical reserves ran out.'
    : didPass
    ? `${state.playerName?.trim() || 'Commander'} restored Jezero Crater outpost life support for 150-sol sustainability.`
    : `${state.playerName?.trim() || 'Commander'} kept the crew alive to Sol 30, but critical colony objectives remained incomplete.`;

  const leaderLabel = state.playerName?.trim() || 'Commander';
  const diffLabel =
    state.difficulty.charAt(0).toUpperCase() + state.difficulty.slice(1);
  const solProgressPct = Math.round((state.day / Math.max(1, state.maxDays)) * 100);
  const healthBarColor =
    state.crew.condition >= 70
      ? '#396344'
      : state.crew.condition >= 45
      ? '#D77B4A'
      : '#C94B43';

  const operationalCount =
    assessment?.facilitiesOperational ?? getOperationalBuildingCount(state.buildings);
  const totalFacilities = assessment?.totalFacilities ?? BUILDING_LIST.length;

  const failureCause = resolveFailureCause(state);
  const failureMeta = FAILURE_CAUSE_META[failureCause];
  const failedChecks = assessment?.mandatoryChecks.filter((c) => !c.passed) ?? [];

  const renderFailureCauseIcon = () => {
    if (failureCause === 'oxygen' || failureCause === 'water' || failureCause === 'food') {
      return <ResourceIcon type={failureCause} className="w-8 h-8 shrink-0" />;
    }
    if (failureCause === 'radiation') {
      return <Radiation className="w-7 h-7 text-[#C94B43] shrink-0" aria-hidden="true" />;
    }
    return <Heart className="w-7 h-7 text-[#C94B43] fill-[#C94B43] shrink-0" aria-hidden="true" />;
  };

  const failureMetricValue =
    failureCause === 'oxygen'
      ? `${state.resources.oxygen}/${state.capacities.oxygen} O₂`
      : failureCause === 'water'
      ? `${state.resources.water}/${state.capacities.water} H₂O`
      : failureCause === 'food'
      ? `${state.resources.food}/${state.capacities.food} kcal`
      : failureCause === 'radiation'
      ? `${state.crew.radiationExposure}%`
      : `${state.crew.condition}%`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titleText}
      className={`fixed inset-0 z-40 flex justify-center p-2.5 sm:p-5 pt-[max(0.625rem,env(safe-area-inset-top))] pb-[max(0.625rem,env(safe-area-inset-bottom))] bg-[#292C2B]/65 overflow-y-auto overscroll-contain transition-opacity duration-[180ms] ${
        isClosing ? 'opacity-0' : 'animate-backdrop-fade opacity-100'
      }`}
    >
      <div
        className={`my-auto mars-panel max-w-4xl w-full max-h-[92dvh] flex flex-col overflow-hidden ${
          isClosing ? 'animate-modal-zoom-out' : 'animate-modal-zoom-in'
        }`}
      >
        {/* Header Outcome Banner */}
        <div className={`px-4 sm:px-6 py-3.5 sm:py-4 border-b-2 border-[#292C2B] shrink-0 ${outcomeBannerStyle}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1 basis-60">
              <div className="text-[11px] sm:text-xs font-bold opacity-90 flex flex-wrap items-center gap-1.5">
                <span>{leaderLabel}</span>
                <span aria-hidden="true">·</span>
                <span>{diffLabel}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">{JEZERO_CRATER_DATA.coordinates}</span>
                <span aria-hidden="true">·</span>
                <span>{isFailure ? 'Emergency Evacuation' : '150-Sol Evaluation'}</span>
              </div>

              <div className="mt-1 flex items-center gap-2 sm:gap-2.5">
                <OutcomeIcon className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" aria-hidden="true" />
                <h1 className="text-lg sm:text-2xl font-extrabold leading-tight text-balance">
                  {titleText}
                </h1>
              </div>

              <p className="mt-1.5 text-xs sm:text-sm font-medium opacity-95 leading-snug max-w-2xl">
                {conciseSummary}
              </p>
            </div>

            <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
              {assessment ? (
                <ScoreRing
                  score={assessment.overallScore}
                  maxScore={100}
                  subtitle="Audit Score"
                  ringColor={ringColor}
                />
              ) : (
                <ScoreRing
                  score={state.day}
                  maxScore={state.maxDays}
                  subtitle="Sols"
                  ringColor={ringColor}
                />
              )}

              {onToggleMute && (
                <button
                  type="button"
                  onClick={() => {
                    soundFX.unlockAudio();
                    onToggleMute();
                  }}
                  aria-label={audioMuted ? 'Unmute audio' : 'Mute audio'}
                  className="mars-btn w-11 h-11 sm:w-10 sm:h-10 bg-[#FAF0DC] hover:bg-[#FFF8EB] text-[#292C2B] flex items-center justify-center cursor-pointer"
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
        </div>

        {/* Scrollable Report Content */}
        <div className="p-3.5 sm:p-6 overflow-y-auto overscroll-contain space-y-3.5 sm:space-y-4 text-sm flex-1 min-h-0">
          {/* Row 1: Visual Mission KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 tabular-nums">
            <div className="mars-panel-light p-3.5">
              <div className="flex items-center justify-between text-xs font-bold text-[#292C2B]/70">
                <span>Sols Survived</span>
                <Calendar className="w-4 h-4 text-[#B94F32]" aria-hidden="true" />
              </div>
              <div className="text-xl font-extrabold mt-1 font-mono-tabular">
                {state.day} <span className="text-xs font-bold text-[#292C2B]/55">/ {state.maxDays}</span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-[#E9D7B5] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#B94F32] transition-all duration-300"
                  style={{ width: `${solProgressPct}%` }}
                />
              </div>
            </div>

            <div className="mars-panel-light p-3.5">
              <div className="flex items-center justify-between text-xs font-bold text-[#292C2B]/70">
                <span>Tasks Done</span>
                <Wrench className="w-4 h-4 text-[#477C9B]" aria-hidden="true" />
              </div>
              <div className="text-xl font-extrabold mt-1 font-mono-tabular">
                {state.totalTasksCompleted}
              </div>
              <div className="mt-1.5 text-[11px] font-semibold text-[#292C2B]/65">
                {operationalCount}/{totalFacilities} systems active
              </div>
            </div>

            <div className="mars-panel-light p-3.5">
              <div className="flex items-center justify-between text-xs font-bold text-[#292C2B]/70">
                <span>Crop Harvests</span>
                <Sprout className="w-4 h-4 text-[#396344]" aria-hidden="true" />
              </div>
              <div className="text-xl font-extrabold mt-1 font-mono-tabular">
                {state.harvestCount}
              </div>
              <div className="mt-1.5 text-[11px] font-semibold text-[#292C2B]/65">
                {state.greenhouseCrop ? 'Greenhouse crop active' : 'Greenhouse harvests'}
              </div>
            </div>

            <div className="mars-panel-light p-3.5">
              <div className="flex items-center justify-between text-xs font-bold text-[#292C2B]/70">
                <span>Crew Health</span>
                <CrewStaminaIcon className="w-4 h-4" low={state.crew.condition < 50} />
              </div>
              <div className="text-xl font-extrabold mt-1 font-mono-tabular">
                {state.crew.condition}%
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-[#E9D7B5] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.max(4, Math.min(100, state.crew.condition))}%`,
                    backgroundColor: healthBarColor,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Outcome Diagnostic Spotlight */}
          {isFailure ? (
            <div className="mars-panel-light p-4 border-[#C94B43] bg-[#FDE8E6]/65 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-[#FAF0DC] border-2 border-[#292C2B] flex items-center justify-center shrink-0">
                    {renderFailureCauseIcon()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-extrabold uppercase tracking-wide text-[#C94B43]">
                      Why the Mission Ended
                    </div>
                    <h2 className="text-base font-extrabold text-[#292C2B] leading-tight">
                      {failureMeta.title}
                    </h2>
                    <p className="text-xs font-semibold text-[#292C2B]/80 leading-snug mt-0.5">
                      {failureMeta.subtitle}
                    </p>
                  </div>
                </div>

                <div className="px-3 py-2 rounded-xl bg-[#FAF0DC] border-2 border-[#292C2B] text-right shrink-0 tabular-nums">
                  <div className="text-[10px] font-bold text-[#292C2B]/65">
                    {failureMeta.metricLabel}
                  </div>
                  <div className="text-sm font-extrabold font-mono-tabular text-[#C94B43]">
                    {failureMetricValue}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {failureMeta.linkedBuildings.map((bId) => {
                  const def = BUILDING_DEFINITIONS[bId];
                  const b = state.buildings[bId];
                  const st = getBuildingStatusDisplay(state, bId);
                  return (
                    <div
                      key={bId}
                      className="p-2.5 rounded-xl bg-[#FAF0DC] border-2 border-[#292C2B] flex items-center gap-2.5"
                    >
                      <div className="w-9 h-9 rounded-lg bg-[#F1D8A8] border border-[#292C2B] flex items-center justify-center shrink-0">
                        <BuildingIcon id={bId} className="w-6 h-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-extrabold text-[#292C2B] truncate">
                            {def.shortName}
                          </span>
                          <span
                            className="text-[10px] font-extrabold shrink-0"
                            style={{ color: st.color }}
                          >
                            {st.label}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-[#E9D7B5] overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${b.condition}%`, backgroundColor: st.barColor }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : !didPass ? (
            <div className="mars-panel-light p-4 border-[#B94F32] bg-[#FDE8E6]/50 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-[#B94F32] border-2 border-[#292C2B] text-[#FAF0DC] flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-[11px] font-extrabold uppercase tracking-wide text-[#B94F32]">
                      Objectives Missed ({failedChecks.length} Unmet)
                    </div>
                    <h2 className="text-sm sm:text-base font-extrabold text-[#292C2B] leading-tight">
                      Outpost Not Ready for Long-Term Autonomy
                    </h2>
                  </div>
                </div>
                <span className="font-mono-tabular text-xs font-extrabold text-[#B94F32]">
                  {operationalCount}/{totalFacilities} Facilities Online
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {failedChecks.map((chk) => (
                  <div
                    key={chk.id}
                    className="p-2.5 rounded-xl bg-[#FAF0DC] border-2 border-[#C94B43]/60 flex items-start gap-2"
                  >
                    <XCircle className="w-4 h-4 text-[#C94B43] shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-[#292C2B]">{chk.label}</div>
                      <div className="text-[11px] font-semibold text-[#C94B43] leading-snug">
                        {chk.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mars-panel-light p-4 border-[#396344] bg-[#E3F1E6]/75 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-[#396344] border-2 border-[#292C2B] text-[#FAF0DC] flex items-center justify-center shrink-0">
                    <Award className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-[11px] font-extrabold uppercase tracking-wide text-[#2F5B3B]">
                      30-Sol Victory Achieved
                    </div>
                    <h2 className="text-sm sm:text-base font-extrabold text-[#292C2B] leading-tight">
                      Jezero Outpost Ready for 150-Sol Operations
                    </h2>
                  </div>
                </div>
                <span className="font-mono-tabular text-xs font-extrabold text-[#2F5B3B]">
                  {operationalCount}/{totalFacilities} Facilities Online
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="p-2.5 rounded-xl bg-[#FAF0DC] border-2 border-[#292C2B] flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-[#E3F1E6] border border-[#292C2B] flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5 text-[#396344]" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-[#292C2B]/65">Crew Survival</div>
                    <div className="text-xs font-extrabold text-[#292C2B] font-mono-tabular">
                      5/5 Safe · {state.crew.condition}% HP
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-[#FAF0DC] border-2 border-[#292C2B] flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-[#E3F1E6] border border-[#292C2B] flex items-center justify-center shrink-0">
                    <Shield className="w-5 h-5 text-[#477C9B]" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-[#292C2B]/65">Outpost Systems</div>
                    <div className="text-xs font-extrabold text-[#292C2B] font-mono-tabular">
                      {assessment?.mandatoryChecks.filter((c) => c.passed).length ?? 7}/
                      {assessment?.mandatoryChecks.length ?? 7} Objectives Met
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-[#FAF0DC] border-2 border-[#292C2B] flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-[#E3F1E6] border border-[#292C2B] flex items-center justify-center shrink-0">
                    <Sprout className="w-5 h-5 text-[#396344]" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-[#292C2B]/65">Colony Harvests</div>
                    <div className="text-xs font-extrabold text-[#292C2B] font-mono-tabular">
                      {state.harvestCount} Harvests · {state.totalTasksCompleted} Tasks
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Row 2: Visual Final Outpost Reserves */}
          <div className="mars-panel-light p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-xs font-extrabold text-[#292C2B]">
                Final Outpost Reserves
              </h2>
              <span className="text-[11px] font-bold text-[#292C2B]/70 font-mono-tabular">
                Crew Stamina {state.crew.energy}% · Radiation {state.crew.radiationExposure}%
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              {RESOURCE_META.map((res) => {
                const amount = state.resources[res.type];
                const cap = Math.max(1, state.capacities[res.type]);
                const pct = Math.max(0, Math.min(100, Math.round((amount / cap) * 100)));
                return (
                  <div key={res.type} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="flex items-center gap-1.5 text-xs font-extrabold text-[#292C2B]">
                        <ResourceIcon type={res.type} className="w-4 h-4 shrink-0" />
                        <span>{res.label}</span>
                      </span>
                      <span className="text-xs font-extrabold font-mono-tabular text-[#292C2B]">
                        {amount}
                        <span className="text-[10px] font-bold text-[#292C2B]/55">/{cap}</span>
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[#E9D7B5] overflow-hidden border border-[#292C2B]/25">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.max(amount > 0 ? 4 : 0, pct)}%`,
                          backgroundColor: amount <= 0 ? '#C94B43' : res.barColor,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Colony Condition Overview */}
          <div className="mars-panel-light p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-xs font-extrabold text-[#292C2B]">
                Colony Infrastructure Condition
              </h2>
              <span className="text-[11px] font-bold text-[#292C2B]/70 font-mono-tabular">
                {operationalCount}/{totalFacilities} Active
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {BUILDING_LIST.map((def) => {
                const b = state.buildings[def.id];
                const st = getBuildingStatusDisplay(state, def.id);
                return (
                  <div
                    key={def.id}
                    className={`p-2 rounded-xl border border-[#292C2B]/25 flex items-center gap-2 ${
                      st.isOk ? 'bg-[#F1D8A8]/35' : 'bg-[#FDE8E6]/75'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-[#F1D8A8] border border-[#292C2B] flex items-center justify-center shrink-0">
                      <BuildingIcon id={def.id} className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 leading-tight">
                        <span className="text-[11px] font-extrabold text-[#292C2B] truncate">
                          {def.shortName}
                        </span>
                        <span
                          className="text-[10px] font-extrabold shrink-0"
                          style={{ color: st.color }}
                        >
                          {st.label}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <div className="h-1.5 flex-1 rounded-full bg-[#E9D7B5] overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${b.condition}%`, backgroundColor: st.barColor }}
                          />
                        </div>
                        <span className="font-mono-tabular text-[10px] font-bold text-[#292C2B]/70 shrink-0">
                          {b.condition}%
                        </span>
                      </div>
                      {((def.id === 'solar_panels' && b.dustLevel >= 35) ||
                        (b.frostLevel ?? 0) >= 20) && (
                        <div className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-[#9A5D12]">
                          {def.id === 'solar_panels' && b.dustLevel >= 35 && (
                            <span className="inline-flex items-center gap-0.5">
                              <Wind className="w-2.5 h-2.5" aria-hidden="true" />
                              Dust {Math.round(b.dustLevel)}%
                            </span>
                          )}
                          {(b.frostLevel ?? 0) >= 20 && (
                            <span className="inline-flex items-center gap-0.5 text-[#477C9B]">
                              <Snowflake className="w-2.5 h-2.5" aria-hidden="true" />
                              Frost {Math.round(b.frostLevel ?? 0)}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Row 3: Two-Column Structured Breakdown & Mission Log */}
          <div
            className={`grid grid-cols-1 gap-4 ${
              assessment ? 'lg:grid-cols-2' : ''
            }`}
          >
            {/* Left Column: 150-Sol Sustainability Breakdown */}
            {assessment && (
              <div className="mars-panel-light p-4 flex flex-col">
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#292C2B]/15">
                  <h2 className="text-xs font-extrabold text-[#292C2B]">
                    150-Sol Sustainability Breakdown
                  </h2>
                  <span className="text-xs font-extrabold font-mono-tabular text-[#477C9B]">
                    {assessment.overallScore}/100
                  </span>
                </div>

                <div className="divide-y divide-[#292C2B]/10 mt-1">
                  {assessment.criteria.map((item) => {
                    const barColor =
                      item.status === 'pass'
                        ? '#396344'
                        : item.status === 'warning'
                        ? '#D77B4A'
                        : '#C94B43';
                    return (
                      <div key={item.id} className="py-2 first:pt-1.5 last:pb-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-xs font-extrabold text-[#292C2B] min-w-0">
                            {item.status === 'pass' ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#396344] shrink-0" aria-hidden="true" />
                            ) : item.status === 'warning' ? (
                              <AlertCircle className="w-3.5 h-3.5 text-[#D77B4A] shrink-0" aria-hidden="true" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-[#C94B43] shrink-0" aria-hidden="true" />
                            )}
                            <span className="truncate">{item.label}</span>
                          </span>
                          <span className="text-xs font-extrabold font-mono-tabular shrink-0">
                            {item.score}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-[#E9D7B5] overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.max(4, item.score)}%`, backgroundColor: barColor }}
                          />
                        </div>
                        <div className="text-[11px] font-medium text-[#292C2B]/70 leading-tight">
                          {item.detail}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Right Column: Mandatory Audit & Key Timeline */}
            <div className="mars-panel-light p-4 flex flex-col justify-between space-y-4">
              {assessment && !isFailure && assessment.mandatoryChecks.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#292C2B]/15">
                    <h2 className="text-xs font-extrabold text-[#292C2B]">
                      Mandatory Victory Checks
                    </h2>
                    <span
                      className={`text-xs font-extrabold font-mono-tabular ${
                        assessment.passed ? 'text-[#396344]' : 'text-[#C94B43]'
                      }`}
                    >
                      {assessment.mandatoryChecks.filter((c) => c.passed).length}/
                      {assessment.mandatoryChecks.length} Passed
                    </span>
                  </div>

                  <div className="mt-2 space-y-1.5">
                    {assessment.mandatoryChecks.map((chk) => (
                      <div
                        key={chk.id}
                        className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs ${
                          chk.passed ? 'bg-transparent' : 'bg-[#FDE8E6]'
                        }`}
                      >
                        {chk.passed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#396344] shrink-0 mt-0.5" aria-hidden="true" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-[#C94B43] shrink-0 mt-0.5" aria-hidden="true" />
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="font-extrabold text-[#292C2B]">{chk.label}</span>
                          {!chk.passed && (
                            <div className="text-[11px] font-semibold text-[#C94B43]">
                              {chk.detail}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Events & Command Decisions Summary */}
              <div
                className={
                  assessment && !isFailure
                    ? 'pt-3 border-t border-[#292C2B]/15 space-y-3'
                    : 'space-y-3'
                }
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="font-extrabold text-[#292C2B] mb-1.5">
                      Martian Hazards Faced
                    </div>
                    {state.eventHistory.length === 0 ? (
                      <div className="text-[11px] font-medium text-[#292C2B]/65">
                        Clear skies through Sol {state.day}.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {state.eventHistory.slice(-3).map((e, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-md bg-[#B94F32] border border-[#292C2B] flex items-center justify-center shrink-0">
                              <EventIcon
                                phenomenon={EVENT_DEFINITIONS[e.eventId]?.phenomenon ?? e.eventId}
                                className="w-4 h-4"
                              />
                            </div>
                            <span className="text-[11px] font-semibold text-[#292C2B] truncate">
                              <span className="font-extrabold font-mono-tabular">Sol {e.day}:</span>{' '}
                              {e.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="font-extrabold text-[#292C2B] mb-1.5">
                      Key Decisions
                    </div>
                    {state.keyDecisions.length === 0 ? (
                      <div className="text-[11px] font-medium text-[#292C2B]/65">
                        Standard daily operations.
                      </div>
                    ) : (
                      <div className="space-y-1.5 text-[11px] font-medium text-[#292C2B]/85">
                        {state.keyDecisions.slice(-3).map((d, idx) => (
                          <div key={idx} className="leading-snug truncate" title={d}>
                            · {d}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Row 4: Concise NASA Data Grounding Comparison */}
          <div className="mars-panel-light p-3.5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-[11px] leading-snug">
              <div>
                <div className="flex items-center gap-1.5 font-extrabold text-[#477C9B]">
                  <Globe className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Real NASA Jezero Science</span>
                </div>
                <ul className="mt-1 space-y-1 text-[#292C2B]/80 list-disc pl-4">
                  {NASA_SIMULATION_BOUNDARY.realScience.slice(0, 2).map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="sm:border-l sm:border-[#292C2B]/15 sm:pl-3.5">
                <div className="flex items-center gap-1.5 font-extrabold text-[#B94F32]">
                  <Gamepad2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Gameplay Simplifications</span>
                </div>
                <ul className="mt-1 space-y-1 text-[#292C2B]/80 list-disc pl-4">
                  {NASA_SIMULATION_BOUNDARY.fictionalGameplay.slice(0, 2).map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-4 sm:px-6 py-3 sm:py-3.5 border-t-2 border-[#292C2B] bg-[#FAF0DC] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          {onReplayEnding ? (
            <button
              type="button"
              disabled={isClosing}
              onClick={onReplayEnding}
              className="mars-btn flex-1 sm:flex-initial min-h-[44px] px-4 py-2.5 bg-[#F1D8A8] hover:bg-[#E9B77B] text-[#292C2B] text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Film className="w-4 h-4 text-[#477C9B]" aria-hidden="true" />
              <span>Replay Ending</span>
            </button>
          ) : (
            <span className="hidden sm:inline" />
          )}

          <button
            type="button"
            disabled={isClosing}
            onClick={() => closeWithZoom(onPlayAgain)}
            className="mars-btn flex-1 sm:flex-initial min-h-[44px] px-6 py-2.5 bg-[#B94F32] hover:bg-[#a64429] text-[#FAF0DC] text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span>Play Again</span>
          </button>
        </div>
      </div>
    </div>
  );
}
