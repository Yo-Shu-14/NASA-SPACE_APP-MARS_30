import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BedDouble,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  Compass,
  Cpu,
  Droplets,
  FlaskConical,
  HeartPulse,
  Loader2,
  Lock,
  MapPin,
  Moon,
  Play,
  Shield,
  Sparkles,
  Sprout,
  Star,
  Sun,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import {
  BATTERY_STORAGE_CAPACITY_BY_DIFFICULTY,
  getFacilityDailyProduction,
} from '../../data/balance';
import { CREW_SPECIALISTS } from '../../data/activities';
import { BUILDING_DEFINITIONS, BUILDING_LIST } from '../../data/buildings';
import { CROP_MAP } from '../../data/crops';
import { TOTAL_DAY_HOURS } from '../../data/mission';
import { RESOURCE_CONFIGS, RESOURCE_ORDER } from '../../data/resources';
import { TASK_DEFINITIONS } from '../../data/tasks';
import {
  getActivityCrewAvailability,
  validateDailyActivity,
} from '../../systems/activities';
import { getBuildingUnlockStatus } from '../../systems/buildings';
import {
  getActiveOutdoorHazardSummary,
  isEventOfficiallyActive,
  isMajorEventCutsceneActive,
} from '../../systems/events';
import {
  calculateDailyRates,
  calculateEnergyGenerationStats,
} from '../../systems/resources';
import { validateTask } from '../../systems/tasks';
import { ActivityCategory, DailyActivityInstance } from '../../types/activity';
import { BuildingCategory, BuildingId } from '../../types/building';
import { DifficultyLevel, GameState } from '../../types/game';
import { BuildingIcon } from '../icons/GameIcons';

interface MajorTasksSidebarProps {
  state: GameState;
  minimized?: boolean;
  onLocateBuilding: (buildingId: BuildingId) => void;
  onRestCrew?: () => void;
  onToggleShelter?: () => void;
  onEndDay?: () => void;
  onStartActivity?: (activityId: string) => void;
  onToggleActivityPriority?: (activityId: string) => void;
  onIgnoreActivity?: (activityId: string) => void;
  onRestoreActivity?: (activityId: string) => void;
  onClose: () => void;
}

const MAJOR_TASK_PRIORITY: string[] = [
  'restore_solar_panels',
  'restore_oxygen_generator',
  'restore_water_recycling',
  'restore_greenhouse',
  'restore_radiation_shelter',
  'restore_energy_storage',
  'restore_oxygen_storage',
  'restore_water_storage',
  'restore_food_storage',
  'restore_maintenance_facility',
];

export interface AvailableTaskItem {
  id: string;
  taskName: string;
  buildingId: BuildingId;
  buildingName: string;
  hours?: number;
  kind: 'major' | 'minor' | 'special' | 'ongoing';
  objectiveType?: 'mandatory' | 'optional';
}

export function getAvailableTaskItems(state: GameState): AvailableTaskItem[] {
  const items: AvailableTaskItem[] = [];

  // Urgent Shelter Action if Radiation Storm is actively occurring and shelter is usable
  if (
    isEventOfficiallyActive(state.activeEvent) &&
    state.activeEvent?.definition.radiationLevel &&
    !state.crew.inShelter &&
    state.buildings.radiation_shelter.restoredOnce &&
    state.buildings.radiation_shelter.status !== 'inactive'
  ) {
    items.push({
      id: 'special_shelter',
      taskName: 'Hide Crew in Radiation Storm Shelter!',
      buildingId: 'radiation_shelter',
      buildingName: 'Radiation Storm Shelter',
      kind: 'special',
    });
  }

  // Ripe Greenhouse Harvest
  if (
    !state.crew.inShelter &&
    state.greenhouseCrop?.isMature &&
    state.hoursElapsed + 1 <= TOTAL_DAY_HOURS &&
    state.pendingAction?.kind !== 'harvest'
  ) {
    items.push({
      id: 'special_harvest',
      taskName: 'Harvest Food!',
      buildingId: 'greenhouse',
      buildingName: 'Greenhouse',
      hours: 1,
      kind: 'special',
    });
  }

  // Pending / Ongoing crew task (walking to building or actively working)
  if (state.pendingAction) {
    const act = state.pendingAction;
    items.push({
      id: `pending_${act.id}`,
      taskName: act.phase === 'walking' ? `Walking: ${act.label}` : `Working: ${act.label}`,
      buildingId: act.buildingId,
      buildingName: BUILDING_DEFINITIONS[act.buildingId].shortName,
      kind: 'ongoing',
    });
  } else if (state.ongoingTask) {
    const t = TASK_DEFINITIONS.find((x) => x.id === state.ongoingTask?.taskId);
    if (t) {
      items.push({
        id: `ongoing_${t.id}`,
        taskName: t.title,
        buildingId: t.buildingId,
        buildingName: BUILDING_DEFINITIONS[t.buildingId].shortName,
        hours: t.timeHours,
        kind: 'ongoing',
      });
    }
  }

  const activeTaskId = state.pendingAction?.taskId ?? state.ongoingTask?.taskId;

  // Available Major Tasks (strictly executable right now)
  for (const id of MAJOR_TASK_PRIORITY) {
    const task = TASK_DEFINITIONS.find((t) => t.id === id);
    if (!task) continue;
    if (activeTaskId === task.id) continue;
    if (validateTask(task, state).canExecute) {
      const bState = state.buildings[task.buildingId];
      const def = BUILDING_DEFINITIONS[task.buildingId];
      items.push({
        id: task.id,
        taskName: bState.restoredOnce ? `Repair ${def.shortName}` : task.title,
        buildingId: task.buildingId,
        buildingName: def.shortName,
        hours: task.timeHours,
        kind: 'major',
        objectiveType: task.objectiveType,
      });
    }
  }

  // Available Minor Tasks (strictly executable right now)
  for (const task of TASK_DEFINITIONS) {
    if (task.category !== 'minor') continue;
    if (activeTaskId === task.id) continue;
    if (validateTask(task, state).canExecute) {
      const def = BUILDING_DEFINITIONS[task.buildingId];
      items.push({
        id: task.id,
        taskName: task.title,
        buildingId: task.buildingId,
        buildingName: def.shortName,
        hours: task.timeHours,
        kind: 'minor',
        objectiveType: task.objectiveType,
      });
    }
  }

  return items;
}

