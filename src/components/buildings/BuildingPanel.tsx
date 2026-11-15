import {
  AlertTriangle,
  ArrowDown,
  BookOpen,
  CheckCircle2,
  Clock,
  Footprints,
  Lock,
  Shield,
  Sparkles,
  Sprout,
  Wrench,
  X,
} from 'lucide-react';
import { getFacilityStorageBonus } from '../../data/balance';
import { BUILDING_DEFINITIONS } from '../../data/buildings';
import { CROP_DEFINITIONS, CROP_MAP } from '../../data/crops';
import { TOTAL_DAY_HOURS } from '../../data/mission';
import { RESOURCE_CONFIGS, RESOURCE_ORDER } from '../../data/resources';
import { getBuildingUnlockStatus } from '../../systems/buildings';
import { getActiveOutdoorHazardSummary } from '../../systems/events';
import { canPlantCrop } from '../../systems/greenhouse';
import { calculateDailyRates, calculateEnergyGenerationStats } from '../../systems/resources';
import { getEffectiveTaskCosts, getTasksForBuilding, validateTask } from '../../systems/tasks';
import { getCurrentTutorialStep } from '../../systems/tutorial';
import { BuildingId } from '../../types/building';
import { GameState } from '../../types/game';
import { ResourceType } from '../../types/resource';
import { BuildingIcon, CrewStaminaIcon, ResourceIcon } from '../icons/GameIcons';
import { DescriptionModalData } from '../mission/MissionModals';

interface BuildingPanelProps {
  state: GameState;
  minimized?: boolean;
  onClose: () => void;
  onExecuteTask: (taskId: string) => void;
  onPlantCrop: (cropId: string) => void;
  onHarvestCrop: () => void;
  onToggleShelter: () => void;
  onOpenDescription: (data: DescriptionModalData) => void;
}

