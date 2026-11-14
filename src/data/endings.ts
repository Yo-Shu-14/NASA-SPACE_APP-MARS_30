import { BUILDING_DEFINITIONS } from './buildings';
import { BuildingId } from '../types/building';
import { EventCutsceneBeat } from '../types/event';
import { GameState } from '../types/game';

export type EndingKind =
  | 'victory_sustainable'
  | 'victory_improvements'
  | 'survived_failed'
  | 'fail_oxygen'
  | 'fail_water'
  | 'fail_food'
  | 'fail_radiation'
  | 'fail_condition';

export interface EndingCutsceneSpec {
  kind: EndingKind;
  badgeText: string;
  title: string;
  accentColor: string;
  isVictory: boolean;
  beats: EventCutsceneBeat[];
}

export function resolveEndingKind(state: GameState): EndingKind {
  if (state.screen === 'GAME_OVER') {
    if (state.failureCause === 'oxygen') return 'fail_oxygen';
    if (state.failureCause === 'water') return 'fail_water';
    if (state.failureCause === 'food') return 'fail_food';
    if (state.failureCause === 'radiation') return 'fail_radiation';
    return 'fail_condition';
  }

  const assessment = state.assessment;
  if (!assessment || !assessment.passed) {
    return 'survived_failed';
  }
  if (assessment.outcome === 'Sustainable') {
    return 'victory_sustainable';
  }
  return 'victory_improvements';
}

