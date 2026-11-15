import { BUILDING_DEFINITIONS } from '../data/buildings';
import { NASA_REFERENCE_DATA } from '../data/nasa';
import { DaySummary, GameState, GilMessage } from '../types/game';
import { isEventOfficiallyActive, isShelterRequiredEvent } from './events';
import { detectResourceShortages } from './resources';
import {
  getActiveContextualMechanicHint,
  getCurrentTutorialStep,
} from './tutorial';

export function getNextObjectiveLine(state: GameState): string {
  if (
    state.activeEvent?.definition.radiationLevel &&
    isEventOfficiallyActive(state.activeEvent) &&
    !state.crew.inShelter
  ) {
    return 'Move crew into the Radiation Storm Shelter';
  }
  if (state.greenhouseCrop?.isMature) {
    return 'Harvest ripe food in the Greenhouse';
  }
  if (state.buildings.solar_panels.status === 'inactive') {
    return 'Restore the broken Solar Panels';
  }
  if (state.buildings.oxygen_generator.status === 'inactive') {
    return 'Restore the Oxygen Generation System';
  }
  if (state.buildings.water_recycling.status === 'inactive') {
    return 'Restore the Water Recovery System';
  }
  if (state.buildings.greenhouse.status === 'inactive') {
    return 'Restore the Greenhouse for food';
  }
  if (!state.greenhouseCrop && state.day <= 22) {
    return 'Plant seeds in the Greenhouse';
  }
  if (state.buildings.radiation_shelter.status === 'inactive') {
    return 'Restore the Radiation Storm Shelter';
  }
  if (state.buildings.solar_panels.dustLevel >= 35) {
    return 'Brush dust off the Solar Panels';
  }
  if (state.day >= 27 && state.day < 29) {
    return 'Repair damaged facilities before Sol 29';
  }
  if (state.day === 30) {
    return 'Repair damage and finish Sol 30';
  }
  return 'Keep facilities repaired and reserves full';
}