function getSystemShortPurpose(id: BuildingId, difficulty: DifficultyLevel): string {
  switch (id) {
    case 'solar_panels':
      return `+${getFacilityDailyProduction('solar_panels', difficulty).energy ?? 16} Energy/sol`;
    case 'energy_storage':
      return `+${BATTERY_STORAGE_CAPACITY_BY_DIFFICULTY[difficulty]} Max Energy`;
    case 'oxygen_generator':
      return `+${getFacilityDailyProduction('oxygen_generator', difficulty).oxygen ?? 12} Oxygen/sol`;
    case 'oxygen_storage':
      return '+60 Max Oxygen';
    case 'water_recycling':
      return `+${getFacilityDailyProduction('water_recycling', difficulty).water ?? 12} Water/sol`;
    case 'water_storage':
      return '+60 Max Water';
    case 'greenhouse':
      return `+${getFacilityDailyProduction('greenhouse', difficulty).food ?? 4} Food/sol`;
    case 'food_storage':
      return '+60 Max Food';
    case 'main_habitat':
      return 'Crew Home Base';
    case 'radiation_shelter':
      return 'Storm Bunker';
    case 'maintenance_facility':
      return 'Stronger Repairs';
  }
}

const ACTIVITY_CATEGORY_META: Record<
  ActivityCategory,
  { label: string; chipClass: string }
> = {
  maintenance: {
    label: 'Maintenance',
    chipClass: 'bg-[#F4C552]/40 text-[#8C4D32] border-[#B3693B]/40',
  },
  research: {
    label: 'Research',
    chipClass: 'bg-[#477C9B]/15 text-[#2E5D78] border-[#477C9B]/40',
  },
  exploration: {
    label: 'Exploration',
    chipClass: 'bg-[#718B78]/20 text-[#2E5439] border-[#718B78]/45',
  },
  crew: {
    label: 'Crew Care',
    chipClass: 'bg-[#E9B77B]/45 text-[#7A3524] border-[#B94F32]/35',
  },
};

function renderActivityCategoryIcon(cat: ActivityCategory) {
  switch (cat) {
    case 'maintenance':
      return <Wrench className="w-3 h-3 shrink-0" aria-hidden="true" />;
    case 'research':
      return <FlaskConical className="w-3 h-3 shrink-0" aria-hidden="true" />;
    case 'exploration':
      return <Compass className="w-3 h-3 shrink-0" aria-hidden="true" />;
    case 'crew':
    default:
      return <HeartPulse className="w-3 h-3 shrink-0" aria-hidden="true" />;
  }
}

