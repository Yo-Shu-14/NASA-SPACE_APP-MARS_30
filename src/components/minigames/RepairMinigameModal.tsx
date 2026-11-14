import { ComponentType, useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { BUILDING_DEFINITIONS } from '../../data/buildings';
import { TASK_DEFINITIONS } from '../../data/tasks';
import { soundFX } from '../../systems/audio';
import { BuildingId } from '../../types/building';
import { GameState, PendingCrewAction } from '../../types/game';
import { BuildingIcon } from '../icons/GameIcons';
import {
  AirFilterCleanGame,
  OxygenCryoMixGame,
  OxygenPipeGame,
  OxygenPressureGame,
  OxygenSievePurgeGame,
  OxygenValveCheckGame,
  WaterFilterGame,
  WaterHeaterCoilGame,
  WaterLeakGame,
  WaterPumpPrimeGame,
  WaterSensorCalibrateGame,
  WaterValveFlushGame,
} from './LifeSupportMinigames';
import {
  FoodInventorySortGame,
  FoodNitrogenFlushGame,
  FoodVaultSealGame,
  GreenhouseControlsGame,
  GreenhouseNutrientMixGame,
  GreenhouseSpectrumGame,
  HabitatAirlockSealGame,
  HabitatCalibrationGame,
  HabitatLifeSupportPanelGame,
  ShelterDosimeterSyncGame,
  ShelterRegolithPackGame,
  ShelterShieldGame,
} from './OutpostBaseMinigames';
import {
  BatteryCellBalanceGame,
  BatteryThermalVentGame,
  BatteryWiresGame,
  WorkshopCircuitTestGame,
  WorkshopToolsGame,
  WorkshopTorqueBoltsGame,
} from './PowerWorkshopMinigames';
import {
  SolarAlignmentGame,
  SolarBreakerGame,
  SolarDustSwipeGame,
} from './SolarMinigames';

interface RepairMinigameModalProps {
  action: PendingCrewAction;
  state: GameState;
  onComplete: (actionId: string) => void;
  onCancel: () => void;
}

interface MinigameVariantProps {
  onWin: () => void;
  paused?: boolean;
}

const BUILDING_MINIGAMES: Record<BuildingId, Array<ComponentType<MinigameVariantProps>>> = {
  solar_panels: [SolarDustSwipeGame, SolarAlignmentGame, SolarBreakerGame],
  energy_storage: [BatteryWiresGame, BatteryCellBalanceGame, BatteryThermalVentGame],
  maintenance_facility: [WorkshopToolsGame, WorkshopTorqueBoltsGame, WorkshopCircuitTestGame],
  oxygen_generator: [OxygenPipeGame, AirFilterCleanGame, OxygenSievePurgeGame],
  oxygen_storage: [OxygenPressureGame, OxygenValveCheckGame, OxygenCryoMixGame],
  water_recycling: [WaterFilterGame, WaterValveFlushGame, WaterSensorCalibrateGame],
  water_storage: [WaterLeakGame, WaterHeaterCoilGame, WaterPumpPrimeGame],
  greenhouse: [GreenhouseControlsGame, GreenhouseSpectrumGame, GreenhouseNutrientMixGame],
  food_storage: [FoodVaultSealGame, FoodInventorySortGame, FoodNitrogenFlushGame],
  radiation_shelter: [ShelterShieldGame, ShelterRegolithPackGame, ShelterDosimeterSyncGame],
  main_habitat: [
    HabitatCalibrationGame,
    HabitatAirlockSealGame,
    HabitatLifeSupportPanelGame,
  ],
};

// Track last played variant index per building so consecutive repairs never repeat back-to-back
const lastVariantByBuilding: Partial<Record<BuildingId, number>> = {};

function pickRandomVariantIndex(buildingId: BuildingId): number {
  const pool = BUILDING_MINIGAMES[buildingId];
  if (!pool || pool.length <= 1) return 0;
  const lastIdx = lastVariantByBuilding[buildingId];
  const candidates = pool
    .map((_, idx) => idx)
    .filter((idx) => idx !== lastIdx);
  const chosen = candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
  lastVariantByBuilding[buildingId] = chosen;
  return chosen;
}

export function RepairMinigameModal({
  action,
  state,
  onComplete,
  onCancel,
}: RepairMinigameModalProps) {
  const [won, setWon] = useState(false);
  const [variantIndex] = useState<number>(() => pickRandomVariantIndex(action.buildingId));
  const wonRef = useRef(false);
  const winTimerRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    return () => {
      if (winTimerRef.current !== null) {
        window.clearTimeout(winTimerRef.current);
      }
    };
  }, []);

  const task = TASK_DEFINITIONS.find((t) => t.id === action.taskId);
  const def = BUILDING_DEFINITIONS[action.buildingId];
  const isPaused = state.screen === 'PAUSED';

  const handleWin = useCallback(() => {
    if (wonRef.current) return;
    wonRef.current = true;
    setWon(true);
    soundFX.playTutorialStepComplete();
    winTimerRef.current = window.setTimeout(() => {
      winTimerRef.current = null;
      onCompleteRef.current(action.id);
    }, 650);
  }, [action.id]);

  const renderMinigame = () => {
    const variants = BUILDING_MINIGAMES[action.buildingId] ?? [WorkshopToolsGame];
    const SelectedGame = variants[variantIndex % variants.length] ?? WorkshopToolsGame;
    return <SelectedGame onWin={handleWin} paused={isPaused} />;
  };

  return (
    <div
      className="fixed inset-0 z-30 bg-[#292C2B]/65 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain"
      role="dialog"
      aria-modal="true"
      aria-label={`${task?.title ?? action.label} Minigame`}
    >
      <div className="mars-panel max-w-md w-full my-auto max-h-[92dvh] flex flex-col overflow-hidden rounded-3xl animate-modal-zoom-in">
        {/* Header */}
        <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 bg-[#FAF0DC] border-b-2 border-[#292C2B] flex items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#F1D8A8] border-2 border-[#292C2B] flex items-center justify-center shrink-0">
              <BuildingIcon id={action.buildingId} className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-[#292C2B] truncate">
                {task?.title ?? action.label}
              </h2>
              <div className="text-[11px] font-bold text-[#292C2B]/70 truncate">
                {def.name}
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={won}
            onClick={onCancel}
            aria-label="Cancel repair task"
            className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl hover:bg-[#E9B77B]/60 flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-40"
          >
            <X className="w-5 h-5 text-[#292C2B]" />
          </button>
        </div>

        {/* Day 1 Tutorial Tip Strip */}
        {state.day === 1 && !state.tutorialSkipped && state.tutorialStep <= 2 && (
          <div className="px-3.5 sm:px-4 py-1.5 bg-[#F1D8A8]/75 border-b border-[#292C2B]/25 text-[11px] font-extrabold text-[#477C9B] shrink-0">
            GIL Guide: Complete this quick repair check to bring {def.shortName} online!
          </div>
        )}

        {/* Interactive Minigame Stage */}
        <div className="p-3 sm:p-4 bg-[#FAF0DC] relative overflow-y-auto overscroll-contain flex-1 min-h-0">
          {renderMinigame()}

          {won && (
            <div className="absolute inset-0 z-10 bg-[#396344]/92 flex flex-col items-center justify-center gap-2 text-[#FAF0DC] animate-modal-zoom-in">
              <CheckCircle2 className="w-14 h-14 text-[#F1D8A8]" aria-hidden="true" />
              <div className="text-lg font-extrabold tracking-tight">
                {action.taskKind === 'clean' ? 'Panels Sparkle Clean!' : `${def.shortName} Fixed!`}
              </div>
              {task?.outcomeText && (
                <div className="text-xs font-bold text-[#F1D8A8] px-6 text-center">
                  {task.outcomeText}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