export function getContextualGilMessage(state: GameState): GilMessage {
  const shortages = detectResourceShortages(state.resources);

  // 0a. Crew returning inside Habitat or sleeping for the night
  if (state.sleepPhase === 'returning') {
    return {
      id: `sleep_walk_${state.day}`,
      speaker: 'GIL',
      headline: 'Heading Home to Rest!',
      body: 'Brent, MJ, Darryl, and Magno are walking back inside the Habitat before lights out!',
      urgency: 'info',
      emotion: 'relieved',
    };
  }
  if (state.sleepPhase === 'sleeping' || state.sleepingRemaining > 0) {
    return {
      id: `sleeping_${state.day}`,
      speaker: 'GIL',
      headline: 'Sweet Dreams, Team!',
      body: 'Zzz... Everyone is safe and cozy inside the Habitat recharging for tomorrow!',
      urgency: 'info',
      emotion: 'happy',
    };
  }

  // 0b. Live environmental animation playing on the outpost (event-specific reactions!)
  if (state.activeEvent && state.activeEvent.animationRemaining > 0) {
    const evt = state.activeEvent.definition;
    const hitAlready = state.activeEvent.initialDamageApplied;

    switch (evt.phenomenon) {
      case 'marsquake':
        return {
          id: `evt_anim_${evt.id}_${state.day}`,
          speaker: 'GIL',
          headline: hitAlready ? 'Whoa—Check Those Cracks!' : 'Whoa! The Ground Is Shaking!',
          body: hitAlready
            ? 'The Marsquake rattled our buildings! Let’s inspect the cracks once it settles!'
            : 'Hold onto your space boots! A Marsquake is shaking Jezero Crater!',
          scienceTip: evt.scienceContext,
          descriptionSubject: evt.title,
          descriptionImageKey: evt.phenomenon,
          urgency: 'warning',
          emotion: 'surprised',
        };
      case 'dust_devils':
        return {
          id: `evt_anim_${evt.id}_${state.day}`,
          speaker: 'GIL',
          headline: 'Spinning Dust Tornadoes!',
          body: 'Look at those red swirls zooming past! They’re tossing dust on our Solar Panels!',
          scienceTip: evt.scienceContext,
          descriptionSubject: evt.title,
          descriptionImageKey: evt.phenomenon,
          urgency: 'warning',
          emotion: 'surprised',
        };
      case 'water_ice_clouds':
        return {
          id: `evt_anim_${evt.id}_${state.day}`,
          speaker: 'GIL',
          headline: 'Brrr... Icy Sky Clouds!',
          body: 'Chilly ice clouds are dimming Solar Panels and frosting Water Recovery & Water Tanks.',
          scienceTip: evt.scienceContext,
          descriptionSubject: evt.title,
          descriptionImageKey: evt.phenomenon,
          urgency: 'warning',
          emotion: 'concerned',
        };
      case 'secondary_neutron_cascades':
        return {
          id: `evt_anim_${evt.id}_${state.day}`,
          speaker: 'GIL',
          headline: 'Yikes—Bouncing Space Sparks!',
          body: 'Space rays are hitting the dirt and bouncing up! We should check the Radiation Storm Shelter!',
          scienceTip: evt.scienceContext,
          descriptionSubject: evt.title,
          descriptionImageKey: evt.phenomenon,
          urgency: 'warning',
          emotion: 'worried',
        };
      case 'solar_flare_xray_uv':
        return {
          id: `evt_anim_${evt.id}_${state.day}`,
          speaker: 'GIL',
          headline: 'Whoa—Bright Sun Flare!',
          body: 'Hot beams from the Sun are flashing down on the base! Keep an eye on crew safety!',
          scienceTip: evt.scienceContext,
          descriptionSubject: evt.title,
          descriptionImageKey: evt.phenomenon,
          urgency: 'warning',
          emotion: 'worried',
        };
      case 'solar_storm_response':
        return {
          id: `evt_anim_${evt.id}_${state.day}`,
          speaker: 'GIL',
          headline: 'Big Solar Storm Sweeping Mars!',
          body: 'Crimson solar waves are sweeping across Mars! Duck into Shelter, issue Tactical Orders, or brace key gear!',
          scienceTip: evt.scienceContext,
          descriptionSubject: evt.title,
          descriptionImageKey: evt.phenomenon,
          urgency: 'alert',
          emotion: 'worried',
        };
      case 'solar_energetic_particles':
        return {
          id: `evt_anim_${evt.id}_${state.day}`,
          speaker: 'GIL',
          headline: 'Fast Sun Sparks Warning!',
          body: 'Zippy sparks are zapping our machines and wires! Enter Shelter, repair damage, or pick Tactical Orders!',
          scienceTip: evt.scienceContext,
          descriptionSubject: evt.title,
          descriptionImageKey: evt.phenomenon,
          urgency: 'alert',
          emotion: 'worried',
        };
      case 'global_dust_storm':
      default:
        return {
          id: `evt_anim_${evt.id}_${state.day}`,
          speaker: 'GIL',
          headline: 'Giant Dust Storm Alert!',
          body: 'Huge red dust clouds are covering Mars! Shelter the crew, keep repairs running, or issue Tactical Orders!',
          scienceTip: evt.scienceContext,
          descriptionSubject: evt.title,
          descriptionImageKey: evt.phenomenon,
          urgency: 'alert',
          emotion: 'worried',
        };
    }
  }

  // 0c. Crew currently walking to or actively performing a task or daily activity
  if (state.pendingAction) {
    const bName = BUILDING_DEFINITIONS[state.pendingAction.buildingId].shortName;
    if (state.pendingAction.phase === 'walking') {
      return {
        id: `walk_${state.pendingAction.id}`,
        speaker: 'GIL',
        headline:
          state.pendingAction.kind === 'activity'
            ? `${state.pendingAction.assignedCrew === 'Player' ? 'Heading' : state.pendingAction.assignedCrew + ' Heading'} Over!`
            : `Heading to ${bName}!`,
        body:
          state.pendingAction.kind === 'activity'
            ? `Heading to ${bName} for ${state.pendingAction.label}!`
            : `Heading over to ${bName} to get started!`,
        urgency: 'info',
        emotion: 'excited',
      };
    }
    if (state.pendingAction.kind === 'activity') {
      const cat = state.pendingAction.activityCategory;
      const crewLabel =
        state.pendingAction.assignedCrew === 'Player'
          ? 'The crew is'
          : `${state.pendingAction.assignedCrew} is`;
      if (cat === 'research') {
        return {
          id: `work_${state.pendingAction.id}`,
          speaker: 'GIL',
          headline: 'Running Mars Science!',
          body: `${crewLabel} logging live science data at ${bName} — "${state.pendingAction.label}"!`,
          urgency: 'info',
          emotion: 'excited',
        };
      }
      if (cat === 'exploration') {
        return {
          id: `work_${state.pendingAction.id}`,
          speaker: 'GIL',
          headline: 'Field Recon Underway!',
          body: `${crewLabel} surveying Jezero terrain for "${state.pendingAction.label}"!`,
          urgency: 'info',
          emotion: 'excited',
        };
      }
      if (cat === 'crew') {
        return {
          id: `work_${state.pendingAction.id}`,
          speaker: 'GIL',
          headline: 'Crew Care & Wellness!',
          body: `${crewLabel} leading "${state.pendingAction.label}" to keep everyone healthy!`,
          urgency: 'info',
          emotion: 'relieved',
        };
      }
      return {
        id: `work_${state.pendingAction.id}`,
        speaker: 'GIL',
        headline: 'Preventive Checkup!',
        body: `${crewLabel} fine-tuning ${bName} with "${state.pendingAction.label}"!`,
        urgency: 'info',
        emotion: 'happy',
      };
    }
    if (state.pendingAction.taskKind === 'plant') {
      return {
        id: `work_${state.pendingAction.id}`,
        speaker: 'GIL',
        headline: 'Planting Fresh Seeds!',
        body: 'Dropping seeds into clean water trays—soon we’ll have fresh Mars food!',
        urgency: 'info',
        emotion: 'excited',
      };
    }
    if (state.pendingAction.taskKind === 'harvest') {
      return {
        id: `work_${state.pendingAction.id}`,
        speaker: 'GIL',
        headline: 'Woohoo! Harvest Time!',
        body: 'Picking delicious home-grown food right out of the Greenhouse!',
        urgency: 'info',
        emotion: 'excited',
      };
    }
    if (state.pendingAction.taskKind === 'clean') {
      return {
        id: `work_${state.pendingAction.id}`,
        speaker: 'GIL',
        headline: 'Brushing Red Dust!',
        body: `Sweeping Mars dust off ${bName} so sunlight shines right through!`,
        urgency: 'info',
        emotion: 'happy',
      };
    }
    if (state.pendingAction.taskKind === 'restore') {
      return {
        id: `work_${state.pendingAction.id}`,
        speaker: 'GIL',
        headline: `Rebuilding ${bName}!`,
        body: `Wrenches spinning! Bringing ${bName} back online for the whole crew!`,
        urgency: 'info',
        emotion: 'excited',
      };
    }
    return {
      id: `work_${state.pendingAction.id}`,
      speaker: 'GIL',
      headline: `Fixing ${bName}!`,
      body: `Patching cracks and tightening bolts on ${bName} so it stays strong!`,
      urgency: 'info',
      emotion: 'concerned',
    };
  }

  // 0d. Crew inside Radiation Storm Shelter — clearly explain shelter status & freedom to exit
  if (state.crew.inShelter) {
    const radDanger =
      isShelterRequiredEvent(state.activeEvent) && isEventOfficiallyActive(state.activeEvent);
    return {
      id: `sheltering_${state.day}_${radDanger ? 'rad' : 'safe'}`,
      speaker: 'GIL',
      headline: radDanger ? 'Shielded Inside!' : 'Inside Storm Shelter',
      body: radDanger
        ? 'All 5 crew & I are safe inside! Wait it out, tap END SOL, or tap Go Outside if you need urgent outdoor repairs (risks HP & radiation).'
        : 'Tasks are paused inside. Tap Go Outside anytime to resume outpost work.',
      scienceTip: state.activeEvent?.definition.scienceContext,
      descriptionSubject: state.activeEvent?.definition.title ?? 'Radiation Storm Shelter',
      descriptionImageKey: state.activeEvent?.definition.phenomenon ?? 'radiation_shelter',
      urgency: 'info',
      emotion: 'relieved',
    };
  }

  // 1. Urgent active environmental warning (only while event timer is still active)
  if (isEventOfficiallyActive(state.activeEvent) && state.activeEvent) {
    const evt = state.activeEvent.definition;
    if (evt.radiationLevel && !state.crew.inShelter) {
      return {
        id: `evt_rad_${state.day}`,
        speaker: 'GIL',
        headline: evt.severity === 'minor' ? `${evt.title} Outside!` : 'Radiation Alert!',
        body:
          state.buildings.radiation_shelter.status === 'inactive'
            ? 'Our Radiation Storm Shelter is still broken! Restore it quick before ending the sol!'
            : 'Let’s move the crew into the Radiation Storm Shelter until the rays pass!',
        scienceTip: evt.scienceContext,
        descriptionSubject: evt.title,
        descriptionImageKey: evt.phenomenon,
        urgency: evt.severity === 'minor' ? 'warning' : 'alert',
        emotion: 'worried',
      };
    }

    return {
      id: `evt_${evt.id}_${state.day}`,
      speaker: 'GIL',
      headline: evt.phenomenon === 'marsquake' ? 'That Was Shaky!' : evt.title,
      body: evt.recommendedAction,
      scienceTip: evt.scienceContext,
      descriptionSubject: evt.title,
      descriptionImageKey: evt.phenomenon,
      urgency: evt.severity === 'minor' ? 'warning' : 'alert',
      emotion: evt.phenomenon === 'marsquake' ? 'concerned' : 'worried',
    };
  }

  // 1b. Major decision outcome + future consequence warning
  if (state.modifiers.lastDecisionNote) {
    const note = state.modifiers.lastDecisionNote;
    return {
      id: note.id,
      speaker: 'GIL',
      headline: note.headline,
      body: `${note.outcome} ${note.futureWarning}`,
      urgency: note.urgency,
      emotion:
        note.urgency === 'alert'
          ? 'concerned'
          : note.urgency === 'warning'
          ? 'worried'
          : 'relieved',
    };
  }

  // 2. Plain-language resource shortage explanations
  if (shortages.length > 0) {
    const first = shortages[0];
    const hintMap = {
      oxygen: 'Air is getting low! Let’s run to the Oxygen Generation System and fix it!',
      water: 'Water is running low! Tap the Water Recovery System to save more water.',
      food: 'Food supplies are dipping! Check the Greenhouse to plant or harvest.',
      energy: 'Power is running low! Fix or dust the Solar Panels right away.',
    };
    return {
      id: `shortage_${first}_${state.day}`,
      speaker: 'GIL',
      headline: `Uh-Oh—${first.charAt(0).toUpperCase() + first.slice(1)} Is Low!`,
      body: hintMap[first],
      urgency: 'alert',
      emotion: 'concerned',
    };
  }

  // 3. Day 1 guided tutorial & arrival guidance
  if (state.day === 1) {
    const tutorialStep = getCurrentTutorialStep(state);
    if (tutorialStep) {
      return {
        id: `tutorial_step_${tutorialStep.step}`,
        speaker: 'GIL',
        headline: tutorialStep.headline,
        body: tutorialStep.body,
        scienceTip: tutorialStep.step === 0 ? NASA_REFERENCE_DATA[1].fact : undefined,
        descriptionSubject: tutorialStep.step === 0 ? 'Jezero Crater Weather (MEDA)' : undefined,
        descriptionImageKey: tutorialStep.step === 0 ? 'jezero' : undefined,
        urgency: 'info',
        emotion: tutorialStep.step === 3 || tutorialStep.step === 0 ? 'excited' : 'happy',
      };
    }

    const leaderName = state.playerName?.trim() || 'Commander';
    if (state.buildings.solar_panels.status === 'inactive') {
      return {
        id: 'day1_solar',
        speaker: 'GIL',
        headline: `Welcome to Jezero, ${leaderName}!`,
        body: 'Tap Solar Panels to restore power and unlock the Battery Bank.',
        scienceTip: NASA_REFERENCE_DATA[1].fact,
        descriptionSubject: 'Jezero Crater Weather (MEDA)',
        descriptionImageKey: 'jezero',
        urgency: 'info',
        emotion: 'excited',
      };
    }
    return {
      id: 'day1_done',
      speaker: 'GIL',
      headline: 'Power & Battery Bank Unlocked!',
      body: 'Restore Oxygen or Water Recovery next, or tap END SOL when ready.',
      urgency: 'info',
      emotion: 'relieved',
    };
  }

  // 3b. Contextual GIL guidance when encountering unfamiliar mechanics
  const mechanicHint = getActiveContextualMechanicHint(state);
  if (mechanicHint) {
    return {
      id: `mechanic_hint_${mechanicHint.id}`,
      speaker: 'GIL',
      headline: mechanicHint.headline,
      body: mechanicHint.body,
      mechanicHintId: mechanicHint.id,
      urgency: mechanicHint.urgency,
      emotion: mechanicHint.emotion,
    };
  }

  // 4. Greenhouse ready to harvest
  if (state.greenhouseCrop?.isMature) {
    return {
      id: `harvest_${state.day}`,
      speaker: 'GIL',
      headline: 'Crops Are Ready!',
      body: 'Tap Greenhouse to harvest fresh food and replant!',
      urgency: 'info',
      emotion: 'excited',
    };
  }

  // 5. Critical life-support restoration priorities
  if (state.buildings.oxygen_generator.status === 'inactive') {
    return {
      id: `o2_priority_${state.day}`,
      speaker: 'GIL',
      headline: 'Fix Oxygen System!',
      body: 'Restore Oxygen Generation so our crew breathes easy.',
      scienceTip: NASA_REFERENCE_DATA[0].fact,
      descriptionSubject: 'Oxygen From Mars Air',
      descriptionImageKey: 'oxygen_generator',
      urgency: 'warning',
      emotion: 'concerned',
    };
  }

  if (state.buildings.water_recycling.status === 'inactive') {
    return {
      id: `water_priority_${state.day}`,
      speaker: 'GIL',
      headline: 'Fix Water Recovery!',
      body: 'Restore Water Recovery to keep clean water flowing for crew and crops!',
      urgency: 'warning',
      emotion: 'concerned',
    };
  }

  if (state.buildings.greenhouse.status === 'inactive') {
    return {
      id: `greenhouse_priority_${state.day}`,
      speaker: 'GIL',
      headline: 'Rebuild Greenhouse!',
      body: 'Fix the Greenhouse so we can grow Martian food.',
      urgency: 'warning',
      emotion: 'excited',
    };
  }

  if (!state.greenhouseCrop && state.day <= 22) {
    return {
      id: `plant_prompt_${state.day}`,
      speaker: 'GIL',
      headline: 'Plant New Seeds!',
      body: 'Tap Greenhouse to plant Mars Potatoes or Wheat.',
      urgency: 'info',
      emotion: 'happy',
    };
  }

  if (state.buildings.radiation_shelter.status === 'inactive') {
    return {
      id: `shelter_prompt_${state.day}`,
      speaker: 'GIL',
      headline: 'Fix Storm Shelter!',
      body: 'Restore the Shelter to shield all 5 crew from storms.',
      scienceTip: NASA_REFERENCE_DATA[2].fact,
      descriptionSubject: 'Surface Radiation Protection',
      descriptionImageKey: 'radiation_shelter',
      urgency: 'warning',
      emotion: 'concerned',
    };
  }

  if (state.buildings.solar_panels.dustLevel >= 35) {
    return {
      id: `dust_prompt_${state.day}`,
      speaker: 'GIL',
      headline: 'Dusty Solar Panels!',
      body: `Red dust (${state.buildings.solar_panels.dustLevel}%) is blocking sunlight. Brush them clean!`,
      urgency: 'warning',
      emotion: 'concerned',
    };
  }

  if (state.day >= 26 && state.day < 29) {
    return {
      id: `prep_29_${state.day}`,
      speaker: 'GIL',
      headline: 'Giant Storm Coming Soon!',
      body: 'Sol 29 brings a global dust storm. Repair weak buildings now!',
      urgency: 'warning',
      emotion: 'worried',
    };
  }

  if (state.day === 30) {
    return {
      id: 'day30_final',
      speaker: 'GIL',
      headline: 'Sol 30—Final Stretch!',
      body: 'Fix any damage, then tap FINISH SOL 30!',
      urgency: 'info',
      emotion: 'excited',
    };
  }

  const refIdx = state.day % NASA_REFERENCE_DATA.length;
  const refImageKeys = ['oxygen_generator', 'jezero', 'radiation_shelter', 'solar_storm_response'];
  return {
    id: `steady_${state.day}`,
    speaker: 'GIL',
    headline: 'Systems Looking Good!',
    body: 'Keep facilities healthy and watch crew stamina.',
    scienceTip: NASA_REFERENCE_DATA[refIdx].fact,
    descriptionSubject: NASA_REFERENCE_DATA[refIdx].title,
    descriptionImageKey: refImageKeys[refIdx] ?? 'jezero',
    urgency: 'info',
    emotion: 'happy',
  };
}