export function MajorTasksSidebar({
  state,
  minimized = false,
  onLocateBuilding,
  onRestCrew,
  onToggleShelter,
  onEndDay,
  onStartActivity,
  onToggleActivityPriority,
  onIgnoreActivity,
  onRestoreActivity,
  onClose,
}: MajorTasksSidebarProps) {
  const [activeTab, setActiveTab] = useState<'tasks' | 'systems'>('tasks');
  const [showIgnoredActivities, setShowIgnoredActivities] = useState(false);
  const availableItems = getAvailableTaskItems(state);
  const allDailyActivities = state.dailyActivities ?? [];
  const availableActivities = allDailyActivities
    .filter((a) => a.status === 'available')
    .sort((a, b) => Number(b.prioritized) - Number(a.prioritized));
  const completedActivities = allDailyActivities.filter((a) => a.status === 'completed');
  const ignoredActivities = allDailyActivities.filter((a) => a.status === 'ignored');
  const energyStats = calculateEnergyGenerationStats({
    buildings: state.buildings,
    currentResources: state.resources,
    greenhouseCrop: state.greenhouseCrop,
    activeEvent: state.activeEvent,
    modifiers: state.modifiers,
    hoursElapsed: state.hoursElapsed,
    difficulty: state.difficulty,
  });
  const dailyRates = calculateDailyRates({
    buildings: state.buildings,
    currentResources: state.resources,
    greenhouseCrop: state.greenhouseCrop,
    activeEvent: state.activeEvent,
    modifiers: state.modifiers,
    difficulty: state.difficulty,
  });
  const outdoorHazard = getActiveOutdoorHazardSummary(state);

  const isBusy =
    state.screen !== 'PLAYING' ||
    state.sleepPhase !== 'idle' ||
    state.sleepingRemaining > 0 ||
    state.pendingAction?.phase === 'working' ||
    isMajorEventCutsceneActive(state);
  const canRest =
    !state.crew.inShelter &&
    TOTAL_DAY_HOURS - state.hoursElapsed >= 2 &&
    state.crew.energy < 98;

  // Monitoring computations for calm/light sols
  const weakestRestored = BUILDING_LIST.map((def) => ({
    def,
    bState: state.buildings[def.id],
  }))
    .filter(
      ({ bState }) =>
        bState.restoredOnce && bState.status !== 'inactive'
    )
    .sort((a, b) => a.bState.condition - b.bState.condition)[0];

  const nextOffline = BUILDING_LIST.map((def) => ({
    def,
    bState: state.buildings[def.id],
    unlock: getBuildingUnlockStatus(def.id, state),
  }))
    .filter(({ bState }) => !bState.restoredOnce || bState.status === 'inactive')
    .sort((a, b) => Number(b.unlock.unlocked) - Number(a.unlock.unlocked))[0];

  const focusBuildingMonitor =
    weakestRestored && weakestRestored.bState.condition < 96
      ? {
          id: weakestRestored.def.id,
          name: weakestRestored.def.shortName,
          detail: `${weakestRestored.bState.condition}% Condition`,
          tone:
            weakestRestored.bState.condition < 65 ? 'text-[#C94B43]' : 'text-[#B3693B]',
        }
      : nextOffline
      ? {
          id: nextOffline.def.id,
          name: nextOffline.def.shortName,
          detail: nextOffline.unlock.unlocked
            ? 'Offline · Ready to restore'
            : `Locked · ${nextOffline.unlock.shortReason ?? 'Restore core systems'}`,
          tone: nextOffline.unlock.unlocked ? 'text-[#B94F32]' : 'text-[#5E5955]',
        }
      : weakestRestored
      ? {
          id: weakestRestored.def.id,
          name: weakestRestored.def.shortName,
          detail: `${weakestRestored.bState.condition}% Condition (Nominal)`,
          tone: 'text-[#396344]',
        }
      : null;

  const greenhouseState = state.buildings.greenhouse;
  const activeCropDef = state.greenhouseCrop
    ? CROP_MAP[state.greenhouseCrop.cropId]
    : null;
  const cropStatusLabel =
    !greenhouseState.restoredOnce || greenhouseState.status === 'inactive'
      ? 'Offline'
      : state.greenhouseCrop?.isMature
      ? 'Ripe! Harvest now'
      : state.greenhouseCrop && activeCropDef
      ? `${activeCropDef.name} (${Math.round(state.greenhouseCrop.growthProgress * 10) / 10}/${state.greenhouseCrop.growthDaysRequired}d)`
      : 'Empty · Plant seeds';

  const lowestReserve = RESOURCE_ORDER.map((res) => {
    const current = Math.round(state.resources[res]);
    const cap = Math.max(1, state.capacities[res]);
    const net = dailyRates.net[res].net;
    return {
      res,
      label: RESOURCE_CONFIGS[res].label,
      current,
      cap,
      net,
      ratio: current / cap,
    };
  }).sort((a, b) => {
    const aAlert = a.net < 0 || a.current < 25 ? 0 : 1;
    const bAlert = b.net < 0 || b.current < 25 ? 0 : 1;
    if (aAlert !== bAlert) return aAlert - bAlert;
    return a.ratio - b.ratio;
  })[0];

  const horizonText =
    state.day < 9
      ? `Sol 9 · Big Solar Storm (${9 - state.day} sol${9 - state.day === 1 ? '' : 's'} left)`
      : state.day < 20
      ? `Sol 20 · Fast Sun Sparks (${20 - state.day} sol${20 - state.day === 1 ? '' : 's'} left)`
      : state.day < 29
      ? `Sol 29 · Giant Dust Storm (${29 - state.day} sol${29 - state.day === 1 ? '' : 's'} left)`
      : state.day === 29
      ? 'Sol 30 · Final Assessment Tomorrow'
      : 'Sol 30 · Final Assessment Tonight';

  const renderCategoryIcon = (cat: BuildingCategory) => {
    if (cat === 'energy') return <Zap className="w-3.5 h-3.5 text-[#B94F32]" aria-hidden="true" />;
    if (cat === 'life_support')
      return <Droplets className="w-3.5 h-3.5 text-[#477C9B]" aria-hidden="true" />;
    if (cat === 'food') return <Sprout className="w-3.5 h-3.5 text-[#396344]" aria-hidden="true" />;
    return <Shield className="w-3.5 h-3.5 text-[#292C2B]" aria-hidden="true" />;
  };

  const systemSections: Array<{
    key: string;
    label: string;
    color: string;
    category: BuildingCategory;
    buildings: typeof BUILDING_LIST;
  }> = [
    {
      key: 'energy',
      label: 'Power',
      color: '#B94F32',
      category: 'energy',
      buildings: BUILDING_LIST.filter((b) => b.category === 'energy'),
    },
    {
      key: 'life_support',
      label: 'Air & Water',
      color: '#477C9B',
      category: 'life_support',
      buildings: BUILDING_LIST.filter((b) => b.category === 'life_support'),
    },
    {
      key: 'food',
      label: 'Food',
      color: '#396344',
      category: 'food',
      buildings: BUILDING_LIST.filter((b) => b.category === 'food'),
    },
    {
      key: 'safety',
      label: 'Crew & Safety',
      color: '#292C2B',
      category: 'safety',
      buildings: BUILDING_LIST.filter(
        (b) => b.category === 'habitat' || b.category === 'safety'
      ),
    },
  ];

  const renderDailyActivitiesSection = () => {
    if (
      availableActivities.length === 0 &&
      completedActivities.length === 0 &&
      ignoredActivities.length === 0
    ) {
      return null;
    }

    const renderCostChips = (act: DailyActivityInstance) => {
      const parts: string[] = [];
      if (act.crewEnergyCost > 0) parts.push(`-${act.crewEnergyCost} Stam`);
      if (act.resourceCost.energy) parts.push(`-${act.resourceCost.energy} En`);
      if (act.resourceCost.water) parts.push(`-${act.resourceCost.water} H2O`);
      if (act.resourceCost.oxygen) parts.push(`-${act.resourceCost.oxygen} O2`);
      if (act.resourceCost.food) parts.push(`-${act.resourceCost.food} Food`);
      return parts.join(' · ');
    };

    return (
      <section className="space-y-1.5 pt-0.5" aria-label="Optional Daily Colony Ops">
        <div className="flex items-center justify-between gap-1 px-0.5">
          <span className="text-[11px] font-extrabold text-[#292C2B] flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-[#477C9B]" aria-hidden="true" />
            <span>Daily Colony Ops</span>
          </span>
          <span className="text-[10px] font-extrabold text-[#477C9B]">
            Optional ({availableActivities.length})
          </span>
        </div>

        {availableActivities.map((act) => {
          const catMeta = ACTIVITY_CATEGORY_META[act.category];
          const specialist = CREW_SPECIALISTS[act.assignedCrew];
          const validation = validateDailyActivity(act, state);
          const crewAvail = getActivityCrewAvailability(act, state);
          const costSummary = renderCostChips(act);
          const isRunningThis =
            state.pendingAction?.kind === 'activity' &&
            state.pendingAction.activityId === act.id;

          return (
            <div
              key={act.id}
              className={`p-2 rounded-xl border-2 transition-all space-y-1.5 ${
                act.prioritized
                  ? 'bg-[#FFF7E2] border-[#B94F32] shadow-[0_2px_0_#292C2B]'
                  : 'bg-[#FAF0DC] border-[#292C2B]'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1 min-w-0">
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-wide shrink-0 ${catMeta.chipClass}`}
                  >
                    {renderActivityCategoryIcon(act.category)}
                    <span>{catMeta.label}</span>
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-mono-tabular font-bold text-[#292C2B]/70 shrink-0">
                    <Clock className="w-2.5 h-2.5" aria-hidden="true" />
                    {act.durationHours}h
                  </span>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  {onToggleActivityPriority && (
                    <button
                      type="button"
                      onClick={() => onToggleActivityPriority(act.id)}
                      aria-label={act.prioritized ? 'Unprioritize activity' : 'Prioritize activity'}
                      title={act.prioritized ? 'Prioritized' : 'Prioritize'}
                      className={`w-6 h-6 rounded-md flex items-center justify-center cursor-pointer transition-colors ${
                        act.prioritized
                          ? 'bg-[#F4C552] text-[#292C2B]'
                          : 'text-[#292C2B]/45 hover:text-[#292C2B] hover:bg-[#E9B77B]/50'
                      }`}
                    >
                      <Star
                        className="w-3.5 h-3.5"
                        fill={act.prioritized ? 'currentColor' : 'none'}
                        aria-hidden="true"
                      />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onLocateBuilding(act.buildingId)}
                    aria-label={`Locate ${BUILDING_DEFINITIONS[act.buildingId].shortName}`}
                    title={`Focus ${BUILDING_DEFINITIONS[act.buildingId].shortName}`}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-[#477C9B] hover:bg-[#477C9B]/15 cursor-pointer transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  {onIgnoreActivity && (
                    <button
                      type="button"
                      onClick={() => onIgnoreActivity(act.id)}
                      aria-label="Skip activity for today"
                      title="Ignore for today"
                      className="w-6 h-6 rounded-md flex items-center justify-center text-[#292C2B]/45 hover:text-[#B94F32] hover:bg-[#FDE8E6] cursor-pointer transition-colors"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs font-extrabold text-[#292C2B] leading-snug">
                  {act.title}
                </div>
                <p className="text-[10px] font-semibold text-[#292C2B]/75 leading-snug mt-0.5">
                  {act.relevanceReason}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1 text-[9.5px] font-extrabold">
                <span className="px-1.5 py-0.5 rounded bg-[#EFE3CC] border border-[#292C2B]/20 text-[#292C2B]">
                  {specialist.name} · {act.skillLabel}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-[#DDE8D6] border border-[#396344]/30 text-[#2E5439]">
                  {act.rewardSummary}
                </span>
                {costSummary && (
                  <span className="px-1.5 py-0.5 rounded bg-[#F1D8A8]/70 text-[#292C2B]/80">
                    {costSummary}
                  </span>
                )}
                {!act.isOutdoor && (
                  <span className="px-1.5 py-0.5 rounded bg-[#477C9B]/15 text-[#2E5D78]">
                    Indoor Safe
                  </span>
                )}
                {act.isOutdoor && outdoorHazard && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#FDE8E6] text-[#C94B43]">
                    <AlertTriangle className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                    Outdoor Risk
                  </span>
                )}
              </div>

              {onStartActivity && (
                <button
                  type="button"
                  disabled={!validation.canExecute || isBusy || isRunningThis}
                  onClick={() => onStartActivity(act.id)}
                  className={`mars-btn w-full min-h-[34px] py-1.5 px-2.5 text-[11px] font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed ${
                    act.isOutdoor && outdoorHazard && validation.canExecute
                      ? 'bg-[#D77B4A] hover:bg-[#c56c3d] text-[#FAF0DC]'
                      : 'bg-[#477C9B] hover:bg-[#3a6984] text-[#FAF0DC]'
                  }`}
                >
                  {isRunningThis ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
                      <span>In Progress...</span>
                    </>
                  ) : validation.canExecute ? (
                    <>
                      <Play className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span>
                        {act.isOutdoor && outdoorHazard
                          ? `Accept (${crewAvail.statusLabel} · Risk)`
                          : `Accept (${crewAvail.statusLabel})`}
                      </span>
                    </>
                  ) : (
                    <span>{validation.reason ?? crewAvail.statusLabel}</span>
                  )}
                </button>
              )}
            </div>
          );
        })}

        {completedActivities.map((act) => (
          <div
            key={act.id}
            className="px-2 py-1.5 rounded-lg bg-[#DDE8D6]/80 border border-[#396344]/35 flex items-center justify-between gap-1.5 text-[10px] font-extrabold text-[#2E5439]"
          >
            <span className="flex items-center gap-1 truncate">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{act.title}</span>
            </span>
            <span className="shrink-0">Done</span>
          </div>
        ))}

        {ignoredActivities.length > 0 && (
          <div className="pt-0.5">
            <button
              type="button"
              onClick={() => setShowIgnoredActivities((prev) => !prev)}
              className="text-[10px] font-bold text-[#292C2B]/65 hover:text-[#292C2B] underline cursor-pointer px-0.5"
            >
              {showIgnoredActivities
                ? 'Hide skipped ops'
                : `Skipped today (${ignoredActivities.length}) · Show`}
            </button>
            {showIgnoredActivities && onRestoreActivity && (
              <div className="mt-1 space-y-1">
                {ignoredActivities.map((act) => (
                  <div
                    key={act.id}
                    className="px-2 py-1 rounded-lg bg-[#EFE3CC]/75 border border-[#292C2B]/20 flex items-center justify-between gap-2 text-[10px]"
                  >
                    <span className="font-bold text-[#292C2B]/75 truncate">{act.title}</span>
                    <button
                      type="button"
                      onClick={() => onRestoreActivity(act.id)}
                      className="font-extrabold text-[#477C9B] hover:underline shrink-0 cursor-pointer"
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    );
  };

  return (
    <aside
      aria-label="Outpost Tasks & Systems Drawer"
      className="relative pointer-events-none flex flex-col w-full h-full max-h-full min-h-0"
    >
      {/* Minimized Tucked Tab anchored flush to the left side during task progress */}
      <div
        className={`absolute left-0 top-3 mars-panel p-2 bg-[#FAF0DC] rounded-2xl flex flex-col items-center gap-1.5 w-12 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-none ${
          minimized ? 'opacity-95 translate-x-0' : 'opacity-0 -translate-x-2'
        }`}
        aria-hidden={!minimized}
      >
        <ClipboardList className="w-5 h-5 text-[#B94F32]" aria-hidden="true" />
        <span className="font-mono-tabular text-[11px] font-extrabold text-[#292C2B]">
          {availableItems.length + availableActivities.length}
        </span>
      </div>

      <div
        className={`mars-panel flex flex-col w-full h-full max-h-full overflow-hidden rounded-2xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          minimized
            ? 'opacity-0 -translate-x-2 pointer-events-none'
            : 'opacity-100 translate-x-0 pointer-events-auto'
        }`}
      >
      {/* Closable Header with Icon Tabs */}
      <div className="px-2.5 py-2 bg-[#FAF0DC] border-b-2 border-[#292C2B] flex items-center gap-1.5 shrink-0">
        <div className="flex-1 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            className={`min-h-[40px] md:min-h-0 py-1.5 px-2 rounded-xl border-2 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              activeTab === 'tasks'
                ? 'bg-[#B94F32] text-[#FAF0DC] border-[#292C2B]'
                : 'bg-[#F1D8A8]/75 text-[#292C2B] border-[#292C2B]/40 hover:bg-[#F1D8A8]'
            }`}
          >
            <ClipboardList className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Do Now</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('systems')}
            className={`min-h-[40px] md:min-h-0 py-1.5 px-2 rounded-xl border-2 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              activeTab === 'systems'
                ? 'bg-[#477C9B] text-[#FAF0DC] border-[#292C2B]'
                : 'bg-[#F1D8A8]/75 text-[#292C2B] border-[#292C2B]/40 hover:bg-[#F1D8A8]'
            }`}
          >
            <Cpu className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Systems</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          className="w-11 h-11 md:w-10 md:h-10 rounded-xl hover:bg-[#E9B77B]/60 active:scale-95 transition-all flex items-center justify-center cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Body */}
      {activeTab === 'tasks' ? (
        <div className="p-2.5 overflow-y-auto overscroll-contain space-y-2 flex-1 min-h-0">
          {availableItems.length === 0 ? (
            <div className="space-y-2">
              {renderDailyActivitiesSection()}

              <div className="mars-panel-light p-3 text-center space-y-1">
                {state.crew.inShelter ? (
                  <>
                    <Shield className="w-7 h-7 text-[#477C9B] mx-auto" aria-hidden="true" />
                    <div className="text-xs font-extrabold text-[#292C2B]">
                      Crew Safe in Shelter
                    </div>
                    <p className="text-[11px] font-semibold text-[#292C2B]/75 leading-snug">
                      {outdoorHazard
                        ? `${outdoorHazard.label} is outside. Stay safe, step outside at your own risk, or end the sol.`
                        : 'Crew is sheltered. Step outside to check systems or end the sol.'}
                    </p>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-7 h-7 text-[#396344] mx-auto" aria-hidden="true" />
                    <div className="text-xs font-extrabold text-[#292C2B]">
                      {state.crew.energy < 20
                        ? 'Crew Needs Rest'
                        : state.hoursElapsed >= 22
                        ? 'Ready to End Sol'
                        : availableActivities.length > 0
                        ? 'Repairs Clear · Optional Ops Ready'
                        : 'Quiet Sol · Outpost Monitor'}
                    </div>
                    <p className="text-[11px] font-semibold text-[#292C2B]/75 leading-snug">
                      {state.crew.energy < 20
                        ? 'Stamina is low. Rest the crew or end the sol to sleep.'
                        : state.hoursElapsed >= 22
                        ? 'Night cycle reached. End the sol to log supplies and start fresh.'
                        : availableActivities.length > 0
                        ? 'Urgent repairs are clear. Accept an optional Daily Colony Op above or skip and rest.'
                        : 'All urgent systems are steady today. Monitor reserves or end the sol whenever ready.'}
                    </p>
                  </>
                )}
              </div>

              {/* Outpost Monitoring Card */}
              <div className="mars-panel-light p-2.5 rounded-xl space-y-2 border-2 border-[#292C2B]/25">
                <div className="flex items-center justify-between gap-1.5 text-[11px] font-extrabold text-[#292C2B]">
                  <span className="flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5 text-[#477C9B]" aria-hidden="true" />
                    <span>Outpost Status</span>
                  </span>
                  <span className="font-mono-tabular text-[10px] text-[#292C2B]/70">
                    Sol {state.day}/30
                  </span>
                </div>

                {/* Crew Readiness */}
                <div className="p-2 rounded-lg bg-[#FAF0DC] border border-[#292C2B]/20 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-extrabold text-[#292C2B]/75">
                    <span>Crew Readiness</span>
                    <span className="font-mono-tabular">
                      HP {state.crew.condition}% · Stam {state.crew.energy}% · Rad {state.crew.radiationExposure}%
                    </span>
                  </div>
                  {outdoorHazard && !state.crew.inShelter && (
                    <div className="flex items-center gap-1 text-[10px] font-extrabold text-[#C94B43]">
                      <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{outdoorHazard.label}: outdoor work risks HP</span>
                    </div>
                  )}
                </div>

                {/* Weakest / Next Facility (Click to Locate) */}
                {focusBuildingMonitor && (
                  <button
                    type="button"
                    onClick={() => onLocateBuilding(focusBuildingMonitor.id)}
                    className="w-full text-left p-2 rounded-lg bg-[#FAF0DC] hover:bg-[#FFF8EB] border border-[#292C2B]/30 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-[#292C2B]/65">
                        Facility Watch
                      </div>
                      <div className="text-[11px] font-extrabold text-[#292C2B] truncate">
                        {focusBuildingMonitor.name}
                      </div>
                      <div className={`text-[10px] font-extrabold truncate ${focusBuildingMonitor.tone}`}>
                        {focusBuildingMonitor.detail}
                      </div>
                    </div>
                    <MapPin className="w-3.5 h-3.5 text-[#477C9B] shrink-0" aria-hidden="true" />
                  </button>
                )}

                {/* Solar Dust & Greenhouse Crop Watch */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onLocateBuilding('solar_panels')}
                    className="text-left p-2 rounded-lg bg-[#FAF0DC] hover:bg-[#FFF8EB] border border-[#292C2B]/25 cursor-pointer transition-colors min-w-0"
                  >
                    <div className="flex items-center gap-1 text-[10px] font-extrabold text-[#B94F32]">
                      <Sun className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span>Solar</span>
                    </div>
                    <div className="text-[10px] font-bold text-[#292C2B] truncate mt-0.5">
                      Dust {state.buildings.solar_panels.dustLevel}%
                    </div>
                    <div
                      className={`text-[10px] font-extrabold font-mono-tabular truncate ${
                        energyStats.netDailyEnergy >= 0 ? 'text-[#396344]' : 'text-[#C94B43]'
                      }`}
                    >
                      Net {energyStats.netDailyEnergy >= 0 ? '+' : ''}
                      {energyStats.netDailyEnergy}/sol
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onLocateBuilding('greenhouse')}
                    className="text-left p-2 rounded-lg bg-[#FAF0DC] hover:bg-[#FFF8EB] border border-[#292C2B]/25 cursor-pointer transition-colors min-w-0"
                  >
                    <div className="flex items-center gap-1 text-[10px] font-extrabold text-[#396344]">
                      <Sprout className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span>Crops</span>
                    </div>
                    <div className="text-[10px] font-bold text-[#292C2B] leading-tight mt-0.5 line-clamp-2">
                      {cropStatusLabel}
                    </div>
                  </button>
                </div>

                {/* Lowest Reserve & Upcoming Horizon */}
                <div className="p-2 rounded-lg bg-[#FAF0DC] border border-[#292C2B]/20 space-y-1 text-[10px]">
                  {lowestReserve && (
                    <div className="flex items-center justify-between gap-1 font-extrabold">
                      <span className="text-[#292C2B]/70">Watch Reserve:</span>
                      <span
                        className={`font-mono-tabular ${
                          lowestReserve.net < 0 || lowestReserve.current < 25
                            ? 'text-[#C94B43]'
                            : 'text-[#396344]'
                        }`}
                      >
                        {lowestReserve.label} {lowestReserve.current}/{lowestReserve.cap} (
                        {lowestReserve.net >= 0 ? `+${lowestReserve.net}` : lowestReserve.net}/sol)
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 font-bold text-[#477C9B]">
                    <CalendarClock className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{horizonText}</span>
                  </div>
                </div>

                {/* Quick Crew & Sol Actions */}
                <div className="space-y-1.5 pt-0.5">
                  {state.crew.inShelter && onToggleShelter && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={onToggleShelter}
                      className={`mars-btn w-full min-h-[40px] py-2 px-2.5 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                        outdoorHazard
                          ? 'bg-[#C94B43] hover:bg-[#b23d35] text-[#FAF0DC]'
                          : 'bg-[#718B78] hover:bg-[#5f7866] text-[#FAF0DC]'
                      }`}
                    >
                      <Shield className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {outdoorHazard ? 'Go Outside (Hazard Risk)' : 'Go Outside'}
                      </span>
                    </button>
                  )}

                  {canRest && onRestCrew && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={onRestCrew}
                      className="mars-btn w-full min-h-[40px] py-2 px-2.5 bg-[#477C9B] hover:bg-[#3a6984] text-[#FAF0DC] text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <BedDouble className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>Rest Crew (+Stamina, 2h)</span>
                    </button>
                  )}

                  {onEndDay && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={onEndDay}
                      className="mars-btn w-full min-h-[40px] py-2 px-2.5 bg-[#B94F32] hover:bg-[#a64429] text-[#FAF0DC] text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Moon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {state.day >= 30 ? 'Finish Sol 30' : `End Sol ${state.day}`}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              {availableItems.map((item) => {
                const isSelected = state.selectedBuildingId === item.buildingId;
                const badgeBg =
                  item.kind === 'ongoing'
                    ? 'bg-[#477C9B] text-[#FAF0DC]'
                    : item.kind === 'special'
                    ? 'bg-[#718B78] text-[#FAF0DC]'
                    : item.kind === 'major'
                    ? 'bg-[#B94F32] text-[#FAF0DC]'
                    : 'bg-[#E9B77B] text-[#292C2B]';

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onLocateBuilding(item.buildingId)}
                    className={`w-full text-left p-2 rounded-xl border-2 bg-[#FAF0DC] hover:bg-[#FFF8EB] cursor-pointer flex items-center gap-2.5 transition-all ${
                      isSelected
                        ? 'border-[#B94F32] ring-2 ring-[#B94F32] shadow-[0_2px_0_#292C2B]'
                        : 'border-[#292C2B]'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl border-2 border-[#292C2B] flex items-center justify-center shrink-0 ${badgeBg}`}
                    >
                      {item.kind === 'ongoing' ? (
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      ) : item.kind === 'special' ? (
                        <Sparkles className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Wrench className="w-4 h-4" aria-hidden="true" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-extrabold text-[#292C2B] truncate">
                        {item.taskName}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] font-bold text-[#292C2B]/70">
                        <span className="truncate">{item.buildingName}</span>
                        {item.objectiveType && (
                          <span
                            className={`text-[10px] font-extrabold shrink-0 ${
                              item.objectiveType === 'mandatory'
                                ? 'text-[#B94F32]'
                                : 'text-[#477C9B]'
                            }`}
                          >
                            {item.objectiveType === 'mandatory' ? 'Mandatory' : 'Optional'}
                          </span>
                        )}
                        {item.hours && (
                          <span className="inline-flex items-center gap-0.5 font-mono-tabular shrink-0">
                            <Clock className="w-3 h-3" aria-hidden="true" />
                            {item.hours}h
                          </span>
                        )}
                      </div>
                    </div>

                    <MapPin
                      className={`w-4 h-4 shrink-0 ${
                        isSelected ? 'text-[#B94F32]' : 'text-[#292C2B]/45'
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}

              {renderDailyActivitiesSection()}

              {/* Compact Horizon & Facility Watch Footer */}
              <div className="mars-panel-light p-2 rounded-xl border border-[#292C2B]/25 space-y-1 text-[10px]">
                <div className="flex items-center gap-1 font-extrabold text-[#477C9B]">
                  <CalendarClock className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{horizonText}</span>
                </div>
                {focusBuildingMonitor && (
                  <button
                    type="button"
                    onClick={() => onLocateBuilding(focusBuildingMonitor.id)}
                    className="w-full text-left flex items-center justify-between gap-1 font-bold text-[#292C2B]/80 hover:text-[#292C2B] cursor-pointer"
                  >
                    <span className="truncate">
                      Watch: {focusBuildingMonitor.name} ({focusBuildingMonitor.detail})
                    </span>
                    <MapPin className="w-3 h-3 shrink-0 text-[#477C9B]" aria-hidden="true" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="p-2.5 overflow-y-auto space-y-3 flex-1 min-h-0">
          {systemSections.map((group) => (
            <section key={group.key} className="space-y-1.5">
              <div className="flex items-center gap-1.5 px-1">
                {renderCategoryIcon(group.category)}
                <h3
                  className="text-[11px] font-extrabold"
                  style={{ color: group.color }}
                >
                  {group.label}
                </h3>
              </div>

              <div className="space-y-1.5">
                {group.buildings.map((def) => {
                  const bState = state.buildings[def.id];
                  const isSelected = state.selectedBuildingId === def.id;
                  const unlockStatus = getBuildingUnlockStatus(def.id, state);
                  const isLocked = !unlockStatus.unlocked;
                  const needsFix =
                    !bState.restoredOnce || bState.status === 'inactive';
                  const isDamaged = !needsFix && bState.status === 'damaged';
                  const hasMalfunction =
                    !needsFix && (bState.malfunctionDaysRemaining ?? 0) > 0;
                  const hasFrost = !needsFix && (bState.frostLevel ?? 0) >= 20;
                  const statusText = isLocked
                    ? 'Locked'
                    : needsFix
                    ? 'Fix!'
                    : hasMalfunction
                    ? bState.malfunctionKind === 'frost'
                      ? 'Frost'
                      : 'Fault'
                    : isDamaged
                    ? 'Repair'
                    : hasFrost
                    ? 'Frost'
                    : def.id === 'solar_panels' && bState.dustLevel >= 35
                    ? 'Dusty'
                    : 'OK';
                  const statusColor = isLocked
                    ? '#5E5955'
                    : needsFix
                    ? '#8C4D32'
                    : isDamaged || hasMalfunction || hasFrost || statusText === 'Dusty'
                    ? '#B3693B'
                    : '#396344';

                  return (
                    <button
                      key={def.id}
                      type="button"
                      onClick={() => onLocateBuilding(def.id)}
                      className={`w-full text-left p-2 rounded-xl border-2 flex items-center gap-2.5 transition-all cursor-pointer ${
                        isLocked
                          ? 'bg-[#EFE3CC]/85 hover:bg-[#FAF0DC] opacity-80'
                          : 'bg-[#FAF0DC] hover:bg-[#FFF8EB]'
                      } ${
                        isSelected
                          ? 'border-[#B94F32] ring-2 ring-[#B94F32]'
                          : 'border-[#292C2B]'
                      }`}
                    >
                      <div className="relative w-9 h-9 rounded-xl bg-[#F1D8A8] border-2 border-[#292C2B] flex items-center justify-center shrink-0">
                        <BuildingIcon id={def.id} className="w-6 h-6" />
                        {isLocked && (
                          <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#292C2B] text-[#FAF0DC] flex items-center justify-center">
                            <Lock className="w-2.5 h-2.5" aria-hidden="true" />
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-extrabold text-[#292C2B] truncate">
                            {def.shortName}
                          </span>
                          <span
                            className="text-[10px] font-extrabold shrink-0"
                            style={{ color: statusColor }}
                          >
                            {statusText}
                          </span>
                        </div>
                        <div className="text-[10px] font-bold text-[#292C2B]/70 truncate">
                          {isLocked && unlockStatus.shortReason
                            ? `Unlock: ${unlockStatus.shortReason}`
                            : getSystemShortPurpose(def.id, state.difficulty)}
                        </div>
                        <div className="mt-1 h-1.5 w-full bg-[#F1D8A8] border border-[#292C2B] rounded-full overflow-hidden">
                          <div
                            className="h-full"
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
                    </button>
                  );
                })}
              </div>

              {group.key === 'energy' && (
                <div className="mars-panel-light p-2.5 rounded-xl space-y-2 border-2 border-[#292C2B]/25">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold text-[#292C2B] flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-[#B94F32]" aria-hidden="true" />
                      <span>Energy Generation</span>
                    </span>
                    <span className="font-mono-tabular text-[11px] font-extrabold text-[#B94F32]">
                      +{energyStats.totalCurrentDailyOutput}/{energyStats.totalMaxDailyCapacity}/sol
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {energyStats.sources.map((src) => {
                      const pctOfCap = Math.min(
                        100,
                        Math.round(
                          (src.currentDailyOutput / Math.max(1, src.maxDailyCapacity)) * 100
                        )
                      );
                      return (
                        <div
                          key={src.buildingId}
                          className="p-1.5 rounded-lg bg-[#FAF0DC] border border-[#292C2B]/20 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-1 text-[10px] font-extrabold">
                            <span className="text-[#292C2B] truncate">{src.shortName}</span>
                            <span className="font-mono-tabular text-[#292C2B] shrink-0">
                              +{src.currentDailyOutput}/{src.maxDailyCapacity}/sol
                              <span className="text-[#477C9B] ml-1">
                                ({src.contributionPct}%)
                              </span>
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-[#F1D8A8] border border-[#292C2B]/50 rounded-full overflow-hidden">
                            <div
                              className="h-full transition-all"
                              style={{
                                width: `${pctOfCap}%`,
                                backgroundColor:
                                  src.status === 'inactive'
                                    ? '#8E867F'
                                    : pctOfCap >= 75
                                    ? '#718B78'
                                    : '#D77B4A',
                              }}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-1 text-[10px] font-bold text-[#292C2B]/70">
                            <span className="truncate">{src.note}</span>
                            {src.maxHourlyDaytimeRate > 0 && (
                              <span
                                className={`font-mono-tabular shrink-0 ${
                                  src.hourlyDaytimeRate >= 1
                                    ? 'text-[#396344]'
                                    : src.hourlyDaytimeRate > 0
                                    ? 'text-[#B3693B]'
                                    : 'text-[#292C2B]/55'
                                }`}
                              >
                                {src.hourlyDaytimeRate >= 1
                                  ? '+1/hr'
                                  : src.hourlyDaytimeRate > 0
                                  ? '+0.5/hr'
                                  : '0/hr'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-extrabold pt-1 border-t border-[#292C2B]/15 tabular-nums">
                    <span className="text-[#292C2B]/70">
                      Demand: -{energyStats.totalDailyDemand}/sol
                    </span>
                    <span
                      className={
                        energyStats.netDailyEnergy >= 0 ? 'text-[#396344]' : 'text-[#C94B43]'
                      }
                    >
                      Net: {energyStats.netDailyEnergy >= 0 ? `+${energyStats.netDailyEnergy}` : energyStats.netDailyEnergy}/sol
                    </span>
                  </div>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
      </div>
    </aside>
  );
}
