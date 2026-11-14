import { useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  Cpu,
  Droplets,
  Loader2,
  Lock,
  MapPin,
  Shield,
  Sparkles,
  Sprout,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import {
  BATTERY_STORAGE_CAPACITY_BY_DIFFICULTY,
  getFacilityDailyProduction,
} from '../../data/balance';
import { BUILDING_DEFINITIONS, BUILDING_LIST } from '../../data/buildings';
import { TOTAL_DAY_HOURS } from '../../data/mission';
import { TASK_DEFINITIONS } from '../../data/tasks';
import { getBuildingUnlockStatus } from '../../systems/buildings';
import { calculateEnergyGenerationStats } from '../../systems/resources';
import { validateTask } from '../../systems/tasks';
import { BuildingCategory, BuildingId } from '../../types/building';
import { DifficultyLevel, GameState } from '../../types/game';
import { BuildingIcon } from '../icons/GameIcons';

interface MajorTasksSidebarProps {
  state: GameState;
  minimized?: boolean;
  onLocateBuilding: (buildingId: BuildingId) => void;
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

  // Urgent Shelter Action if Radiation Storm is active and shelter is usable
  if (
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

export function MajorTasksSidebar({
  state,
  minimized = false,
  onLocateBuilding,
  onClose,
}: MajorTasksSidebarProps) {
  const [activeTab, setActiveTab] = useState<'tasks' | 'systems'>('tasks');
  const availableItems = getAvailableTaskItems(state);
  const energyStats = calculateEnergyGenerationStats({
    buildings: state.buildings,
    currentResources: state.resources,
    greenhouseCrop: state.greenhouseCrop,
    activeEvent: state.activeEvent,
    modifiers: state.modifiers,
    hoursElapsed: state.hoursElapsed,
    difficulty: state.difficulty,
  });

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
          {availableItems.length}
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
            <div className="mars-panel-light p-4 text-center space-y-2">
              {state.crew.inShelter ? (
                <>
                  <Shield className="w-9 h-9 text-[#477C9B] mx-auto" aria-hidden="true" />
                  <div className="text-xs font-extrabold text-[#292C2B]">
                    Crew Safe in Shelter
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-9 h-9 text-[#396344] mx-auto" aria-hidden="true" />
                  <div className="text-xs font-extrabold text-[#292C2B]">
                    {state.crew.energy < 20
                      ? 'Crew Needs Rest'
                      : state.hoursElapsed >= 22
                      ? 'Ready to End Sol'
                      : 'All Tasks Clear'}
                  </div>
                </>
              )}
            </div>
          ) : (
            availableItems.map((item) => {
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
            })
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