export function buildEndingCutscene(state: GameState): EndingCutsceneSpec {
  const kind = resolveEndingKind(state);
  const leader = state.playerName?.trim() || 'Commander';
  const assessment = state.assessment;
  const lastDecision =
    state.modifiers.decisionHistory.length > 0
      ? state.modifiers.decisionHistory[state.modifiers.decisionHistory.length - 1]
      : null;
  const stormsCleared = state.eventHistory.filter((e) => e.severity !== 'minor').length;

  const missingCheck = assessment?.mandatoryChecks.find((c) => !c.passed) ?? null;
  const weakestCriterion = assessment?.criteria
    .filter((c) => c.status !== 'pass')
    .sort((a, b) => a.score - b.score)[0];

  const offlineBuildingId = (Object.keys(state.buildings) as BuildingId[]).find(
    (bId) => state.buildings[bId].status === 'inactive'
  );
  const offlineBuildingName = offlineBuildingId
    ? BUILDING_DEFINITIONS[offlineBuildingId].shortName
    : 'outpost systems';

  switch (kind) {
    case 'victory_sustainable': {
      const score = assessment?.overallScore ?? 92;
      const ops = assessment?.facilitiesOperational ?? 9;
      const total = assessment?.totalFacilities ?? 9;
      return {
        kind,
        badgeText: `Sol 30 · Mission Success (${score}/100)`,
        title: 'Jezero Outpost Fully Restored!',
        accentColor: '#396344',
        isVictory: true,
        beats: [
          {
            id: 'vs_1',
            speaker: 'GIL',
            roleLabel: 'Outpost AI Guide',
            mood: 'excited',
            line: `Sol 30 sunrise! Telemetry is green—${ops} of ${total} systems are online at ${score}/100!`,
            focusBuildingId: 'main_habitat',
            cameraZoom: 0.92,
          },
          {
            id: 'vs_2',
            speaker: 'Brent',
            roleLabel: 'Systems Engineer',
            mood: 'excited',
            line:
              stormsCleared > 0
                ? `Even after ${stormsCleared} fierce Martian storm${stormsCleared > 1 ? 's' : ''}, our grid held strong!`
                : 'Our solar arrays and seals held steady through every single sol!',
            focusBuildingId: 'solar_panels',
            cameraZoom: 1.0,
          },
          {
            id: 'vs_3',
            speaker: 'Darryl',
            roleLabel: 'Hydroponics Lead',
            mood: 'excited',
            line:
              state.harvestCount > 0
                ? `We brought in ${state.harvestCount} fresh greenhouse harvest${state.harvestCount > 1 ? 's' : ''}! No one goes hungry on our watch.`
                : 'Greenhouse beds are thriving and water recovery is steady for the long haul.',
            focusBuildingId: 'greenhouse',
            cameraZoom: 1.0,
          },
          {
            id: 'vs_4',
            speaker: 'MJ',
            roleLabel: 'Flight Medic',
            mood: 'calm',
            line:
              lastDecision
                ? `Choosing "${lastDecision.choiceTitle}" kept crew health at ${state.crew.condition}%. Ready for 150 more sols!`
                : `Crew health stands at ${state.crew.condition}%. We are officially cleared for 150 more sols!`,
            focusBuildingId: 'oxygen_generator',
            cameraZoom: 0.98,
          },
          {
            id: 'vs_5',
            speaker: 'Player',
            roleLabel: 'Crew Leader',
            mood: 'determined',
            line: 'We turned a broken landing site into a home on Mars. Great work, team!',
            focusBuildingId: 'main_habitat',
            cameraZoom: 0.74,
          },
        ],
      };
    }

    case 'victory_improvements': {
      const score = assessment?.overallScore ?? 74;
      const fixTip = weakestCriterion
        ? `${weakestCriterion.label} (${weakestCriterion.score}%) is a bit tight`
        : 'reserves are a little lean';
      return {
        kind,
        badgeText: `Sol 30 · Passed with Improvements (${score}/100)`,
        title: 'Outpost Operational — Ready for 150 Sols!',
        accentColor: '#D77B4A',
        isVictory: true,
        beats: [
          {
            id: 'vi_1',
            speaker: 'GIL',
            roleLabel: 'Outpost AI Guide',
            mood: 'excited',
            line: `We made it to Sol 30, ${leader}! Every mandatory survival system passed!`,
            focusBuildingId: 'main_habitat',
            cameraZoom: 0.92,
          },
          {
            id: 'vi_2',
            speaker: 'Brent',
            roleLabel: 'Systems Engineer',
            mood: 'determined',
            line: `${fixTip}, so our crew will keep fine-tuning machines over the next 150 sols.`,
            focusBuildingId: 'solar_panels',
            cameraZoom: 0.98,
          },
          {
            id: 'vi_3',
            speaker: 'Magno',
            roleLabel: 'Field Specialist',
            mood: 'calm',
            line:
              state.harvestCount > 0
                ? `${state.totalTasksCompleted} repairs and ${state.harvestCount} harvest${state.harvestCount > 1 ? 's' : ''} kept Jezero alive.`
                : `${state.totalTasksCompleted} repairs carried us across the Sol 30 finish line.`,
            focusBuildingId: 'greenhouse',
            cameraZoom: 0.98,
          },
          {
            id: 'vi_4',
            speaker: 'Player',
            roleLabel: 'Crew Leader',
            mood: 'determined',
            line: 'We earned our place on Mars. Now let’s review the full 150-sol report!',
            focusBuildingId: 'main_habitat',
            cameraZoom: 0.74,
          },
        ],
      };
    }

    case 'survived_failed': {
      const gapLine = missingCheck
        ? `${missingCheck.label} still came up short—${missingCheck.detail.toLowerCase()}.`
        : `${offlineBuildingName} never stayed steady enough for another 150 sols.`;
      return {
        kind,
        badgeText: 'Sol 30 Reached · Mission Objectives Incomplete',
        title: 'Survived 30 Sols — Outpost Not Sustainable',
        accentColor: '#B94F32',
        isVictory: false,
        beats: [
          {
            id: 'sf_1',
            speaker: 'GIL',
            roleLabel: 'Outpost AI Guide',
            mood: 'concerned',
            line: `We survived all 30 sols, ${leader}—but Earth’s 150-sol readiness audit didn’t pass.`,
            focusBuildingId: 'main_habitat',
            cameraZoom: 0.92,
          },
          {
            id: 'sf_2',
            speaker: 'Brent',
            roleLabel: 'Systems Engineer',
            mood: 'worried',
            line: gapLine,
            focusBuildingId: offlineBuildingId ?? 'oxygen_generator',
            cameraZoom: 1.0,
          },
          {
            id: 'sf_3',
            speaker: 'MJ',
            roleLabel: 'Flight Medic',
            mood: 'concerned',
            line: `All five of us are alive at ${state.crew.condition}% health, yet we can’t stretch these supplies 150 more sols.`,
            focusBuildingId: 'water_recycling',
            cameraZoom: 0.96,
          },
          {
            id: 'sf_4',
            speaker: 'Player',
            roleLabel: 'Crew Leader',
            mood: 'determined',
            line: 'Every survival day taught us what went wrong. Let’s check the report and rebuild stronger!',
            focusBuildingId: 'main_habitat',
            cameraZoom: 0.78,
          },
        ],
      };
    }

    case 'fail_oxygen':
      return {
        kind,
        badgeText: `Sol ${state.day} · Oxygen Depleted`,
        title: 'Atmosphere Lost — Emergency Abort',
        accentColor: '#477C9B',
        isVictory: false,
        beats: [
          {
            id: 'fo_1',
            speaker: 'GIL',
            roleLabel: 'Outpost AI Guide',
            mood: 'alert',
            line: `Red alert on Sol ${state.day}! Habitat oxygen pressure just dropped to 0%.`,
            focusBuildingId: 'oxygen_generator',
            cameraZoom: 1.04,
          },
          {
            id: 'fo_2',
            speaker: 'MJ',
            roleLabel: 'Flight Medic',
            mood: 'worried',
            line: 'Everyone seal helmets right now! Without the Oxygen Generation System, we only have suit air left.',
            focusBuildingId: 'main_habitat',
            cameraZoom: 1.0,
          },
          {
            id: 'fo_3',
            speaker: 'Brent',
            roleLabel: 'Systems Engineer',
            mood: 'concerned',
            line: 'With Power and CO2 scrubbers down too long, the hab couldn’t breathe back.',
            focusBuildingId: 'solar_panels',
            cameraZoom: 0.96,
          },
          {
            id: 'fo_4',
            speaker: 'Player',
            roleLabel: 'Crew Leader',
            mood: 'concerned',
            line: 'Suits locked—head calmly for the ascent shuttle. Next mission, Oxygen stays protected!',
            focusBuildingId: 'main_habitat',
            cameraZoom: 0.82,
          },
        ],
      };

    case 'fail_water':
      return {
        kind,
        badgeText: `Sol ${state.day} · Water Depleted`,
        title: 'Water Tanks Dry — Emergency Abort',
        accentColor: '#477C9B',
        isVictory: false,
        beats: [
          {
            id: 'fw_1',
            speaker: 'GIL',
            roleLabel: 'Outpost AI Guide',
            mood: 'alert',
            line: `Critical dry-tank alarm on Sol ${state.day}! Water reserves reached zero.`,
            focusBuildingId: 'water_storage',
            cameraZoom: 1.04,
          },
          {
            id: 'fw_2',
            speaker: 'Darryl',
            roleLabel: 'Hydroponics Lead',
            mood: 'worried',
            line: 'Hydroponic trays dried out and the recovery loops stopped cycling clean water.',
            focusBuildingId: 'water_recycling',
            cameraZoom: 1.02,
          },
          {
            id: 'fw_3',
            speaker: 'MJ',
            roleLabel: 'Flight Medic',
            mood: 'concerned',
            line: `Crew hydration is critical on Sol ${state.day}. We can’t push another day without water.`,
            focusBuildingId: 'main_habitat',
            cameraZoom: 0.96,
          },
          {
            id: 'fw_4',
            speaker: 'Player',
            roleLabel: 'Crew Leader',
            mood: 'concerned',
            line: 'Stay together and head to the ascent craft. Next time we stabilize Water Recovery early!',
            focusBuildingId: 'main_habitat',
            cameraZoom: 0.82,
          },
        ],
      };

    case 'fail_food':
      return {
        kind,
        badgeText: `Sol ${state.day} · Food Depleted`,
        title: 'Rations Exhausted — Emergency Abort',
        accentColor: '#B94F32',
        isVictory: false,
        beats: [
          {
            id: 'ff_1',
            speaker: 'GIL',
            roleLabel: 'Outpost AI Guide',
            mood: 'alert',
            line: `Food Storage is completely empty on Sol ${state.day}, ${leader}. Zero rations left.`,
            focusBuildingId: 'food_storage',
            cameraZoom: 1.04,
          },
          {
            id: 'ff_2',
            speaker: 'Darryl',
            roleLabel: 'Hydroponics Lead',
            mood: 'worried',
            line:
              state.harvestCount === 0
                ? 'We didn’t get a single Greenhouse harvest in time before emergency packs ran out.'
                : `Even with ${state.harvestCount} harvest${state.harvestCount > 1 ? 's' : ''}, crops fell behind daily crew rations.`,
            focusBuildingId: 'greenhouse',
            cameraZoom: 1.02,
          },
          {
            id: 'ff_3',
            speaker: 'Magno',
            roleLabel: 'Field Specialist',
            mood: 'concerned',
            line: 'Nobody has the strength left to haul equipment across the crater.',
            focusBuildingId: 'main_habitat',
            cameraZoom: 0.96,
          },
          {
            id: 'ff_4',
            speaker: 'Player',
            roleLabel: 'Crew Leader',
            mood: 'concerned',
            line: 'Take steady steps to the ascent craft. Next mission, we keep Greenhouse harvests flowing!',
            focusBuildingId: 'main_habitat',
            cameraZoom: 0.82,
          },
        ],
      };

    case 'fail_radiation':
      return {
        kind,
        badgeText: `Sol ${state.day} · Radiation Emergency`,
        title: 'Solar Radiation Overload — Emergency Abort',
        accentColor: '#C94B43',
        isVictory: false,
        beats: [
          {
            id: 'fr_1',
            speaker: 'GIL',
            roleLabel: 'Outpost AI Guide',
            mood: 'alert',
            line: `Dosimeters maxed out on Sol ${state.day}! Radiation exposure passed safe limits.`,
            focusBuildingId: 'radiation_shelter',
            cameraZoom: 1.04,
          },
          {
            id: 'fr_2',
            speaker: 'MJ',
            roleLabel: 'Flight Medic',
            mood: 'worried',
            line: `Crew health crashed to ${state.crew.condition}% outside the shelter! Everyone needs immediate medevac.`,
            focusBuildingId: 'main_habitat',
            cameraZoom: 1.0,
          },
          {
            id: 'fr_3',
            speaker: 'Brent',
            roleLabel: 'Systems Engineer',
            mood: 'concerned',
            line: 'Martian storms hit fast without Earth’s magnetic field—we needed that Shelter online.',
            focusBuildingId: 'radiation_shelter',
            cameraZoom: 0.96,
          },
          {
            id: 'fr_4',
            speaker: 'Player',
            roleLabel: 'Crew Leader',
            mood: 'concerned',
            line: 'Stay shielded and board the return craft together. Next run, Shelter comes before any storm!',
            focusBuildingId: 'main_habitat',
            cameraZoom: 0.82,
          },
        ],
      };

    case 'fail_condition':
    default:
      return {
        kind: 'fail_condition',
        badgeText: `Sol ${state.day} · Crew Health Critical`,
        title: 'Medical Evacuation Ordered',
        accentColor: '#C94B43',
        isVictory: false,
        beats: [
          {
            id: 'fc_1',
            speaker: 'MJ',
            roleLabel: 'Flight Medic',
            mood: 'alert',
            line: `Commander, crew health dropped to ${state.crew.condition}% on Sol ${state.day}. We have to scrub the mission.`,
            focusBuildingId: 'main_habitat',
            cameraZoom: 1.0,
          },
          {
            id: 'fc_2',
            speaker: 'GIL',
            roleLabel: 'Outpost AI Guide',
            mood: 'worried',
            line: 'Repeated shortages and harsh Jezero conditions overwhelmed Habitat recovery.',
            focusBuildingId: 'oxygen_generator',
            cameraZoom: 0.96,
          },
          {
            id: 'fc_3',
            speaker: 'Player',
            roleLabel: 'Crew Leader',
            mood: 'concerned',
            line: 'Walk together to the ascent ship. We’ll study every log and bring the crew back stronger!',
            focusBuildingId: 'main_habitat',
            cameraZoom: 0.82,
          },
        ],
      };
  }
}