export function getPostDaySummaryGilHint(
  state: GameState,
  prevSummary?: DaySummary | null
): GilMessage | null {
  const shortages = detectResourceShortages(state.resources);
  const recentWindowCount = (state.gilAnnouncementDays ?? []).filter(
    (d) => state.day - d < 10
  ).length;
  const lastDay =
    state.gilAnnouncementDays && state.gilAnnouncementDays.length > 0
      ? state.gilAnnouncementDays[state.gilAnnouncementDays.length - 1]
      : -99;
  const daysSinceLast = state.day - lastDay;
  const hasBudget = recentWindowCount < 4 && daysSinceLast >= 2;

  // 1. Critical resource shortages always warrant an urgent centered report (at most every other day)
  if (shortages.length > 0 && daysSinceLast >= 2) {
    const res = shortages[0];
    const targetHint =
      res === 'oxygen'
        ? 'Check the Oxygen Generation System right away!'
        : res === 'water'
        ? 'Check the Water Recovery System to save more water!'
        : res === 'food'
        ? 'Visit the Greenhouse to plant or harvest food!'
        : 'Brush dust off or repair the Solar Panels!';
    return {
      id: `hint_shortage_${state.day}`,
      speaker: 'GIL',
      headline: `Critical Alert on Sol ${state.day}!`,
      body: `Our ${res} reserve is running low. ${targetHint}`,
      urgency: 'alert',
      emotion: 'worried',
    };
  }

  // 2. Major upcoming event briefings & Final Sol readiness report
  if (state.day === 8) {
    return {
      id: 'hint_solar_storm_prep_8',
      speaker: 'GIL',
      headline: 'Solar Storm Forecast — Sol 9!',
      body: 'Orbital sensors spotted a Big Solar Storm arriving next sol! Restore your Radiation Storm Shelter and charge power reserves today.',
      urgency: 'warning',
      emotion: 'worried',
    };
  }

  if (state.day === 19) {
    return {
      id: 'hint_sep_prep_19',
      speaker: 'GIL',
      headline: 'Solar Particle Warning — Sol 20!',
      body: 'Fast Sun Sparks arrive next sol! Make sure the Radiation Storm Shelter, Oxygen system, and Batteries are ready.',
      urgency: 'warning',
      emotion: 'worried',
    };
  }

  if (state.day === 28) {
    return {
      id: 'hint_storm_prep_28',
      speaker: 'GIL',
      headline: 'Giant Dust Storm Ahead!',
      body: 'A planet-wide dust storm hits on Sol 29! Repair weak systems and top off all reserves while skies are clear.',
      urgency: 'warning',
      emotion: 'worried',
    };
  }

  if (state.day === 30) {
    return {
      id: 'hint_day30',
      speaker: 'GIL',
      headline: 'Final Sol on Mars!',
      body: 'We made it to Sol 30! Repair any leftover damage before our 150-sol sustainability assessment.',
      urgency: 'info',
      emotion: 'excited',
    };
  }

  // 3. Major event aftermath / severe multi-system damage report (skip repetitive minor-event scratches!)
  const hadMajorYesterday =
    prevSummary &&
    state.eventHistory.some(
      (e) => e.day === prevSummary.day && e.severity !== 'minor'
    );
  const weakBuildingsCount = Object.values(state.buildings).filter(
    (b) => b.status === 'inactive' || b.condition < 50
  ).length;

  if (hadMajorYesterday && daysSinceLast >= 1) {
    const firstHit = prevSummary?.buildingImpacts?.[0]
      ? BUILDING_DEFINITIONS[prevSummary.buildingImpacts[0].buildingId].name
      : 'outpost systems';
    return {
      id: `hint_major_aftermath_${state.day}`,
      speaker: 'GIL',
      headline: `Sol ${state.day} Storm Damage Report`,
      body: `Last sol’s major storm impacted ${firstHit}. Check damaged facilities and crew health (${state.crew.condition}%) today!`,
      urgency: 'warning',
      emotion: 'concerned',
    };
  }

  if ((state.lingeringHazards?.length ?? 0) > 0 && state.crew.condition <= 75 && daysSinceLast >= 1) {
    const hazard = state.lingeringHazards[0];
    return {
      id: `hint_lingering_hazard_${state.day}`,
      speaker: 'GIL',
      headline: `${hazard.label} Warning`,
      body: `Post-storm conditions are wearing down crew health (${state.crew.condition}%). ${hazard.clearActionHint}, or shelter crew until conditions clear!`,
      urgency: 'warning',
      emotion: 'worried',
    };
  }

  // 4. Budget-gated important reports (~4 total centered appearances per 10 sols)
  if (!hasBudget) {
    return null;
  }

  if (state.day === 2) {
    const leaderName = state.playerName?.trim() || 'Commander';
    return {
      id: 'hint_phase2_start',
      speaker: 'GIL',
      headline: 'Phase 2: Establish the Outpost!',
      body: `Great start, ${leaderName}! Focus on restoring Oxygen, Water Recovery, and the Greenhouse so crops start growing early.`,
      urgency: 'info',
      emotion: 'excited',
    };
  }

  if (state.day === 12 && weakBuildingsCount >= 2) {
    return {
      id: 'hint_phase3_report',
      speaker: 'GIL',
      headline: 'Phase 3 Systems Report',
      body: 'Mid-mission checkup: several outpost systems need repairs. Keep Greenhouse crops cycling and shelter ready!',
      urgency: 'warning',
      emotion: 'concerned',
    };
  }

  if (state.greenhouseCrop?.isMature) {
    return {
      id: `hint_harvest_${state.day}`,
      speaker: 'GIL',
      headline: `Harvest Report — Sol ${state.day}!`,
      body: 'Greenhouse crops are ripe and ready! Harvest them soon and replant seeds for the next cycle.',
      urgency: 'info',
      emotion: 'excited',
    };
  }

  if (prevSummary?.fatiguePenalty && prevSummary.fatiguePenalty >= 16) {
    return {
      id: `hint_fatigue_${state.day}`,
      speaker: 'GIL',
      headline: `Crew Fatigue Report — Sol ${state.day}`,
      body: 'The crew worked deep into overtime last sol! Finish tasks before 9:00 PM or tap Rest to recover stamina.',
      urgency: 'warning',
      emotion: 'concerned',
    };
  }

  if (state.day === 5 && state.buildings.oxygen_generator.status === 'inactive') {
    return {
      id: `hint_o2_${state.day}`,
      speaker: 'GIL',
      headline: 'Life Support Priority Report',
      body: 'Our Oxygen Generation System is still offline! Restoring it keeps breathable air steady for the crew.',
      urgency: 'warning',
      emotion: 'concerned',
    };
  }

  if (state.day === 15 && state.buildings.radiation_shelter.status === 'inactive') {
    return {
      id: `hint_shelter_${state.day}`,
      speaker: 'GIL',
      headline: 'Storm Safety Report',
      body: 'The Radiation Storm Shelter is still offline. Restoring it protects Brent, MJ, Darryl, and Magno from storms!',
      urgency: 'warning',
      emotion: 'concerned',
    };
  }

  if (state.day === 24 && state.crew.condition < 70) {
    return {
      id: `hint_health_24`,
      speaker: 'GIL',
      headline: 'Crew Health Advisory',
      body: `Crew health is at ${state.crew.condition}%. Keep the Habitat operational and use the Radiation Storm Shelter during disasters!`,
      urgency: 'warning',
      emotion: 'concerned',
    };
  }

  return null;
}
