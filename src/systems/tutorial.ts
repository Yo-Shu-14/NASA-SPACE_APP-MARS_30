import { BuildingId } from '../types/building';
import { GameState } from '../types/game';

export type TutorialHighlightTarget =
  | 'solar_panels'
  | 'fix_button'
  | 'minigame'
  | 'tasks_drawer'
  | 'end_day'
  | null;

export interface TutorialStepSpec {
  step: number;
  label: string;
  headline: string;
  body: string;
  completedLabel: string;
  highlight: TutorialHighlightTarget;
  focusBuildingId?: BuildingId;
  requiresDrawerAction?: boolean;
  isFinalStep?: boolean;
}

export const DAY_ONE_TUTORIAL_STEPS: TutorialStepSpec[] = [
  {
    step: 0,
    label: 'Resources & Outpost',
    headline: 'Sol 1: Power Up First!',
    body: 'Top-right bars track Air, Water, Food, and Power. Tap Solar Panels to inspect it.',
    completedLabel: 'Solar Panels inspected!',
    highlight: 'solar_panels',
    focusBuildingId: 'solar_panels',
  },
  {
    step: 1,
    label: 'Crew Task Cost',
    headline: 'Assign Your Crew',
    body: 'Check Time, Stamina, and Power icons on the card, then tap Fix to send the crew.',
    completedLabel: 'Crew dispatched to Solar Panels!',
    highlight: 'fix_button',
    focusBuildingId: 'solar_panels',
  },
  {
    step: 2,
    label: 'Repair Minigame',
    headline: 'Complete the Repair',
    body: 'Finish the quick repair check to bring Solar Panels back online.',
    completedLabel: 'Solar Panels back online!',
    highlight: 'minigame',
    focusBuildingId: 'solar_panels',
  },
  {
    step: 3,
    label: 'Unlocks & Tasks',
    headline: 'Battery Bank Unlocked!',
    body: 'Restoring power unlocked Batteries. Tap the top-left Tasks icon or fix Oxygen next.',
    completedLabel: 'Tasks explored — ready to wrap Sol 1!',
    highlight: 'tasks_drawer',
    requiresDrawerAction: true,
  },
  {
    step: 4,
    label: 'Stamina & Sols',
    headline: 'Watch Stamina & Time',
    body: 'Use Rest (top-left) when Stamina drops, or tap END SOL below to start Sol 2.',
    completedLabel: 'Sol 1 Tutorial Complete!',
    highlight: 'end_day',
    isFinalStep: true,
  },
];

export const TOTAL_TUTORIAL_STEPS = DAY_ONE_TUTORIAL_STEPS.length;

export function isDayOneTutorialActive(state: GameState): boolean {
  return (
    state.screen === 'PLAYING' &&
    state.day === 1 &&
    !state.tutorialSkipped &&
    state.tutorialStep < TOTAL_TUTORIAL_STEPS
  );
}

export function getCurrentTutorialStep(state: GameState): TutorialStepSpec | null {
  if (!isDayOneTutorialActive(state)) return null;
  return DAY_ONE_TUTORIAL_STEPS[state.tutorialStep] ?? null;
}

/** Automatically advances Day 1 tutorial step as the player explores existing mechanics. */
export function resolveTutorialStepProgress(state: GameState): number {
  if (state.day !== 1 || state.tutorialSkipped) {
    return state.tutorialStep;
  }

  let step = state.tutorialStep;

  // Step 0 -> 1 once player opens Solar Panels or already started/finished fixing it
  if (
    step === 0 &&
    (state.selectedBuildingId === 'solar_panels' ||
      state.pendingAction?.buildingId === 'solar_panels' ||
      state.buildings.solar_panels.restoredOnce)
  ) {
    step = 1;
  }

  // Step 1 -> 2 once crew begins walking/working on a task or Solar Panels already restored
  if (
    step === 1 &&
    (state.pendingAction !== null || state.buildings.solar_panels.restoredOnce)
  ) {
    step = 2;
  }

  // Step 2 -> 3 once Solar Panels are restored
  if (step === 2 && state.buildings.solar_panels.restoredOnce) {
    step = 3;
  }

  // Step 3 -> 4 once player completes another task OR explores the Tasks drawer & starts a second task
  if (
    step === 3 &&
    (state.totalTasksCompleted >= 2 ||
      (state.buildings.solar_panels.restoredOnce &&
        state.tutorialDrawerSeen &&
        state.pendingAction !== null))
  ) {
    step = 4;
  }

  return step;
}

