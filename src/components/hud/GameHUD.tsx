import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ClipboardList,
  Clock,
  Coffee,
  Footprints,
  Globe,
  Heart,
  Moon,
  Pause,
  Shield,
  ShieldAlert,
  Sun,
  Sunrise,
  Sunset,
  Volume2,
  VolumeX,
  Wrench,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { BUILDING_DEFINITIONS } from '../../data/buildings';
import {
  formatMartianClock,
  TOTAL_DAY_HOURS,
} from '../../data/mission';
import { getMedaTelemetrySnapshot } from '../../data/nasa';
import { RESOURCE_CONFIGS, RESOURCE_ORDER } from '../../data/resources';
import {
  isCrewProtectedByShelter,
  isEventOfficiallyActive,
  isMajorEventCutsceneActive,
  isShelterRequiredEvent,
} from '../../systems/events';
import {
  calculateDailyRates,
  calculateEnergyGenerationStats,
  detectResourceShortages,
} from '../../systems/resources';
import { getCurrentTutorialStep } from '../../systems/tutorial';
import { GameState } from '../../types/game';
import { ResourceAmounts, ResourceType } from '../../types/resource';
import { CrewStaminaIcon, EventIcon, ResourceIcon } from '../icons/GameIcons';

interface GameHUDProps {
  state: GameState;
  availableTaskCount: number;
  leftDrawerOpen: boolean;
  isTaskProgressActive?: boolean;
  onToggleLeftDrawer: () => void;
  onRestCrew: () => void;
  onSelectBuilding: (id: GameState['selectedBuildingId']) => void;
}

const SHORTAGE_MESSAGE: Record<
  ResourceType,
  { text: string; target: GameState['selectedBuildingId'] }
> = {
  oxygen: { text: 'Low Air! Fix Oxygen Generation System', target: 'oxygen_generator' },
  water: { text: 'Low Water! Fix Water Recovery System', target: 'water_recycling' },
  food: { text: 'Low Food! Check Greenhouse', target: 'greenhouse' },
  energy: { text: 'Low Power! Check Solar Panels', target: 'solar_panels' },
};

