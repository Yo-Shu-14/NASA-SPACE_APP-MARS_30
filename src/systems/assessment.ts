import { getFacilityDailyProduction } from '../data/balance';
import { BUILDING_LIST } from '../data/buildings';
import {
  GameState,
  MandatoryCheckResult,
  SustainabilityAssessment,
  SustainabilityCriterion,
  SustainabilityOutcome,
} from '../types/game';
import { calculateDailyRates } from './resources';
import { getOperationalBuildingCount } from './buildings';

function scoreToStatus(score: number): 'pass' | 'warning' | 'fail' {
  if (score >= 75) return 'pass';
  if (score >= 45) return 'warning';
  return 'fail';
}

export function evaluateSustainability(state: GameState): SustainabilityAssessment {
  const rates = calculateDailyRates({
    buildings: state.buildings,
    currentResources: state.resources,
    greenhouseCrop: state.greenhouseCrop,
    activeEvent: null,
    modifiers: state.modifiers,
    difficulty: state.difficulty,
  });

  const essentialBuildings = BUILDING_LIST.filter((def) => def.isCritical);
  const nonOperationalEssentials = essentialBuildings.filter((def) => {
    const b = state.buildings[def.id];
    return b.status !== 'operational' || (b.malfunctionDaysRemaining ?? 0) > 0;
  });

  const isActiveClean = (id: keyof typeof state.buildings) => {
    const b = state.buildings[id];
    return b.status === 'operational' && (b.malfunctionDaysRemaining ?? 0) <= 0;
  };

  // 1. Oxygen: production >= crew consumption + healthy reserves (150-sol projection)
  const o2Operational = isActiveClean('oxygen_generator');
  const o2NominalProd = getFacilityDailyProduction('oxygen_generator', state.difficulty).oxygen ?? 12;
  const o2NominalNet = o2NominalProd - rates.consumption.oxygen;
  const o2Projected150 = state.resources.oxygen + rates.net.oxygen.net * 150;
  const o2Sustained150 =
    o2Operational &&
    ((rates.net.oxygen.net > 0 && o2Projected150 > 0) ||
      (rates.net.oxygen.net === 0 && state.resources.oxygen >= 5) ||
      (o2NominalNet >= 0 && state.resources.oxygen >= 5));
  const o2Score = Math.min(
    100,
    (o2Operational ? 25 : state.buildings.oxygen_generator.status === 'damaged' ? 10 : 0) +
      (rates.net.oxygen.net >= 2
        ? 60
        : rates.net.oxygen.net >= 0 || o2NominalNet >= 0
        ? 48
        : o2Projected150 > 0
        ? 30
        : 10) +
      Math.min(15, Math.round((state.resources.oxygen / 80) * 15))
  );

  // 2. Water: recycling active + steady reserves (150-sol projection)
  const waterOperational =
    isActiveClean('water_recycling') && (state.buildings.water_recycling.frostLevel ?? 0) < 25;
  const waterNominalProd =
    getFacilityDailyProduction('water_recycling', state.difficulty).water ?? 12;
  const waterNominalNet = waterNominalProd - rates.consumption.water;
  const waterProjected150 = state.resources.water + rates.net.water.net * 150;
  const waterSustained150 =
    waterOperational &&
    ((rates.net.water.net > 0 && waterProjected150 > 0) ||
      (rates.net.water.net === 0 && state.resources.water >= 5) ||
      (waterNominalNet >= 0 && state.resources.water >= 5));
  const waterScore = Math.min(
    100,
    (waterOperational ? 45 : state.buildings.water_recycling.status === 'damaged' ? 20 : 0) +
      (rates.net.water.net >= 1
        ? 35
        : rates.net.water.net >= 0 || waterNominalNet >= 0
        ? 28
        : waterProjected150 > 0
        ? 20
        : 5) +
      Math.min(20, Math.round((state.resources.water / 80) * 20))
  );

  // 3. Food: greenhouse operational + crop/harvests + reserves (150-sol projection)
  const greenhouseOperational = isActiveClean('greenhouse');
  const hasCropOrHarvest = Boolean(state.greenhouseCrop) || state.harvestCount > 0;
  const amortizedCropFoodPerSol = hasCropOrHarvest ? 8 : 0;
  const foodNominalProd = getFacilityDailyProduction('greenhouse', state.difficulty).food ?? 4;
  const foodNominalNet = foodNominalProd + amortizedCropFoodPerSol - rates.consumption.food;
  const foodProjected150 =
    state.resources.food + (rates.net.food.net + amortizedCropFoodPerSol) * 150;
  const foodSustained150 =
    greenhouseOperational &&
    (rates.net.food.net > 0 || hasCropOrHarvest) &&
    ((foodProjected150 > 0 && state.resources.food >= 5) ||
      (foodNominalNet >= 0 && state.resources.food >= 5));
  const foodScore = Math.min(
    100,
    (greenhouseOperational ? 45 : state.buildings.greenhouse.status === 'damaged' ? 20 : 0) +
      (state.harvestCount > 0 ? 25 : state.greenhouseCrop ? 18 : 0) +
      Math.min(30, Math.round((state.resources.food / 60) * 30))
  );

  // 4. Energy: solar generation covers facility load (150-sol projection; battery bank is optional bonus)
  const solarOperational =
    isActiveClean('solar_panels') && state.buildings.solar_panels.dustLevel < 50;
  const solarNominalProd =
    getFacilityDailyProduction('solar_panels', state.difficulty).energy ?? 16;
  const solarNominalNet = solarNominalProd - rates.consumption.energy;
  const batteryOperational = state.buildings.energy_storage.status !== 'inactive';
  const energyProjected150 = state.resources.energy + rates.net.energy.net * 150;
  const energySustained150 =
    solarOperational &&
    ((rates.net.energy.net > 0 && energyProjected150 > 0) ||
      (rates.net.energy.net === 0 && state.resources.energy >= 5) ||
      (solarNominalNet >= 0 && state.resources.energy >= 5));
  const energyScore = Math.min(
    100,
    (rates.net.energy.net >= 2
      ? 55
      : rates.net.energy.net >= 0 || solarNominalNet >= 0
      ? 45
      : energyProjected150 > 0
      ? 32
      : 10) +
      (solarOperational ? 25 : state.buildings.solar_panels.status === 'damaged' ? 10 : 0) +
      (batteryOperational ? 10 : 0) +
      Math.min(10, Math.round((state.resources.energy / 80) * 10))
  );

  // 5. Infrastructure reliability (heavily weights essential systems; optional systems are bonus)
  const essentialOperationalCount = essentialBuildings.length - nonOperationalEssentials.length;
  const avgEssentialCondition = Math.round(
    essentialBuildings.reduce((sum, def) => sum + state.buildings[def.id].condition, 0) /
      essentialBuildings.length
  );
  const operationalCount = getOperationalBuildingCount(state.buildings);
  const infraScore = Math.min(
    100,
    Math.round(
      avgEssentialCondition * 0.5 +
        (essentialOperationalCount / essentialBuildings.length) * 40 +
        ((operationalCount - essentialOperationalCount) /
          Math.max(1, BUILDING_LIST.length - essentialBuildings.length)) *
          10
    )
  );

  // 6. Crew health & condition
  const crewHealthPassed = state.crew.condition >= 50;
  const crewScore = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        state.crew.condition * 0.75 +
          state.crew.energy * 0.25 -
          state.crew.radiationExposure * 0.15
      )
    )
  );

  // 7. Radiation shielding
  const shelter = state.buildings.radiation_shelter;
  const shelterOperational = isActiveClean('radiation_shelter');
  const radScore = Math.min(
    100,
    Math.max(
      0,
      (shelterOperational ? 65 : shelter.status === 'damaged' ? 30 : 0) +
        Math.round(shelter.condition * 0.35) -
        Math.round(state.crew.radiationExposure * 0.2)
    )
  );

  // 8. Mandatory mission objectives (5 major essential restorations + clean solar + active greenhouse)
  const mandatoryRestoredIds = [
    'solar_panels',
    'oxygen_generator',
    'water_recycling',
    'greenhouse',
    'radiation_shelter',
  ] as const;
  const missingRestorations = mandatoryRestoredIds.filter(
    (id) => !state.buildings[id].restoredOnce || !isActiveClean(id)
  );
  const mandatoryObjectivesPassed =
    missingRestorations.length === 0 &&
    isActiveClean('main_habitat') &&
    state.buildings.solar_panels.dustLevel < 50;

  const mandatoryChecks: MandatoryCheckResult[] = [
    {
      id: 'essential_infra',
      label: 'All Essential Facilities Operational',
      passed: nonOperationalEssentials.length === 0,
      detail:
        nonOperationalEssentials.length === 0
          ? `${essentialBuildings.length}/${essentialBuildings.length} essential facilities active`
          : `Offline/Faulted: ${nonOperationalEssentials.map((b) => b.shortName).join(', ')}`,
    },
    {
      id: 'mandatory_objectives',
      label: 'Mandatory Objectives Completed',
      passed: mandatoryObjectivesPassed,
      detail: mandatoryObjectivesPassed
        ? 'All essential restorations & solar cleaning complete'
        : state.buildings.solar_panels.dustLevel >= 50
        ? 'Solar Panels remain heavily coated in dust'
        : `Incomplete: ${missingRestorations.join(', ')}`,
    },
    {
      id: 'crew_health',
      label: 'Crew Health >= 50%',
      passed: crewHealthPassed,
      detail: `Crew Health: ${state.crew.condition}%`,
    },
    {
      id: 'o2_150',
      label: '150-Sol Oxygen Supply',
      passed: o2Sustained150,
      detail: `Net ${rates.net.oxygen.net >= 0 ? '+' : ''}${rates.net.oxygen.net}/sol · Reserve ${state.resources.oxygen}`,
    },
    {
      id: 'water_150',
      label: '150-Sol Water Supply',
      passed: waterSustained150,
      detail: `Net ${rates.net.water.net >= 0 ? '+' : ''}${rates.net.water.net}/sol · Reserve ${state.resources.water}`,
    },
    {
      id: 'food_150',
      label: '150-Sol Food Supply',
      passed: foodSustained150,
      detail: `Net ${rates.net.food.net >= 0 ? '+' : ''}${rates.net.food.net}/sol · Reserve ${state.resources.food}`,
    },
    {
      id: 'energy_150',
      label: '150-Sol Energy Supply',
      passed: energySustained150,
      detail: `Net ${rates.net.energy.net >= 0 ? '+' : ''}${rates.net.energy.net}/sol · Reserve ${state.resources.energy}`,
    },
  ];

  const failureReasons: string[] = mandatoryChecks
    .filter((c) => !c.passed)
    .map((c) => `${c.label} (${c.detail})`);

  const passed = mandatoryChecks.every((c) => c.passed);

  const criteria: SustainabilityCriterion[] = [
    {
      id: 'oxygen',
      label: 'Oxygen Loop',
      status: o2Sustained150 ? scoreToStatus(o2Score) : 'fail',
      score: o2Score,
      detail: `Net ${rates.net.oxygen.net >= 0 ? '+' : ''}${rates.net.oxygen.net}/sol · Reserve ${state.resources.oxygen} O2`,
    },
    {
      id: 'water',
      label: 'Water Recycling',
      status: waterSustained150 ? scoreToStatus(waterScore) : 'fail',
      score: waterScore,
      detail: `Net ${rates.net.water.net >= 0 ? '+' : ''}${rates.net.water.net}/sol · Reserve ${state.resources.water} H2O`,
    },
    {
      id: 'food',
      label: 'Food Production',
      status: foodSustained150 ? scoreToStatus(foodScore) : 'fail',
      score: foodScore,
      detail: `${state.harvestCount} harvest(s) · ${state.greenhouseCrop ? 'Crop active' : 'No crop planted'} · ${state.resources.food} kcal`,
    },
    {
      id: 'energy',
      label: 'Solar Power Loop',
      status: energySustained150 ? scoreToStatus(energyScore) : 'fail',
      score: energyScore,
      detail: `Net ${rates.net.energy.net >= 0 ? '+' : ''}${rates.net.energy.net}/sol · Reserve ${state.resources.energy} kWh`,
    },
    {
      id: 'infrastructure',
      label: 'Essential Infrastructure',
      status: nonOperationalEssentials.length === 0 ? scoreToStatus(infraScore) : 'fail',
      score: infraScore,
      detail: `${essentialOperationalCount}/${essentialBuildings.length} essential · ${operationalCount}/${BUILDING_LIST.length} total active`,
    },
    {
      id: 'crew',
      label: 'Crew Health',
      status: crewHealthPassed ? scoreToStatus(crewScore) : 'fail',
      score: crewScore,
      detail: `Health ${state.crew.condition}% · Radiation ${state.crew.radiationExposure}%`,
    },
    {
      id: 'radiation',
      label: 'Radiation Shielding',
      status: shelterOperational ? scoreToStatus(radScore) : 'fail',
      score: radScore,
      detail: `Shelter ${shelter.status} (${shelter.condition}%)`,
    },
  ];

  const overallScore = Math.round(
    criteria.reduce((sum, c) => sum + c.score, 0) / criteria.length
  );

  const leaderName = state.playerName?.trim() || 'Commander';
  let outcome: SustainabilityOutcome;
  let summary: string;

  if (passed) {
    const hasHighBuffer = overallScore >= 78 && state.crew.condition >= 75;
    outcome = hasHighBuffer ? 'Sustainable' : 'Sustainable with Improvements';
    summary = hasHighBuffer
      ? `Victory! Under ${leaderName}’s command, all essential outpost systems are operational, crew health is strong (${state.crew.condition}%), and resource loops sustain another 150 sols.`
      : `Victory! ${leaderName} passed every mandatory 150-sol survival requirement—all essential systems are active and reserves hold, though restoring optional storage and Workshop facilities would build extra safety margin.`;
  } else {
    outcome = 'Unsustainable';
    summary = `Reaching Sol 30 is not enough: ${leaderName}’s outpost failed the 150-Sol Sustainability Assessment because: ${failureReasons.join('; ')}.`;
  }

  return {
    passed,
    outcome,
    overallScore,
    summary,
    failureReasons,
    mandatoryChecks,
    criteria,
    daysSurvived: state.day,
    facilitiesOperational: operationalCount,
    totalFacilities: BUILDING_LIST.length,
    keyDecisions: state.keyDecisions.slice(-6),
  };
}