export interface ContextualMechanicHint {
  id: string;
  headline: string;
  body: string;
  emotion: 'happy' | 'excited' | 'concerned' | 'worried' | 'relieved';
  urgency: 'info' | 'warning';
  focusBuildingId?: BuildingId;
}

/** Provides one-time contextual GIL guidance when the player first encounters unfamiliar mechanics. */
export function getActiveContextualMechanicHint(
  state: GameState
): ContextualMechanicHint | null {
  if (state.screen !== 'PLAYING' || isDayOneTutorialActive(state)) {
    return null;
  }

  const seen = new Set(state.seenMechanicHints ?? []);

  // 1. First time encountering Greenhouse farming after restoration
  if (
    !seen.has('greenhouse_intro') &&
    state.selectedBuildingId === 'greenhouse' &&
    state.buildings.greenhouse.restoredOnce &&
    !state.greenhouseCrop &&
    state.harvestCount === 0
  ) {
    return {
      id: 'greenhouse_intro',
      headline: 'How Crops Grow',
      body: 'Pick Potatoes for quick food or Wheat for a bigger harvest! Crops use Water & Power daily until ripe.',
      emotion: 'excited',
      urgency: 'info',
      focusBuildingId: 'greenhouse',
    };
  }

  // 2. First time opening Radiation Storm Shelter after restoring it
  if (
    !seen.has('shelter_intro') &&
    state.selectedBuildingId === 'radiation_shelter' &&
    state.buildings.radiation_shelter.restoredOnce &&
    !state.crew.inShelter
  ) {
    return {
      id: 'shelter_intro',
      headline: 'Using the Storm Shelter',
      body: 'Tap Enter Shelter during Solar Storms or Sun Sparks to keep all 5 crew safe. Tasks pause while inside.',
      emotion: 'happy',
      urgency: 'info',
      focusBuildingId: 'radiation_shelter',
    };
  }

  // 3. First time selecting a backup storage tank while offline
  if (
    !seen.has('storage_bonus') &&
    (state.selectedBuildingId === 'energy_storage' ||
      state.selectedBuildingId === 'water_storage' ||
      state.selectedBuildingId === 'food_storage') &&
    !state.buildings[state.selectedBuildingId].restoredOnce
  ) {
    return {
      id: 'storage_bonus',
      headline: 'Expand Your Reserves!',
      body: 'Restoring storage facilities raises your max capacity so you can stockpile supplies before big storms hit.',
      emotion: 'excited',
      urgency: 'info',
      focusBuildingId: state.selectedBuildingId,
    };
  }

  // 4. First time Solar Panels get dusty
  if (
    !seen.has('dust_cleaning') &&
    state.buildings.solar_panels.restoredOnce &&
    state.buildings.solar_panels.dustLevel >= 35
  ) {
    return {
      id: 'dust_cleaning',
      headline: 'Solar Dust Check!',
      body: 'Mars dust blocks sunlight on Solar Panels. Use Clean on the Solar card to restore full daytime Power.',
      emotion: 'concerned',
      urgency: 'warning',
      focusBuildingId: 'solar_panels',
    };
  }

  // 5. First time working into overtime (past 9 PM) or dropping below 30% stamina
  if (
    !seen.has('stamina_overtime') &&
    state.day >= 2 &&
    (state.overtimeHours > 0 || state.crew.energy <= 30)
  ) {
    return {
      id: 'stamina_overtime',
      headline: 'Watch Crew Stamina!',
      body: 'Working past 9:00 PM causes Overtime fatigue next sol. Tap Rest (top-left) for +Stamina or END SOL early.',
      emotion: 'worried',
      urgency: 'warning',
    };
  }

  return null;
}