export function GameHUD({
  state,
  availableTaskCount,
  leftDrawerOpen,
  isTaskProgressActive = false,
  onToggleLeftDrawer,
  onRestCrew,
  onSelectBuilding,
}: GameHUDProps) {
  const prevResourcesRef = useRef<ResourceAmounts>(state.resources);
  const prevHealthRef = useRef<number>(state.crew.condition);
  const prevDayRef = useRef<number>(state.day);
  const timersRef = useRef<Partial<Record<ResourceType, number>>>({});
  const healthTimerRef = useRef<number | undefined>(undefined);
  const seqRef = useRef(0);
  const [recentDeltas, setRecentDeltas] = useState<
    Partial<Record<ResourceType, { delta: number; seq: number }>>
  >({});
  const [crewHealthDelta, setCrewHealthDelta] = useState<{ delta: number; seq: number } | null>(
    null
  );

  useEffect(() => {
    const prev = prevResourcesRef.current;
    const prevDay = prevDayRef.current;
    prevResourcesRef.current = state.resources;
    prevDayRef.current = state.day;

    // Reset silently on game restart / Sol rewind
    if (state.day < prevDay) {
      setRecentDeltas({});
      setCrewHealthDelta(null);
      prevHealthRef.current = state.crew.condition;
      return;
    }

    const updates: Array<{ key: ResourceType; delta: number }> = [];
    for (const key of RESOURCE_ORDER) {
      const diff = Math.round(state.resources[key] - prev[key]);
      if (diff !== 0) {
        updates.push({ key, delta: diff });
      }
    }
    if (updates.length === 0) return;

    seqRef.current += 1;
    const seq = seqRef.current;
    setRecentDeltas((curr) => {
      const next = { ...curr };
      for (const u of updates) {
        next[u.key] = { delta: u.delta, seq };
      }
      return next;
    });

    for (const u of updates) {
      const existingTimer = timersRef.current[u.key];
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
      }
      timersRef.current[u.key] = window.setTimeout(() => {
        setRecentDeltas((curr) => {
          if (!curr[u.key] || curr[u.key]?.seq !== seq) return curr;
          const next = { ...curr };
          delete next[u.key];
          return next;
        });
      }, 2000);
    }
  }, [state.resources, state.day, state.crew.condition]);

  useEffect(() => {
    const prevHealth = prevHealthRef.current;
    prevHealthRef.current = state.crew.condition;
    const diff = Math.round(state.crew.condition - prevHealth);
    if (diff === 0) return;

    seqRef.current += 1;
    const seq = seqRef.current;
    setCrewHealthDelta({ delta: diff, seq });
    if (healthTimerRef.current !== undefined) {
      window.clearTimeout(healthTimerRef.current);
    }
    healthTimerRef.current = window.setTimeout(() => {
      setCrewHealthDelta((curr) => (curr?.seq === seq ? null : curr));
    }, 2400);
  }, [state.crew.condition]);

  useEffect(() => {
    return () => {
      for (const timer of Object.values(timersRef.current)) {
        if (timer !== undefined) window.clearTimeout(timer);
      }
      if (healthTimerRef.current !== undefined) {
        window.clearTimeout(healthTimerRef.current);
      }
    };
  }, []);

  const rates = calculateDailyRates({
    buildings: state.buildings,
    currentResources: state.resources,
    greenhouseCrop: state.greenhouseCrop,
    activeEvent: state.activeEvent,
    modifiers: state.modifiers,
    difficulty: state.difficulty,
  });
  const energyStats = calculateEnergyGenerationStats({
    buildings: state.buildings,
    currentResources: state.resources,
    greenhouseCrop: state.greenhouseCrop,
    activeEvent: state.activeEvent,
    modifiers: state.modifiers,
    hoursElapsed: state.hoursElapsed,
    difficulty: state.difficulty,
  });
  const shortages = detectResourceShortages(state.resources);

  const isSleepBusy = state.sleepPhase !== 'idle' || state.sleepingRemaining > 0;
  const isWaitingOutRadiationStorm =
    state.sleepPhase === 'returning' &&
    state.crew.inShelter &&
    isShelterRequiredEvent(state.activeEvent) &&
    isEventOfficiallyActive(state.activeEvent);
  const isWorkingNow = state.pendingAction?.phase === 'working';
  const canRest =
    !isSleepBusy &&
    !isWorkingNow &&
    TOTAL_DAY_HOURS - state.hoursElapsed >= 2 &&
    state.crew.energy < 95;
  const formattedTime = formatMartianClock(state.hoursElapsed);
  const isOvertime = state.overtimeHours > 0;
  const otTotalMins = Math.max(1, Math.round(state.overtimeHours * 60));
  const otHrs = Math.floor(otTotalMins / 60);
  const otMins = otTotalMins % 60;
  const overtimeText =
    otHrs <= 0 ? `${otMins}m` : otMins === 0 ? `${otHrs}h` : `${otHrs}h ${otMins}m`;

  const h = state.hoursElapsed;
  const dayPhase =
    h >= 5.0 && h < 7.0
      ? { iconColor: 'text-[#D77B4A]', kind: 'sunrise' as const }
      : h >= 7.0 && h < 17.5
      ? { iconColor: 'text-[#B94F32]', kind: 'day' as const }
      : h >= 17.5 && h < 20.0
      ? { iconColor: 'text-[#C94B43]', kind: 'sunset' as const }
      : { iconColor: 'text-[#477C9B]', kind: 'night' as const };

  const meda = getMedaTelemetrySnapshot(
    state.hoursElapsed,
    state.activeEvent,
    state.buildings.solar_panels.dustLevel
  );

  const crewProtected = isCrewProtectedByShelter(state.crew, state.buildings);
  const cutsceneActive = isMajorEventCutsceneActive(state);
  const lingeringHazards = state.lingeringHazards ?? [];
  const primaryLingeringHazard = lingeringHazards[0] ?? null;
  const activeOutdoorHazard = !cutsceneActive && isEventOfficiallyActive(state.activeEvent) && !crewProtected;
  const lingeringOutdoorHazard = !cutsceneActive && lingeringHazards.length > 0 && !crewProtected;
  const hazardExposed = activeOutdoorHazard || lingeringOutdoorHazard;
  const tutorialStep = getCurrentTutorialStep(state);

  return (
    <header className="w-full shrink-0 pointer-events-none space-y-1 lg:space-y-2">
      <div className="w-full flex flex-wrap mobile-landscape:flex-nowrap lg:flex-nowrap items-center justify-between gap-1.5 mobile-landscape:gap-1 lg:gap-2">
        {/* Left Cluster: Tasks Drawer Toggle + Sol/Clock + Crew Stamina & Health */}
        <div
          className={`w-full mobile-landscape:w-auto lg:w-auto flex flex-wrap mobile-landscape:flex-nowrap lg:flex-nowrap items-center gap-1.5 mobile-landscape:gap-1 lg:gap-2 pointer-events-auto transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] shrink-0 min-w-0 ${
            isTaskProgressActive ? 'opacity-65' : 'opacity-100'
          }`}
        >
          {/* Closable Icon-Only Tasks/Systems Drawer Button */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={onToggleLeftDrawer}
              aria-label={leftDrawerOpen ? 'Close tasks drawer' : 'Open tasks drawer'}
              title={leftDrawerOpen ? 'Close tasks' : 'Open tasks'}
              className={`relative mars-btn w-10 h-10 portrait:sm:w-11 portrait:sm:h-11 mobile-landscape:w-9 mobile-landscape:h-9 lg:w-11 lg:h-11 flex items-center justify-center cursor-pointer ${
                leftDrawerOpen
                  ? 'bg-[#B94F32] text-[#FAF0DC]'
                  : 'bg-[#FAF0DC] hover:bg-[#FFF8EB] text-[#292C2B]'
              } ${
                tutorialStep?.highlight === 'tasks_drawer' && !leftDrawerOpen
                  ? 'ring-4 ring-[#F4C552] animate-tutorial-ring'
                  : ''
              }`}
            >
              {leftDrawerOpen ? (
                <X className="w-5 h-5 mobile-landscape:w-4 mobile-landscape:h-4 lg:w-5 lg:h-5 shrink-0" aria-hidden="true" />
              ) : (
                <ClipboardList className="w-5 h-5 mobile-landscape:w-4 mobile-landscape:h-4 lg:w-5 lg:h-5 text-[#B94F32] shrink-0" aria-hidden="true" />
              )}
              {!leftDrawerOpen && availableTaskCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] lg:min-w-[20px] h-[18px] lg:h-5 px-1 rounded-full bg-[#718B78] text-[#FAF0DC] border-2 border-[#292C2B] text-[10px] font-extrabold leading-none flex items-center justify-center tabular-nums">
                  {availableTaskCount}
                </span>
              )}
            </button>
            {tutorialStep?.highlight === 'tasks_drawer' && !leftDrawerOpen && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-30 flex flex-col items-center animate-tutorial-bounce"
              >
                <ArrowUp className="w-4 h-4 text-[#F4C552] drop-shadow-[0_2px_0_#292C2B]" strokeWidth={3} />
                <span className="px-2 py-0.5 rounded-lg bg-[#F4C552] border-2 border-[#292C2B] text-[10px] font-extrabold text-[#292C2B] whitespace-nowrap shadow-[0_2px_0_#292C2B]">
                  Tap Tasks
                </span>
              </div>
            )}
          </div>

          {/* Compact Sol, 24h 39m Clock & MEDA Jezero Telemetry */}
          <div
            className={`h-10 portrait:sm:h-11 mobile-landscape:h-9 lg:h-11 px-2 mobile-landscape:px-1.5 lg:px-3 rounded-xl border-2 border-[#292C2B] shadow-[0_2px_0_#292C2B] lg:shadow-[0_3px_0_#292C2B] flex items-center gap-1.5 mobile-landscape:gap-1 lg:gap-2.5 tabular-nums shrink-0 ${
              isOvertime
                ? 'bg-[#C94B43] text-[#FAF0DC]'
                : 'bg-[#FAF0DC] text-[#292C2B]'
            }`}
            title={
              isOvertime
                ? `Overtime +${overtimeText} past 9:00 PM — Crew loses sleep recovery next sol! (${state.difficulty.toUpperCase()})`
                : `Martian Sol ${state.day}/${state.maxDays} · MEDA Jezero Weather: ${meda.temperatureC}°C · ${meda.pressurePa} Pa · Wind ${meda.windSpeedMs} m/s · Dust τ ${meda.opticalDepthTau} · RAD ${meda.radiationMsvSol} mSv/sol (${meda.skyConditionLabel})`
            }
          >
            {dayPhase.kind === 'sunrise' ? (
              <Sunrise
                className={`w-4 h-4 mobile-landscape:w-3.5 mobile-landscape:h-3.5 lg:w-5 lg:h-5 shrink-0 ${isOvertime ? 'text-[#FAF0DC]' : dayPhase.iconColor}`}
                aria-hidden="true"
              />
            ) : dayPhase.kind === 'day' ? (
              <Sun
                className={`w-4 h-4 mobile-landscape:w-3.5 mobile-landscape:h-3.5 lg:w-5 lg:h-5 shrink-0 ${isOvertime ? 'text-[#FAF0DC]' : dayPhase.iconColor}`}
                aria-hidden="true"
              />
            ) : dayPhase.kind === 'sunset' ? (
              <Sunset
                className={`w-4 h-4 mobile-landscape:w-3.5 mobile-landscape:h-3.5 lg:w-5 lg:h-5 shrink-0 ${isOvertime ? 'text-[#FAF0DC]' : dayPhase.iconColor}`}
                aria-hidden="true"
              />
            ) : (
              <Moon
                className={`w-4 h-4 mobile-landscape:w-3.5 mobile-landscape:h-3.5 lg:w-5 lg:h-5 shrink-0 ${isOvertime ? 'text-[#FAF0DC]' : dayPhase.iconColor}`}
                aria-hidden="true"
              />
            )}
            <span className="text-[11px] mobile-landscape:text-[10px] lg:text-xs font-extrabold whitespace-nowrap">
              Sol {state.day}/{state.maxDays}
            </span>
            <span className="opacity-30 font-bold text-[10px]" aria-hidden="true">
              |
            </span>
            <div className="flex items-center gap-1 mobile-landscape:gap-0.5 lg:gap-1">
              {isOvertime ? (
                <AlertTriangle className="w-3.5 h-3.5 mobile-landscape:w-3 mobile-landscape:h-3 lg:w-4 lg:h-4 shrink-0" aria-hidden="true" />
              ) : (
                <Clock className="w-3.5 h-3.5 mobile-landscape:w-3 mobile-landscape:h-3 lg:w-4 lg:h-4 text-[#477C9B] shrink-0" aria-hidden="true" />
              )}
              <span className="font-mono-tabular text-[11px] mobile-landscape:text-[10px] lg:text-xs font-extrabold whitespace-nowrap">
                {formattedTime}
              </span>
              {isOvertime && (
                <span className="text-[10px] font-extrabold uppercase tracking-wide leading-none ml-0.5">
                  OT
                </span>
              )}
            </div>
            <span className="hidden xl:inline opacity-30 font-bold" aria-hidden="true">
              |
            </span>
            <span
              className={`hidden xl:inline font-mono-tabular text-[11px] font-bold whitespace-nowrap ${
                isOvertime ? 'text-[#FAF0DC]/90' : 'text-[#477C9B]'
              }`}
            >
              {meda.temperatureC}°C · τ{meda.opticalDepthTau}
            </span>
          </div>

          {/* Portrait-Only (< sm) Rest Button placed cleanly on Row 1a so Stamina & Health get a full uncluttered row */}
          {canRest && (
            <button
              type="button"
              onClick={onRestCrew}
              title="Rest 2 hours to regain Crew Stamina"
              className="sm:hidden mobile-landscape:hidden ml-auto mars-btn h-10 px-2.5 bg-[#718B78] text-[#FAF0DC] text-[11px] font-extrabold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Coffee className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Rest</span>
            </button>
          )}

          {/* Crew Stamina (Running Person) + Health Meter + Rest Button */}
          <div
            className={`relative w-full portrait:sm:w-auto mobile-landscape:w-auto lg:w-auto h-9 portrait:sm:h-11 mobile-landscape:h-9 lg:h-11 px-2.5 portrait:sm:px-2.5 mobile-landscape:px-1.5 lg:px-2.5 rounded-xl border-2 border-[#292C2B] shadow-[0_2px_0_#292C2B] lg:shadow-[0_3px_0_#292C2B] grid grid-cols-[1fr_auto_1fr] portrait:sm:flex mobile-landscape:flex lg:flex items-center gap-2 mobile-landscape:gap-1.5 lg:gap-2.5 min-w-0 tabular-nums transition-colors ${
              crewHealthDelta ? 'animate-resource-pulse' : ''
            } ${
              hazardExposed ? 'bg-[#FDE8E6]' : 'bg-[#FAF0DC]'
            } ${
              tutorialStep?.highlight === 'end_day'
                ? 'ring-2 ring-[#F4C552] animate-tutorial-ring'
                : ''
            }`}
            title={
              crewProtected
                ? `Crew Protected Inside Shelter · Stamina ${state.crew.energy}% · Health ${state.crew.condition}%`
                : activeOutdoorHazard
                ? `Active Hazard Exposure! Crew outside is losing health (${state.crew.condition}%) — move into Radiation Storm Shelter!`
                : lingeringOutdoorHazard && primaryLingeringHazard
                ? `${primaryLingeringHazard.label} (${primaryLingeringHazard.daysRemaining} sol left) affecting crew outdoors — ${primaryLingeringHazard.clearActionHint}`
                : `Crew Stamina ${state.crew.energy}% · Crew Health ${state.crew.condition}%`
            }
          >
            {/* Stamina */}
            <div className="flex items-center gap-1.5 mobile-landscape:gap-1 lg:gap-1.5 min-w-0">
              <CrewStaminaIcon
                low={state.crew.energy <= 25}
                className="w-4 h-4 mobile-landscape:w-3.5 mobile-landscape:h-3.5 lg:w-5 lg:h-5 shrink-0"
              />
              <div className="flex-1 min-w-0 portrait:sm:w-14 portrait:sm:flex-none mobile-landscape:w-[52px] mobile-landscape:flex-none lg:w-14 lg:flex-none">
                <div className="flex items-center justify-between text-[10px] font-extrabold leading-none gap-1">
                  <span className="mobile-landscape:hidden lg:inline">Stamina</span>
                  <span className="hidden mobile-landscape:inline lg:hidden">Stam</span>
                  <span
                    className={`font-mono-tabular ${
                      state.crew.energy <= 25 ? 'text-[#C94B43]' : 'text-[#292C2B]'
                    }`}
                  >
                    {state.crew.energy}%
                  </span>
                </div>
                <div className="h-1.5 lg:h-2 w-full bg-[#F1D8A8] border border-[#292C2B] rounded-full overflow-hidden mt-0.5 lg:mt-1">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${state.crew.energy}%`,
                      backgroundColor:
                        state.crew.energy <= 25 ? '#C94B43' : '#718B78',
                    }}
                  />
                </div>
              </div>
            </div>

            <span className="h-5 lg:h-6 w-px bg-[#292C2B]/25 shrink-0" aria-hidden="true" />

            {/* Health & Shelter Shield */}
            <div className="relative flex items-center gap-1.5 mobile-landscape:gap-1 lg:gap-1.5 min-w-0">
              {crewHealthDelta && (
                <span
                  key={crewHealthDelta.seq}
                  className={`pointer-events-none absolute -top-3.5 right-0 z-20 px-1.5 py-0.5 rounded-md border border-[#292C2B] font-mono-tabular text-[10px] font-extrabold leading-none shadow-[0_1px_0_#292C2B] animate-speech-pop ${
                    crewHealthDelta.delta > 0
                      ? 'bg-[#E3F1E6] text-[#2F5B3B]'
                      : 'bg-[#FDE8E6] text-[#C94B43]'
                  }`}
                >
                  {crewHealthDelta.delta > 0
                    ? `+${crewHealthDelta.delta}%`
                    : `${crewHealthDelta.delta}%`}
                </span>
              )}
              <Heart
                className={`w-4 h-4 mobile-landscape:w-3.5 mobile-landscape:h-3.5 lg:w-4 lg:h-4 shrink-0 ${
                  hazardExposed || state.crew.condition <= 40
                    ? 'text-[#C94B43] fill-[#C94B43]'
                    : 'text-[#C94B43] fill-[#C94B43]/80'
                }`}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0 portrait:sm:w-14 portrait:sm:flex-none mobile-landscape:w-[50px] mobile-landscape:flex-none lg:w-14 lg:flex-none">
                <div className="flex items-center justify-between text-[10px] font-extrabold leading-none gap-1">
                  <span className="mobile-landscape:hidden lg:inline">Health</span>
                  <span className="hidden mobile-landscape:inline lg:hidden">HP</span>
                  <span
                    className={`font-mono-tabular ${
                      hazardExposed || state.crew.condition <= 40
                        ? 'text-[#C94B43]'
                        : 'text-[#292C2B]'
                    }`}
                  >
                    {state.crew.condition}%
                  </span>
                </div>
                <div className="h-1.5 lg:h-2 w-full bg-[#F1D8A8] border border-[#292C2B] rounded-full overflow-hidden mt-0.5 lg:mt-1">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${state.crew.condition}%`,
                      backgroundColor:
                        state.crew.condition <= 40
                          ? '#C94B43'
                          : state.crew.condition <= 70
                          ? '#D77B4A'
                          : '#718B78',
                    }}
                  />
                </div>
              </div>
              {crewProtected && (
                <span
                  className="px-1 py-0.5 rounded bg-[#477C9B] text-[#FAF0DC] border border-[#292C2B] flex items-center shrink-0"
                  title="Protected inside Radiation Storm Shelter"
                >
                  <Shield className="w-3 h-3" aria-hidden="true" />
                </span>
              )}
            </div>

            {canRest && (
              <button
                type="button"
                onClick={onRestCrew}
                title="Rest 2 hours to regain Crew Stamina"
                className="hidden portrait:sm:flex mobile-landscape:flex lg:flex mars-btn px-2 mobile-landscape:px-1.5 lg:px-2 py-1 min-h-[26px] lg:min-h-0 bg-[#718B78] text-[#FAF0DC] text-[10px] lg:text-[11px] font-extrabold items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Coffee className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="mobile-landscape:hidden md:inline lg:inline">Rest</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Cluster: 4 Resource Bars */}
        <div
          className={`w-full mobile-landscape:w-auto mobile-landscape:ml-auto lg:w-auto flex items-center gap-1.5 lg:gap-2 pointer-events-auto transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] min-w-0 ${
            isTaskProgressActive ? 'opacity-65' : 'opacity-100'
          }`}
        >
          <div
            className={`relative w-full mobile-landscape:w-auto lg:w-auto grid grid-cols-4 mobile-landscape:flex mobile-landscape:flex-nowrap portrait:sm:flex portrait:sm:flex-nowrap lg:flex lg:flex-nowrap items-center gap-1 lg:gap-1.5 ${
              tutorialStep?.step === 0
                ? 'ring-2 ring-[#F4C552] rounded-2xl p-0.5 -m-0.5 animate-tutorial-ring'
                : ''
            }`}
          >
            {tutorialStep?.step === 0 && (
              <div
                aria-hidden="true"
                className="hidden sm:flex pointer-events-none absolute right-2 top-full mt-1.5 z-30 items-center gap-1 px-2 py-0.5 rounded-lg bg-[#F4C552] border-2 border-[#292C2B] text-[10px] font-extrabold text-[#292C2B] whitespace-nowrap shadow-[0_2px_0_#292C2B] animate-tutorial-bounce"
              >
                <ArrowUp className="w-3 h-3 shrink-0" strokeWidth={3} />
                <span>Daily Reserves</span>
              </div>
            )}
            {RESOURCE_ORDER.map((key) => {
              const cfg = RESOURCE_CONFIGS[key];
              const val = state.resources[key];
              const cap = state.capacities[key];
              const pct = Math.min(100, Math.round((val / Math.max(1, cap)) * 100));
              const net = rates.net[key].net;
              const isLow = shortages.includes(key);
              const isNearCap = !isLow && pct >= 85;
              const isFullCap = !isLow && pct >= 99;
              const recentDelta = recentDeltas[key];
              const barColor = isLow
                ? '#C94B43'
                : isNearCap
                ? '#E5A93B'
                : key === 'food'
                ? '#718B78'
                : key === 'energy'
                ? '#D77B4A'
                : '#477C9B';

              return (
                <div
                  key={key}
                  className={`relative h-9 portrait:sm:h-11 mobile-landscape:h-9 lg:h-11 px-1.5 mobile-landscape:px-1.5 lg:px-2.5 rounded-xl border-2 border-[#292C2B] shadow-[0_2px_0_#292C2B] lg:shadow-[0_3px_0_#292C2B] flex items-center gap-1 lg:gap-2 min-w-0 mobile-landscape:min-w-[62px] md:mobile-landscape:min-w-[74px] portrait:sm:min-w-[100px] lg:min-w-[116px] transition-colors ${
                    recentDelta ? 'animate-resource-pulse' : ''
                  } ${
                    isLow
                      ? 'bg-[#FDE8E6]'
                      : isNearCap
                      ? 'bg-[#FFF3D6]'
                      : 'bg-[#FAF0DC]'
                  }`}
                  title={`${cfg.label}: ${val}/${cap} (${net >= 0 ? `+${net}` : net}/sol)${
                    key === 'energy'
                      ? ` | Gen: +${energyStats.totalCurrentDailyOutput}/${energyStats.totalMaxDailyCapacity}/sol (${energyStats.sources
                          .map((s) => `${s.shortName} +${s.currentDailyOutput} [${s.contributionPct}%]`)
                          .join(', ')})${
                          energyStats.currentHourlyRate >= 1
                            ? ' · +1/hr sunny'
                            : energyStats.currentHourlyRate > 0
                            ? ' · +0.5/hr dimmed'
                            : ''
                        }`
                      : ''
                  }${
                    isFullCap
                      ? ' — Storage FULL!'
                      : isNearCap
                      ? ' — Approaching storage capacity!'
                      : ''
                  }`}
                >
                  {recentDelta && (
                    <span
                      key={recentDelta.seq}
                      className={`pointer-events-none absolute -top-2.5 right-1 z-20 px-1.5 py-0.5 rounded-md border border-[#292C2B] font-mono-tabular text-[10px] font-extrabold leading-none shadow-[0_1px_0_#292C2B] animate-speech-pop ${
                        recentDelta.delta > 0
                          ? 'bg-[#E3F1E6] text-[#2F5B3B]'
                          : 'bg-[#FDE8E6] text-[#C94B43]'
                      }`}
                    >
                      {recentDelta.delta > 0 ? `+${recentDelta.delta}` : recentDelta.delta}
                    </span>
                  )}
                  <ResourceIcon type={key} className="w-4 h-4 mobile-landscape:w-3.5 mobile-landscape:h-3.5 lg:w-6 lg:h-6 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-0.5 lg:gap-1 leading-none">
                      <span className="font-mono-tabular text-[11px] mobile-landscape:text-[10px] lg:text-xs font-extrabold text-[#292C2B] whitespace-nowrap">
                        {val}
                        <span
                          className={`hidden portrait:sm:inline lg:inline text-[10px] font-bold ${
                            isNearCap ? 'text-[#9A5D12]' : 'text-[#292C2B]/55'
                          }`}
                        >
                          /{cap}
                        </span>
                      </span>
                      <span
                        className={`font-mono-tabular text-[10px] font-extrabold leading-none flex items-center ${
                          isFullCap
                            ? 'text-[#9A5D12]'
                            : net > 0
                            ? 'text-[#396344]'
                            : net < 0
                            ? 'text-[#C94B43]'
                            : 'text-[#292C2B]/55'
                        }`}
                      >
                        {isFullCap ? (
                          'MAX'
                        ) : (
                          <>
                            {net > 0 && <ArrowUp className="w-2.5 h-2.5 hidden lg:inline" aria-hidden="true" />}
                            {net < 0 && <ArrowDown className="w-2.5 h-2.5 hidden lg:inline" aria-hidden="true" />}
                            {net >= 0 ? `+${net}` : net}
                          </>
                        )}
                      </span>
                    </div>

                    <div className="h-1.5 lg:h-2 w-full bg-[#F1D8A8] border border-[#292C2B] rounded-full overflow-hidden mt-0.5 lg:mt-1">
                      <div
                        className="h-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: barColor }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Live Event Animation Banner, Sleep Banner, Crew Task Banner, Lingering Hazard OR Actionable Alert Button */}
      {(shortages.length > 0 ||
        (state.activeEvent && !state.activeEvent.resolved) ||
        lingeringHazards.length > 0 ||
        state.crew.inShelter ||
        isSleepBusy ||
        state.pendingAction) && (
        <div className="w-full flex justify-center pointer-events-none">
          {state.sleepPhase === 'returning' ? (
            <div className="mars-panel pointer-events-auto px-3 py-1.5 lg:px-4 lg:py-2 rounded-xl lg:rounded-2xl bg-[#FAF0DC] flex items-center gap-2.5 lg:gap-3 max-w-xs w-full">
              <div className="w-7 h-7 lg:w-9 lg:h-9 rounded-lg lg:rounded-xl bg-[#477C9B] border-2 border-[#292C2B] flex items-center justify-center shrink-0 text-[#FAF0DC]">
                {isWaitingOutRadiationStorm ? (
                  <Shield className="w-4 h-4 lg:w-5 lg:h-5" aria-hidden="true" />
                ) : (
                  <Footprints className="w-4 h-4 lg:w-5 lg:h-5" aria-hidden="true" />
                )}
              </div>
              {isWaitingOutRadiationStorm ? (
                <div className="flex-1 min-w-0 flex items-center justify-between gap-2 text-[11px] lg:text-xs font-extrabold text-[#292C2B]">
                  <span className="truncate">
                    {state.activeEvent && state.activeEvent.animationRemaining > 0
                      ? 'Sheltered — Storm Passing...'
                      : 'Pick Storm Plan...'}
                  </span>
                  {state.activeEvent && state.activeEvent.animationRemaining > 0 && (
                    <span className="font-mono-tabular px-1.5 py-0.5 rounded bg-[#477C9B] text-[#FAF0DC] text-[10px] lg:text-[11px] shrink-0">
                      {Math.ceil(state.activeEvent.animationRemaining)}s
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-[11px] lg:text-xs font-extrabold text-[#292C2B] truncate">
                  Returning to Habitat...
                </div>
              )}
            </div>
          ) : isSleepBusy ? (
            <div className="mars-panel pointer-events-auto px-3 py-1.5 lg:px-4 lg:py-2 rounded-xl lg:rounded-2xl bg-[#FAF0DC] flex items-center gap-2.5 lg:gap-3 max-w-xs w-full">
              <div className="w-7 h-7 lg:w-9 lg:h-9 rounded-lg lg:rounded-xl bg-[#477C9B] border-2 border-[#292C2B] flex items-center justify-center shrink-0 text-[#FAF0DC]">
                <Moon className="w-4 h-4 lg:w-5 lg:h-5" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 text-[11px] lg:text-xs font-extrabold text-[#292C2B]">
                  <span className="truncate">Resting...</span>
                  <span className="font-mono-tabular px-1.5 py-0.5 rounded bg-[#477C9B] text-[#FAF0DC] text-[10px] lg:text-[11px] shrink-0">
                    {Math.ceil(state.sleepingRemaining)}s
                  </span>
                </div>
                <div className="h-1.5 w-full bg-[#F1D8A8] border border-[#292C2B] rounded-full overflow-hidden mt-1 lg:mt-1.5">
                  <div
                    className="h-full bg-[#477C9B] transition-all duration-200"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(0, ((3 - state.sleepingRemaining) / 3) * 100)
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          ) : state.pendingAction ? (
            <button
              type="button"
              onClick={() => onSelectBuilding(state.pendingAction!.buildingId)}
              className="mars-panel pointer-events-auto px-3 py-1.5 lg:px-4 lg:py-2 rounded-xl lg:rounded-2xl bg-[#FAF0DC] hover:bg-[#FFF8EB] flex items-center gap-2.5 lg:gap-3 max-w-sm w-full text-left cursor-pointer"
            >
              <div className="w-7 h-7 lg:w-9 lg:h-9 rounded-lg lg:rounded-xl bg-[#718B78] border-2 border-[#292C2B] flex items-center justify-center shrink-0 text-[#FAF0DC]">
                {state.pendingAction.phase === 'walking' ? (
                  <Footprints className="w-4 h-4 lg:w-5 lg:h-5" aria-hidden="true" />
                ) : (
                  <Wrench className="w-4 h-4 lg:w-5 lg:h-5" aria-hidden="true" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] lg:text-xs font-extrabold text-[#292C2B] truncate">
                  {state.pendingAction.phase === 'walking'
                    ? `Heading to ${BUILDING_DEFINITIONS[state.pendingAction.buildingId].shortName}...`
                    : `${state.pendingAction.label}...`}
                </div>
                {state.pendingAction.phase === 'walking' ? (
                  <div className="text-[10px] lg:text-[11px] font-bold text-[#292C2B]/80 truncate">
                    {state.pendingAction.label}
                  </div>
                ) : (
                  <div className="h-1.5 w-full bg-[#F1D8A8] border border-[#292C2B] rounded-full overflow-hidden mt-1 lg:mt-1.5">
                    <div
                      className="h-full bg-[#718B78] transition-all duration-100"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(
                            6,
                            ((state.pendingAction.workDurationSec -
                              state.pendingAction.workRemainingSec) /
                              Math.max(0.1, state.pendingAction.workDurationSec)) *
                              100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            </button>
          ) : state.activeEvent && !state.activeEvent.resolved && state.activeEvent.animationRemaining > 0 ? (
            <div
              className={`mars-panel pointer-events-auto px-2.5 py-1.5 lg:px-3.5 lg:py-2 rounded-xl lg:rounded-2xl flex items-center gap-2 lg:gap-3 max-w-md w-full ${
                state.activeEvent.definition.severity === 'minor'
                  ? 'bg-[#FFF5DF]'
                  : 'bg-[#FDE8E6]'
              }`}
            >
              <div
                className={`w-7 h-7 lg:w-9 lg:h-9 rounded-lg lg:rounded-xl border-2 border-[#292C2B] flex items-center justify-center shrink-0 ${
                  state.activeEvent.definition.severity === 'minor'
                    ? 'bg-[#D77B4A]'
                    : 'bg-[#C94B43]'
                }`}
              >
                <EventIcon
                  phenomenon={state.activeEvent.definition.phenomenon}
                  className="w-5 h-5 lg:w-6 lg:h-6"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 text-[11px] lg:text-xs font-extrabold text-[#292C2B]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`px-1.5 py-0.5 rounded border border-[#292C2B] text-[10px] font-black uppercase tracking-wide leading-none shrink-0 ${
                        state.activeEvent.definition.severity === 'super_major'
                          ? 'bg-[#292C2B] text-[#F4C552]'
                          : state.activeEvent.definition.severity === 'major'
                          ? 'bg-[#C94B43] text-[#FAF0DC]'
                          : 'bg-[#F4C552] text-[#292C2B]'
                      }`}
                    >
                      {state.activeEvent.definition.severity === 'super_major'
                        ? 'Super'
                        : state.activeEvent.definition.severity}
                    </span>
                    <span className="truncate">{state.activeEvent.definition.title}</span>
                  </div>
                  <span
                    className={`font-mono-tabular px-1.5 py-0.5 rounded text-[#FAF0DC] text-[10px] lg:text-[11px] shrink-0 ${
                      state.activeEvent.definition.severity === 'minor'
                        ? 'bg-[#B94F32]'
                        : 'bg-[#C94B43]'
                    }`}
                  >
                    {Math.ceil(state.activeEvent.animationRemaining)}s
                  </span>
                </div>
                <div className="hidden sm:flex mobile-landscape:hidden lg:flex items-center justify-between gap-2 mt-1">
                  <span className="text-[10px] font-bold text-[#292C2B]/85 truncate">
                    {isShelterRequiredEvent(state.activeEvent) && !state.crew.inShelter
                      ? 'Radiation hazard — Enter Shelter!'
                      : (state.activeEvent.definition.targetBuildings ?? []).length > 0
                      ? `At risk: ${(state.activeEvent.definition.targetBuildings ?? [])
                          .slice(0, 3)
                          .map((bId) => BUILDING_DEFINITIONS[bId].shortName)
                          .join(', ')}`
                      : 'Outpost-wide event'}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-[#F1D8A8] border border-[#292C2B] rounded-full overflow-hidden mt-1">
                  <div
                    className={`h-full transition-all duration-200 ${
                      state.activeEvent.definition.severity === 'minor'
                        ? 'bg-[#D77B4A]'
                        : 'bg-[#C94B43]'
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          ((state.activeEvent.animationDuration -
                            state.activeEvent.animationRemaining) /
                            Math.max(1, state.activeEvent.animationDuration)) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          ) : state.crew.inShelter ? (
            <button
              type="button"
              onClick={() => onSelectBuilding('radiation_shelter')}
              className="mars-btn pointer-events-auto max-w-full px-2.5 lg:px-3.5 py-1 lg:py-1.5 bg-[#477C9B] text-[#FAF0DC] text-[11px] lg:text-xs font-extrabold flex items-center justify-center gap-1.5 lg:gap-2 cursor-pointer text-center leading-tight lg:whitespace-nowrap"
            >
              <Shield className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" aria-hidden="true" />
              <span>
                {isShelterRequiredEvent(state.activeEvent) && isEventOfficiallyActive(state.activeEvent)
                  ? 'In Shelter — Locked Until Event Ends'
                  : 'In Shelter — Work Paused'}
              </span>
            </button>
          ) : state.activeEvent && !state.activeEvent.resolved ? (
            <button
              type="button"
              onClick={() =>
                onSelectBuilding(
                  isShelterRequiredEvent(state.activeEvent)
                    ? 'radiation_shelter'
                    : state.activeEvent?.definition.targetBuildings?.[0] ?? 'solar_panels'
                )
              }
              className={`mars-btn pointer-events-auto max-w-full px-2.5 lg:px-3.5 py-1 lg:py-1.5 text-[11px] lg:text-xs font-extrabold flex items-center justify-center gap-1.5 lg:gap-2 cursor-pointer text-center leading-tight lg:whitespace-nowrap ${
                state.activeEvent.definition.severity === 'minor'
                  ? 'bg-[#D77B4A] text-[#FAF0DC]'
                  : 'bg-[#C94B43] text-[#FAF0DC]'
              }`}
            >
              <EventIcon phenomenon={state.activeEvent.definition.phenomenon} className="w-4 h-4 lg:w-5 lg:h-5 shrink-0" />
              <span className="px-1.5 py-0.5 rounded bg-[#292C2B] text-[#F4C552] text-[10px] font-black uppercase tracking-wide leading-none shrink-0">
                {state.activeEvent.definition.severity === 'super_major'
                  ? 'Super'
                  : state.activeEvent.definition.severity}
              </span>
              <span>
                {isShelterRequiredEvent(state.activeEvent) && !state.crew.inShelter
                  ? `${state.activeEvent.definition.title} — Enter Shelter`
                  : state.activeEvent.definition.title}
              </span>
            </button>
          ) : primaryLingeringHazard ? (
            <button
              type="button"
              onClick={() =>
                onSelectBuilding(
                  primaryLingeringHazard.kind === 'toxic_dust'
                    ? 'solar_panels'
                    : primaryLingeringHazard.kind === 'frost_haze'
                    ? 'water_recycling'
                    : 'radiation_shelter'
                )
              }
              title={primaryLingeringHazard.clearActionHint}
              className="mars-btn pointer-events-auto max-w-full px-2.5 lg:px-3.5 py-1 lg:py-1.5 bg-[#FDE8E6] text-[#B94F32] text-[11px] lg:text-xs font-extrabold flex items-center justify-center gap-1.5 lg:gap-2 cursor-pointer text-center leading-tight"
            >
              <AlertTriangle className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0 text-[#C94B43]" aria-hidden="true" />
              <span>
                {primaryLingeringHazard.label} ({primaryLingeringHazard.daysRemaining} sol{primaryLingeringHazard.daysRemaining === 1 ? '' : 's'}) — {primaryLingeringHazard.clearActionHint}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSelectBuilding(SHORTAGE_MESSAGE[shortages[0]].target)}
              className="mars-btn pointer-events-auto max-w-full px-2.5 lg:px-3.5 py-1 lg:py-1.5 bg-[#FAF0DC] text-[#C94B43] text-[11px] lg:text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer text-center leading-tight"
            >
              <ShieldAlert className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" aria-hidden="true" />
              <span>{SHORTAGE_MESSAGE[shortages[0]].text}</span>
            </button>
          )}
        </div>
      )}
    </header>
  );
}

export function EndDayDock({
  state,
  isTaskProgressActive = false,
  onEndDay,
}: {
  state: GameState;
  isTaskProgressActive?: boolean;
  onEndDay: () => void;
}) {
  const isOvertime = state.overtimeHours > 0;
  const isReturning = state.sleepPhase === 'returning';
  const isWaitingOutRadiationStorm =
    isReturning &&
    state.crew.inShelter &&
    isShelterRequiredEvent(state.activeEvent) &&
    isEventOfficiallyActive(state.activeEvent);
  const isSleeping =
    state.sleepPhase === 'sleeping' ||
    (state.sleepPhase === 'idle' && state.sleepingRemaining > 0);
  const isWorkingNow = state.pendingAction?.phase === 'working';
  const isBusy = isReturning || isSleeping || isWorkingNow;
  const highlightEndDay = getCurrentTutorialStep(state)?.highlight === 'end_day' && !isBusy;

  return (
    <div className="relative pointer-events-none">
      {highlightEndDay && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-30 flex flex-col items-center animate-tutorial-bounce"
        >
          <span className="px-2.5 py-0.5 rounded-lg bg-[#F4C552] border-2 border-[#292C2B] text-[10px] font-extrabold text-[#292C2B] whitespace-nowrap shadow-[0_2px_0_#292C2B]">
            Finish Sol 1 Here
          </span>
          <ArrowDown className="w-4 h-4 text-[#F4C552] drop-shadow-[0_2px_0_#292C2B]" strokeWidth={3} />
        </div>
      )}
      <button
        type="button"
        onClick={onEndDay}
        disabled={isBusy}
        className={`mars-btn pointer-events-auto px-3 py-1.5 mobile-landscape:px-3 mobile-landscape:py-1.5 lg:px-5 lg:py-2.5 rounded-xl lg:rounded-2xl flex items-center gap-2 lg:gap-2.5 whitespace-nowrap transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isTaskProgressActive ? 'opacity-75' : 'opacity-100'
        } ${highlightEndDay ? 'ring-4 ring-[#F4C552] animate-tutorial-ring' : ''} ${
          isBusy
            ? 'bg-[#477C9B] text-[#FAF0DC] cursor-not-allowed opacity-90'
            : isOvertime
            ? 'bg-[#B94F32] hover:bg-[#a64429] text-[#FAF0DC] cursor-pointer'
            : 'bg-[#718B78] hover:bg-[#5f7866] text-[#FAF0DC] cursor-pointer'
        }`}
      >
        {isReturning ? (
          isWaitingOutRadiationStorm ? (
            <Shield className="w-5 h-5 mobile-landscape:w-4 mobile-landscape:h-4 lg:w-6 lg:h-6 shrink-0" aria-hidden="true" />
          ) : (
            <Footprints className="w-5 h-5 mobile-landscape:w-4 mobile-landscape:h-4 lg:w-6 lg:h-6 shrink-0" aria-hidden="true" />
          )
        ) : isSleeping ? (
          <Moon className="w-5 h-5 mobile-landscape:w-4 mobile-landscape:h-4 lg:w-6 lg:h-6 shrink-0" aria-hidden="true" />
        ) : isWorkingNow ? (
          <Wrench className="w-5 h-5 mobile-landscape:w-4 mobile-landscape:h-4 lg:w-6 lg:h-6 shrink-0" aria-hidden="true" />
        ) : (
          <Sunrise className="w-5 h-5 mobile-landscape:w-4 mobile-landscape:h-4 lg:w-6 lg:h-6 shrink-0" aria-hidden="true" />
        )}
        <div className="text-left">
          <div className="text-xs lg:text-sm font-extrabold leading-none flex items-center gap-1 lg:gap-1.5">
            <span>
              {isReturning
                ? isWaitingOutRadiationStorm
                  ? 'STORM PASSING...'
                  : 'WALKING HOME...'
                : isSleeping
                ? `SLEEPING... ${Math.ceil(state.sleepingRemaining)}s`
                : isWorkingNow
                ? 'WORKING...'
                : state.day >= state.maxDays
                ? 'FINISH SOL 30'
                : 'END SOL'}
            </span>
            {!isBusy && <ArrowRight className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" aria-hidden="true" />}
          </div>
          {!isBusy && (
            <div className="text-[10px] lg:text-[11px] font-bold opacity-95 mt-0.5 leading-none">
              {state.day >= state.maxDays ? 'Final Report' : `Sol ${state.day + 1}`}
            </div>
          )}
        </div>
      </button>
    </div>
  );
}

export function BottomRightControls({
  audioMuted,
  isTaskProgressActive = false,
  onToggleMute,
  onPause,
}: {
  audioMuted: boolean;
  isTaskProgressActive?: boolean;
  onToggleMute: () => void;
  onPause: () => void;
}) {
  const triggerZoom = (action: 'in' | 'out' | 'planet') => {
    window.dispatchEvent(new CustomEvent('mars30:zoom', { detail: { action } }));
  };

  return (
    <div
      className={`pointer-events-auto flex items-center gap-1 lg:gap-1.5 bg-[#FAF0DC] border-2 border-[#292C2B] shadow-[0_2px_0_#292C2B] lg:shadow-[0_3px_0_#292C2B] rounded-xl lg:rounded-2xl p-1 lg:p-1.5 transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isTaskProgressActive ? 'opacity-80' : 'opacity-100'
      }`}
      aria-label="Map and Mission Controls"
    >
      <button
        type="button"
        onClick={() => triggerZoom('in')}
        aria-label="Zoom in"
        title="Zoom in"
        className="hidden portrait:sm:flex lg:flex w-10 h-10 rounded-xl bg-[#F1D8A8]/55 hover:bg-[#F1D8A8] active:scale-95 border border-[#292C2B]/25 items-center justify-center cursor-pointer text-[#292C2B] transition-all"
      >
        <ZoomIn className="w-5 h-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => triggerZoom('out')}
        aria-label="Zoom out"
        title="Zoom out"
        className="hidden portrait:sm:flex lg:flex w-10 h-10 rounded-xl bg-[#F1D8A8]/55 hover:bg-[#F1D8A8] active:scale-95 border border-[#292C2B]/25 items-center justify-center cursor-pointer text-[#292C2B] transition-all"
      >
        <ZoomOut className="w-5 h-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => triggerZoom('planet')}
        aria-label="Full Mars planet view"
        title="Full Mars Planet View"
        className="w-9 h-9 mobile-landscape:w-8 mobile-landscape:h-8 lg:w-10 lg:h-10 rounded-lg lg:rounded-xl bg-[#F1D8A8]/55 hover:bg-[#F1D8A8] active:scale-95 border border-[#292C2B]/25 flex items-center justify-center cursor-pointer text-[#B94F32] transition-all"
      >
        <Globe className="w-4 h-4 lg:w-5 lg:h-5" aria-hidden="true" />
      </button>

      <span className="h-5 lg:h-6 w-px bg-[#292C2B]/25 mx-0.5" aria-hidden="true" />

      <button
        type="button"
        onClick={onToggleMute}
        aria-label={audioMuted ? 'Turn sound on' : 'Turn sound off'}
        title={audioMuted ? 'Sound On' : 'Mute Sound'}
        className="w-9 h-9 mobile-landscape:w-8 mobile-landscape:h-8 lg:w-10 lg:h-10 rounded-lg lg:rounded-xl bg-[#F1D8A8]/55 hover:bg-[#F1D8A8] active:scale-95 border border-[#292C2B]/25 flex items-center justify-center cursor-pointer text-[#292C2B] transition-all"
      >
        {audioMuted ? (
          <VolumeX className="w-4 h-4 lg:w-5 lg:h-5 text-[#C94B43]" aria-hidden="true" />
        ) : (
          <Volume2 className="w-4 h-4 lg:w-5 lg:h-5" aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        onClick={onPause}
        aria-label="Pause mission"
        title="Pause Mission"
        className="w-9 h-9 mobile-landscape:w-8 mobile-landscape:h-8 lg:w-10 lg:h-10 rounded-lg lg:rounded-xl bg-[#F1D8A8]/55 hover:bg-[#F1D8A8] active:scale-95 border border-[#292C2B]/25 flex items-center justify-center cursor-pointer text-[#292C2B] transition-all"
      >
        <Pause className="w-4 h-4 lg:w-5 lg:h-5" aria-hidden="true" />
      </button>
    </div>
  );
}