export function BuildingPanel({
  state,
  minimized = false,
  onClose,
  onExecuteTask,
  onPlantCrop,
  onHarvestCrop,
  onToggleShelter,
  onOpenDescription,
}: BuildingPanelProps) {
  if (!state.selectedBuildingId) return null;

  const id: BuildingId = state.selectedBuildingId;
  const def = BUILDING_DEFINITIONS[id];
  const bState = state.buildings[id];
  const tutorialStep = getCurrentTutorialStep(state);
  const allTasks = getTasksForBuilding(id);
  const unlockStatus = getBuildingUnlockStatus(id, state);
  const isLocked = !unlockStatus.unlocked;

  const needsRestorationFirst = !bState.restoredOnce || bState.status === 'inactive';
  const isDamaged = !needsRestorationFirst && bState.status === 'damaged';
  const hasMalfunction = !needsRestorationFirst && (bState.malfunctionDaysRemaining ?? 0) > 0;
  const hasFrost = !needsRestorationFirst && (bState.frostLevel ?? 0) >= 20;

  const statusText = isLocked
    ? 'Sol 1 Locked'
    : needsRestorationFirst
    ? 'Needs Fix!'
    : hasMalfunction
    ? bState.malfunctionKind === 'frost'
      ? 'Frosted!'
      : bState.malfunctionKind === 'disrupted'
      ? 'Disrupted'
      : 'Malfunction'
    : isDamaged
    ? 'Repair Needed'
    : hasFrost
    ? 'Frosted!'
    : id === 'solar_panels' && bState.dustLevel >= 35
    ? 'Dusty!'
    : 'Working!';

  const statusColor = isLocked
    ? '#5E5955'
    : needsRestorationFirst
    ? '#8C4D32'
    : isDamaged || hasMalfunction || hasFrost || statusText === 'Dusty!'
    ? '#B3693B'
    : '#396344';

  const isSleeping = state.sleepPhase !== 'idle' || state.sleepingRemaining > 0;
  const isWorkingAnywhere = state.pendingAction?.phase === 'working';
  const pendingHere =
    state.pendingAction?.buildingId === id ? state.pendingAction : null;

  // Show tasks relevant to the building's current state (affordable AND temporarily unaffordable so kids can see required resources!)
  const visibleTasks = isLocked
    ? []
    : allTasks.filter((t) => {
        if (needsRestorationFirst && t.category === 'minor' && !t.setsOperational) return false;
        if (!needsRestorationFirst && t.category === 'major' && t.setsOperational) return false;
        const v = validateTask(t, state);
        if (v.canExecute) return true;
        return (
          v.reason !== 'Already restored' &&
          v.reason !== 'Condition is already at peak' &&
          v.reason !== 'Panels are already clean' &&
          v.reason !== 'Repair already in progress'
        );
      });
  const availableTasks = visibleTasks.filter((t) => validateTask(t, state).canExecute);

  // Fallback blocked reason if no task cards apply
  const primaryPendingTask = allTasks.find((t) => {
    if (needsRestorationFirst && t.category === 'minor' && !t.setsOperational) return false;
    const v = validateTask(t, state);
    return (
      !v.canExecute &&
      v.reason !== 'Already restored' &&
      v.reason !== 'Condition is already at peak' &&
      v.reason !== 'Panels are already clean'
    );
  });
  const pendingReason = primaryPendingTask ? validateTask(primaryPendingTask, state).reason : null;

  const activeCrop = state.greenhouseCrop ? CROP_MAP[state.greenhouseCrop.cropId] : null;
  const canHarvestNow =
    id === 'greenhouse' &&
    !isSleeping &&
    !isWorkingAnywhere &&
    !state.crew.inShelter &&
    Boolean(state.greenhouseCrop?.isMature) &&
    state.hoursElapsed + 1 <= TOTAL_DAY_HOURS;

  const availableCrops =
    id === 'greenhouse' &&
    !isSleeping &&
    !isWorkingAnywhere &&
    !needsRestorationFirst &&
    !state.greenhouseCrop &&
    !state.crew.inShelter
      ? CROP_DEFINITIONS.filter(
          (crop) =>
            canPlantCrop({
              cropId: crop.id,
              greenhouse: bState,
              currentCrop: state.greenhouseCrop,
              resources: state.resources,
              hoursElapsed: state.hoursElapsed,
              inShelter: state.crew.inShelter,
            }).ok
        )
      : [];

  const canUseShelter =
    id === 'radiation_shelter' &&
    (!needsRestorationFirst || state.crew.inShelter) &&
    !isSleeping &&
    !isWorkingAnywhere;
  const outdoorHazard = getActiveOutdoorHazardSummary(state);

  const hasAnyAction =
    visibleTasks.length > 0 ||
    availableTasks.length > 0 ||
    canHarvestNow ||
    availableCrops.length > 0 ||
    canUseShelter;

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
  const energySourceStat = energyStats.sources.find((s) => s.buildingId === id) ?? null;

  const storageBonusMap = getFacilityStorageBonus(def, state.difficulty);
  const storageBonusEntry = (
    Object.entries(storageBonusMap).find(([, v]) => (v ?? 0) > 0) as
      | [ResourceType, number]
      | undefined
  );
  const storageStats = storageBonusEntry
    ? {
        key: storageBonusEntry[0],
        label: RESOURCE_CONFIGS[storageBonusEntry[0]].label,
        bonus: storageBonusEntry[1],
        current: state.resources[storageBonusEntry[0]],
        capacity: state.capacities[storageBonusEntry[0]],
        pct: Math.min(
          100,
          Math.round(
            (state.resources[storageBonusEntry[0]] /
              Math.max(1, state.capacities[storageBonusEntry[0]])) *
              100
          )
        ),
      }
    : null;
  const isStorageNearCap = Boolean(storageStats && !needsRestorationFirst && storageStats.pct >= 85);
  const isStorageFull = Boolean(storageStats && !needsRestorationFirst && storageStats.pct >= 99);

  const activityLine: { text: string; tone: 'active' | 'warn' | 'off' } | null = (() => {
    if (id === 'solar_panels') {
      if (needsRestorationFirst) return { text: 'Offline — restore to generate power', tone: 'off' };
      return {
        text: `Generating +${rates.production.energy} Power/sol`,
        tone: isDamaged || bState.dustLevel >= 35 ? 'warn' : 'active',
      };
    }
    if (id === 'oxygen_generator') {
      if (needsRestorationFirst) return { text: 'Offline — restore to produce oxygen', tone: 'off' };
      if (!rates.hasPowerForLifeSupport) return { text: 'No Power — restore Solar Panels', tone: 'warn' };
      return {
        text: `Producing +${rates.production.oxygen} Oxygen/sol`,
        tone: isDamaged ? 'warn' : 'active',
      };
    }
    if (id === 'water_recycling') {
      if (needsRestorationFirst) return { text: 'Offline — restore to recover water', tone: 'off' };
      if (!rates.hasPowerForLifeSupport) return { text: 'No Power — restore Solar Panels', tone: 'warn' };
      return {
        text: `Supplying +${rates.production.water} Water/sol`,
        tone: isDamaged ? 'warn' : 'active',
      };
    }
    if (id === 'greenhouse') {
      if (needsRestorationFirst) return { text: 'Offline — restore to grow food', tone: 'off' };
      if (!rates.hasPowerForLifeSupport) return { text: 'Grow lights low on power', tone: 'warn' };
      if (state.greenhouseCrop?.isMature) {
        return {
          text: `+${rates.production.food} Food/sol · Crop ready to harvest!`,
          tone: 'active',
        };
      }
      if (state.greenhouseCrop && activeCrop) {
        return {
          text: `+${rates.production.food} Food/sol · Growing ${activeCrop.name}`,
          tone: isDamaged ? 'warn' : 'active',
        };
      }
      return {
        text: `Producing +${rates.production.food} Food/sol`,
        tone: isDamaged ? 'warn' : 'active',
      };
    }
    return null;
  })();

  const pct =
    pendingHere && pendingHere.phase === 'working'
      ? Math.min(
          100,
          Math.max(
            6,
            ((pendingHere.workDurationSec - pendingHere.workRemainingSec) /
              Math.max(0.1, pendingHere.workDurationSec)) *
              100
          )
        )
      : bState.condition;

  return (
    <aside
      className="relative w-full h-full max-h-full pointer-events-none flex flex-col min-h-0"
      aria-label={`${def.name} panel`}
    >
      {/* Minimized Tucked Tab anchored flush to the right side during task progress */}
      <div
        className={`hidden mobile-landscape:flex md:flex absolute right-0 top-1/2 -translate-y-1/2 mars-panel p-2 bg-[#FAF0DC] rounded-2xl flex-col items-center gap-2 w-13 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-none ${
          minimized ? 'opacity-95 translate-x-0' : 'opacity-0 translate-x-2'
        }`}
        aria-hidden={!minimized}
      >
        <div className="w-9 h-9 rounded-xl bg-[#F1D8A8] border-2 border-[#292C2B] flex items-center justify-center shrink-0">
          <BuildingIcon id={id} className="w-6 h-6" />
        </div>
        <div className="w-2.5 h-16 bg-[#F1D8A8] border border-[#292C2B] rounded-full overflow-hidden flex flex-col justify-end">
          <div
            className="w-full bg-[#718B78] transition-all duration-150"
            style={{ height: `${pct}%` }}
          />
        </div>
      </div>

      <div
        className={`mars-panel flex flex-col max-h-full overflow-hidden rounded-t-2xl rounded-b-xl mobile-landscape:rounded-2xl md:rounded-2xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          minimized
            ? 'opacity-0 translate-y-2 mobile-landscape:translate-y-0 mobile-landscape:translate-x-2 md:translate-y-0 md:translate-x-2 pointer-events-none'
            : 'opacity-100 translate-y-0 translate-x-0 pointer-events-auto'
        }`}
      >
        {/* Mobile sheet drag-handle cue (portrait bottom sheet only) */}
        <div className="md:hidden mobile-landscape:hidden flex justify-center pt-1 pb-0.5 bg-[#FAF0DC] shrink-0" aria-hidden="true">
          <span className="w-9 h-1 rounded-full bg-[#292C2B]/25" />
        </div>

        {/* Icon-first Header with Close Button */}
        <div className="px-2.5 py-1.5 mobile-landscape:px-2.5 mobile-landscape:py-1.5 lg:px-3.5 lg:py-3 border-b-2 border-[#292C2B] flex items-center justify-between gap-2 bg-[#FAF0DC] shrink-0">
          <div className="flex items-center gap-2 lg:gap-2.5 min-w-0">
            <div className="w-9 h-9 mobile-landscape:w-8 mobile-landscape:h-8 lg:w-11 lg:h-11 rounded-xl bg-[#F1D8A8] border-2 border-[#292C2B] flex items-center justify-center shrink-0">
              <BuildingIcon id={id} className="w-6 h-6 mobile-landscape:w-5 mobile-landscape:h-5 lg:w-8 lg:h-8" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs lg:text-sm font-extrabold leading-tight truncate">{def.name}</h2>
              <div
                className="mt-0.5 flex items-center gap-1 text-[11px] lg:text-xs font-extrabold"
                style={{ color: statusColor }}
              >
                {isLocked ? (
                  <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                ) : statusText === 'Working!' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>{statusText}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close building card"
            className="w-10 h-10 mobile-landscape:w-9 mobile-landscape:h-9 lg:w-10 lg:h-10 rounded-xl hover:bg-[#E9B77B]/60 active:scale-95 transition-all flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-5 h-5 mobile-landscape:w-4 mobile-landscape:h-4 lg:w-5 lg:h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-2 mobile-landscape:p-2 lg:p-3 overflow-y-auto space-y-2 lg:space-y-3 text-sm flex-1 min-h-0 overscroll-contain">
          {/* Health Bar (+ Dust on Solar Panels) */}
          <div className="mars-panel-light p-2.5 space-y-2">
            <div>
              <div className="flex justify-between text-[11px] font-extrabold mb-1 tabular-nums">
                <span>Health</span>
                <span>{bState.condition}%</span>
              </div>
              <div className="h-2.5 w-full bg-[#F1D8A8] border-2 border-[#292C2B] rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-200"
                  style={{
                    width: `${bState.condition}%`,
                    backgroundColor:
                      bState.condition >= 65
                        ? '#718B78'
                        : bState.condition >= 35
                        ? '#D77B4A'
                        : '#9E6245',
                  }}
                />
              </div>
            </div>

            {id === 'solar_panels' && bState.dustLevel > 10 && (
              <div className="text-[11px] font-extrabold text-[#B94F32] tabular-nums">
                Dust: {bState.dustLevel}%
              </div>
            )}

            {(bState.frostLevel ?? 0) >= 15 && (
              <div className="text-[11px] font-extrabold text-[#477C9B] tabular-nums">
                Frost: {bState.frostLevel}% (reducing efficiency — repair to thaw)
              </div>
            )}

            {(bState.malfunctionDaysRemaining ?? 0) > 0 && bState.malfunctionKind !== 'frost' && (
              <div className="text-[11px] font-extrabold text-[#B3693B]">
                {bState.malfunctionKind === 'electrical'
                  ? 'Electrical disturbance — output reduced until repaired'
                  : bState.malfunctionKind === 'electronic'
                  ? 'Electronic malfunction — output reduced until repaired'
                  : 'Storm disruption — output reduced until repaired'}
              </div>
            )}

            {activityLine && (
              <div
                className={`text-[11px] font-extrabold flex items-center gap-1.5 ${
                  activityLine.tone === 'active'
                    ? 'text-[#396344]'
                    : activityLine.tone === 'warn'
                    ? 'text-[#B3693B]'
                    : 'text-[#292C2B]/65'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 border border-[#292C2B] ${
                    activityLine.tone === 'active'
                      ? 'bg-[#718B78]'
                      : activityLine.tone === 'warn'
                      ? 'bg-[#E5A93B]'
                      : 'bg-[#8E867F]'
                  }`}
                  aria-hidden="true"
                />
                <span>{activityLine.text}</span>
              </div>
            )}

            {energySourceStat && (
              <div className="pt-1.5 border-t border-[#292C2B]/15 space-y-1 text-[11px] font-bold tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="text-[#292C2B]/75">Generation Output</span>
                  <span className="font-extrabold text-[#292C2B]">
                    +{energySourceStat.currentDailyOutput}/{energySourceStat.maxDailyCapacity}/sol
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#292C2B]/75">Share of Outpost Power</span>
                  <span className="font-extrabold text-[#477C9B]">
                    {energySourceStat.contributionPct}%
                  </span>
                </div>
                {energySourceStat.maxHourlyDaytimeRate > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#292C2B]/75">Daytime Rate</span>
                    <span
                      className={`font-extrabold ${
                        energySourceStat.hourlyDaytimeRate > 0
                          ? 'text-[#396344]'
                          : 'text-[#B3693B]'
                      }`}
                    >
                      {energySourceStat.note}
                    </span>
                  </div>
                )}
              </div>
            )}

            {storageStats && (
              <div className="pt-1.5 border-t border-[#292C2B]/15 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-extrabold tabular-nums">
                  <span className="flex items-center gap-1">
                    <ResourceIcon type={storageStats.key} className="w-3.5 h-3.5 shrink-0" />
                    <span>{storageStats.label} Stored</span>
                  </span>
                  <span className={isStorageNearCap ? 'text-[#9A5D12]' : 'text-[#292C2B]'}>
                    {storageStats.current}/{storageStats.capacity}
                  </span>
                </div>
                <div className="h-2 w-full bg-[#F1D8A8] border border-[#292C2B] rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-200"
                    style={{
                      width: `${storageStats.pct}%`,
                      backgroundColor: needsRestorationFirst
                        ? '#8E867F'
                        : isStorageNearCap
                        ? '#E5A93B'
                        : '#477C9B',
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span className="text-[#292C2B]/70">
                    {needsRestorationFirst
                      ? `Restore to add +${storageStats.bonus} capacity`
                      : `Bonus: +${storageStats.bonus} max capacity`}
                  </span>
                  {isStorageNearCap && (
                    <span className="font-extrabold text-[#9A5D12]">
                      {isStorageFull ? 'Full!' : `${storageStats.pct}% Cap`}
                    </span>
                  )}
                </div>
                {id === 'energy_storage' && (
                  <div className="flex items-center justify-between text-[10px] font-bold text-[#292C2B]/75 tabular-nums">
                    <span>Outpost Generation</span>
                    <span className="font-extrabold text-[#396344]">
                      +{energyStats.totalCurrentDailyOutput}/{energyStats.totalMaxDailyCapacity}/sol
                      {energyStats.currentHourlyRate > 0 ? ' (+1/hr)' : ''}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Live Walking / Working Status Card */}
          {pendingHere && (
            <div className="p-2.5 rounded-xl bg-[#718B78]/15 border-2 border-[#718B78] text-xs space-y-1.5">
              <div className="font-extrabold text-[#292C2B] flex items-center gap-1.5">
                {pendingHere.phase === 'walking' ? (
                  <Footprints className="w-4 h-4 text-[#477C9B] shrink-0" aria-hidden="true" />
                ) : (
                  <Wrench className="w-4 h-4 text-[#396344] shrink-0" aria-hidden="true" />
                )}
                <span>
                  {pendingHere.phase === 'walking'
                    ? 'On the way...'
                    : `Working: ${pendingHere.label}`}
                </span>
              </div>
              {pendingHere.phase === 'working' && pendingHere.kind !== 'task' && (
                <div className="h-2 w-full bg-[#F1D8A8] border border-[#292C2B] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#718B78] transition-all duration-100"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          8,
                          ((pendingHere.workDurationSec - pendingHere.workRemainingSec) /
                            Math.max(0.1, pendingHere.workDurationSec)) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Growing Crop Progress Bar */}
          {id === 'greenhouse' && state.greenhouseCrop && activeCrop && !state.greenhouseCrop.isMature && (
            <div className="mars-panel-light p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-extrabold text-[#396344] tabular-nums">
                <span className="flex items-center gap-1.5">
                  <Sprout className="w-4 h-4" aria-hidden="true" />
                  {activeCrop.name}
                </span>
                <span>
                  Sol {Math.floor(state.greenhouseCrop.growthProgress)}/{state.greenhouseCrop.growthDaysRequired}
                </span>
              </div>
              <div className="h-2.5 w-full bg-[#F1D8A8] border-2 border-[#292C2B] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#718B78]"
                  style={{
                    width: `${Math.min(
                      100,
                      (state.greenhouseCrop.growthProgress /
                        state.greenhouseCrop.growthDaysRequired) *
                        100
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* SHELTER PAUSE NOTICE (with instant Go Outside toggle) */}
          {state.crew.inShelter && (
            <div className="p-2.5 rounded-xl bg-[#477C9B]/15 border-2 border-[#477C9B] text-xs space-y-2 text-[#292C2B]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-extrabold min-w-0">
                  <Shield className="w-4 h-4 text-[#477C9B] shrink-0" aria-hidden="true" />
                  <span className="truncate">Work Paused Inside Shelter</span>
                </div>
                {id !== 'radiation_shelter' && !isSleeping && !isWorkingAnywhere && (
                  <button
                    type="button"
                    onClick={onToggleShelter}
                    className="mars-btn px-2.5 py-1 rounded-lg bg-[#E9B77B] hover:bg-[#DFAB6D] text-[#292C2B] text-[11px] font-extrabold shrink-0 cursor-pointer"
                  >
                    Go Outside
                  </button>
                )}
              </div>
              {outdoorHazard && (
                <div className="text-[11px] font-bold text-[#B94F32] leading-snug">
                  Warning: {outdoorHazard.label} active — stepping outside risks Crew Health
                  {outdoorHazard.isRadiation ? ' & Radiation.' : '.'}
                </div>
              )}
            </div>
          )}

          {/* OUTDOOR HAZARD RISK WARNING WHEN WORKING OUTSIDE DURING EVENTS / HAZARDS */}
          {!state.crew.inShelter && outdoorHazard && id !== 'radiation_shelter' && (
            <div className="p-2.5 rounded-xl bg-[#FDE8E6] border-2 border-[#C94B43] text-xs flex items-start gap-2 text-[#8C2F1C]">
              <AlertTriangle className="w-4 h-4 text-[#C94B43] shrink-0 mt-0.5" aria-hidden="true" />
              <div className="min-w-0">
                <div className="font-extrabold leading-tight">
                  Outdoor Hazard Risk: {outdoorHazard.label}
                </div>
                <div className="text-[11px] font-semibold leading-snug mt-0.5">
                  {outdoorHazard.isRadiation
                    ? 'Outdoor tasks cost Crew Health & raise Radiation Exposure.'
                    : 'Outdoor tasks cost extra Crew Health while hazard is active.'}
                </div>
              </div>
            </div>
          )}

          {/* ONLY AVAILABLE ACTIONS */}
          <div className="space-y-2">
            {/* Radiation Shelter Toggle */}
            {canUseShelter && (
              <button
                type="button"
                onClick={onToggleShelter}
                className={`mars-btn w-full p-2.5 rounded-xl flex items-center gap-3 text-left cursor-pointer ${
                  state.crew.inShelter
                    ? 'bg-[#E9B77B] hover:bg-[#DFAB6D] text-[#292C2B]'
                    : 'bg-[#477C9B] hover:bg-[#3c6b86] text-[#FAF0DC]'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-[#FAF0DC] border-2 border-[#292C2B] flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5 text-[#292C2B]" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-extrabold leading-tight">
                    {state.crew.inShelter ? 'Go Outside' : 'Enter Shelter'}
                  </div>
                  <div className="text-[11px] font-semibold opacity-95">
                    {state.crew.inShelter
                      ? outdoorHazard
                        ? 'Hazard active — risks HP outdoors'
                        : 'Resume outpost tasks'
                      : 'Shields crew & GIL'}
                  </div>
                </div>
              </button>
            )}

            {/* Mature Harvest Button */}
            {canHarvestNow && activeCrop && (
              <button
                type="button"
                onClick={onHarvestCrop}
                disabled={pendingHere?.kind === 'harvest'}
                className="mars-btn w-full p-2.5 rounded-xl bg-[#718B78] text-[#FAF0DC] flex items-center gap-3 text-left cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-[#FAF0DC] border-2 border-[#292C2B] flex items-center justify-center shrink-0">
                  <ResourceIcon type="food" className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-extrabold leading-tight">
                    {pendingHere?.kind === 'harvest'
                      ? 'Walking to Harvest...'
                      : `Harvest +${activeCrop.harvestFoodYield} Food`}
                  </div>
                  <div className="text-[11px] font-bold opacity-95 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" aria-hidden="true" />
                    <span>1h</span>
                  </div>
                </div>
              </button>
            )}

            {/* Available Crop Planting Buttons */}
            {availableCrops.map((crop) => {
              const isQueuedCrop =
                pendingHere?.kind === 'plant' && pendingHere?.cropId === crop.id;
              return (
                <button
                  key={crop.id}
                  type="button"
                  onClick={() => onPlantCrop(crop.id)}
                  disabled={isQueuedCrop}
                  className="mars-btn w-full p-2.5 rounded-xl bg-[#718B78] text-[#FAF0DC] flex items-center gap-3 text-left cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-[#FAF0DC] border-2 border-[#292C2B] flex items-center justify-center shrink-0">
                    <Sprout className="w-5 h-5 text-[#396344]" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-extrabold leading-tight">
                      {isQueuedCrop ? `Walking to Plant ${crop.name}...` : `Plant ${crop.name}`}
                    </div>
                    <div className="text-[11px] font-bold opacity-95 flex flex-wrap items-center gap-2 mt-0.5 tabular-nums">
                      <span>+{crop.harvestFoodYield} Food</span>
                      <span>· {crop.growthDays} sols</span>
                      <span>· {crop.seedWaterCost}W {crop.seedEnergyCost}E</span>
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Tutorial Step 1 Mobile Inline Tip (when GIL bottom-left is hidden on narrow screens) */}
            {tutorialStep?.step === 1 && id === 'solar_panels' && needsRestorationFirst && (
              <div className="sm:hidden px-2.5 py-1.5 rounded-xl bg-[#477C9B]/15 border-2 border-[#477C9B] text-[11px] font-extrabold text-[#292C2B]">
                GIL Tip: Check costs below, then tap Fix!
              </div>
            )}

            {/* Compact Task Containers (Enlarged Resource Icons + Fix Button inside same box) */}
            {visibleTasks.map((task) => {
              const validation = validateTask(task, state);
              const canRun = validation.canExecute;
              const costs = getEffectiveTaskCosts(task, state);
              const isMajor = task.category === 'major';
              const isWalkingThis =
                pendingHere?.kind === 'task' && pendingHere?.taskId === task.id;
              const missingTime = state.hoursElapsed + costs.timeHours > TOTAL_DAY_HOURS;
              const missingStamina = state.crew.energy < costs.crewEnergyCost;

              return (
                <div
                  key={task.id}
                  className="mars-panel-light p-2.5 rounded-2xl flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-extrabold text-[#292C2B] leading-tight truncate">
                      {task.title}
                    </div>
                    <span
                      className={`text-[10px] font-extrabold shrink-0 ${
                        task.objectiveType === 'mandatory'
                          ? 'text-[#B94F32]'
                          : 'text-[#477C9B]'
                      }`}
                    >
                      {task.objectiveType === 'mandatory' ? 'Mandatory' : 'Optional'}
                    </span>
                  </div>

                  {!canRun && validation.reason && (
                    <div className="text-[11px] font-extrabold text-[#B94F32] leading-tight">
                      {validation.reason}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    {/* Slightly Enlarged Required Resource Icons Only */}
                    <div className="flex flex-wrap items-center gap-1.5 tabular-nums">
                      <span
                        title={`Time: ${costs.timeHours}h`}
                        aria-label={`Time ${costs.timeHours} hours`}
                        className={`px-1.5 py-1 rounded-lg border flex items-center gap-1 text-xs font-extrabold ${
                          missingTime
                            ? 'bg-[#FADFD8] border-[#B94F32] text-[#8C2F1C]'
                            : 'bg-[#FAF0DC] border-[#292C2B]/70 text-[#292C2B]'
                        }`}
                      >
                        <Clock className="w-5 h-5 text-[#477C9B] shrink-0" aria-hidden="true" />
                        <span>{costs.timeHours}h</span>
                      </span>

                      <span
                        title={`Stamina: -${costs.crewEnergyCost}%`}
                        aria-label={`Stamina minus ${costs.crewEnergyCost} percent`}
                        className={`px-1.5 py-1 rounded-lg border flex items-center gap-1 text-xs font-extrabold ${
                          missingStamina
                            ? 'bg-[#FADFD8] border-[#B94F32] text-[#8C2F1C]'
                            : 'bg-[#FAF0DC] border-[#292C2B]/70 text-[#292C2B]'
                        }`}
                      >
                        <CrewStaminaIcon className="w-5 h-5 shrink-0" />
                        <span>-{costs.crewEnergyCost}%</span>
                      </span>

                      {RESOURCE_ORDER.filter((rType) => (costs.resourceCost[rType] ?? 0) > 0).map(
                        (rType) => {
                          const need = costs.resourceCost[rType] ?? 0;
                          const has = state.resources[rType] ?? 0;
                          const short = has < need;
                          return (
                            <span
                              key={rType}
                              title={`${rType}: -${need}`}
                              aria-label={`${rType} minus ${need}`}
                              className={`px-1.5 py-1 rounded-lg border flex items-center gap-1 text-xs font-extrabold ${
                                short
                                  ? 'bg-[#FADFD8] border-[#B94F32] text-[#8C2F1C]'
                                  : 'bg-[#FAF0DC] border-[#292C2B]/70 text-[#292C2B]'
                              }`}
                            >
                              <ResourceIcon type={rType} className="w-5 h-5 shrink-0" />
                              <span>-{need}</span>
                            </span>
                          );
                        }
                      )}
                    </div>

                    {/* Fix Button inside the exact same container */}
                    <div className="relative shrink-0">
                      {tutorialStep?.highlight === 'fix_button' &&
                        id === 'solar_panels' &&
                        canRun &&
                        !isWalkingThis && (
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center animate-tutorial-bounce"
                          >
                            <span className="px-1.5 py-0.5 rounded-md bg-[#F4C552] border-2 border-[#292C2B] text-[10px] font-extrabold leading-none text-[#292C2B] whitespace-nowrap shadow-[0_2px_0_#292C2B]">
                              Tap Fix!
                            </span>
                            <ArrowDown
                              className="w-3.5 h-3.5 -mt-0.5 text-[#F4C552] drop-shadow-[0_1px_0_#292C2B]"
                              strokeWidth={3}
                            />
                          </div>
                        )}
                      <button
                        type="button"
                        onClick={() => onExecuteTask(task.id)}
                        disabled={!canRun || isWalkingThis || isWorkingAnywhere}
                        className={`mars-btn px-3.5 py-2 min-h-[42px] md:min-h-0 rounded-xl text-xs font-extrabold shrink-0 flex items-center gap-1 transition-all ${
                          tutorialStep?.highlight === 'fix_button' && id === 'solar_panels' && canRun
                            ? 'ring-4 ring-[#F4C552] animate-tutorial-ring'
                            : ''
                        } ${
                          !canRun || isWalkingThis || isWorkingAnywhere
                            ? 'bg-[#D7CEBC] text-[#292C2B]/55 cursor-not-allowed'
                            : isMajor
                            ? 'bg-[#B94F32] hover:bg-[#A64429] text-[#FAF0DC] cursor-pointer'
                            : 'bg-[#E9B77B] hover:bg-[#DFAB6D] text-[#292C2B] cursor-pointer'
                        }`}
                      >
                        {task.dustCleared ? (
                          <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        ) : (
                          <Wrench className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        )}
                        <span>
                          {isWalkingThis ? '...' : task.dustCleared ? 'Clean' : 'Fix'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Sol 1 Locked State or Empty State when nothing can be clicked right now */}
            {isLocked ? (
              <div className="mars-panel-light p-3 rounded-2xl border-2 border-[#292C2B]/40 space-y-1.5 bg-[#EFE3CC]">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#292C2B]">
                  <Lock className="w-4 h-4 text-[#B94F32] shrink-0" aria-hidden="true" />
                  <span>Day 1 Progression Lock</span>
                </div>
                <p className="text-[11px] font-bold text-[#292C2B]/80 leading-snug">
                  {unlockStatus.reason}
                </p>
              </div>
            ) : (
              !hasAnyAction && (
                <div className="mars-panel-light p-3 text-center">
                  {pendingReason ? (
                    <div className="text-xs font-extrabold text-[#B94F32]">
                      {pendingReason}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-1.5 text-xs font-extrabold text-[#396344]">
                      <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>All Good</span>
                    </div>
                  )}
                </div>
              )
            )}
          </div>

          {/* Description Button -> Centered Modal with NASA Photo */}
          <button
            type="button"
            onClick={() =>
              onOpenDescription({
                title: def.name,
                description: `${def.description} ${def.scienceNote}`,
                imageUrl: def.nasaImageUrl,
                credit: def.nasaImageCredit,
              })
            }
            className="mars-btn w-full py-2 min-h-[40px] md:min-h-0 px-3 bg-[#F1D8A8] hover:bg-[#E9B77B]/75 text-[#292C2B] text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#477C9B]" aria-hidden="true" />
            <span>Description</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
