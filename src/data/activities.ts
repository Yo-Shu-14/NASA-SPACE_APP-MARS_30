import { BUILDING_DEFINITIONS } from './buildings';
import {
  ActivityReward,
  CrewMemberId,
  CrewSpecialistProfile,
  DailyActivityTemplate,
} from '../types/activity';
import { BuildingId } from '../types/building';

export const CREW_SPECIALISTS: Record<CrewMemberId, CrewSpecialistProfile> = {
  Player: {
    id: 'Player',
    name: 'Commander',
    role: 'Mission Commander',
    specialty: 'Field Ops & Command',
    favoredCategories: ['exploration', 'crew'],
  },
  Brent: {
    id: 'Brent',
    name: 'Brent',
    role: 'Power Specialist',
    specialty: 'Electrical & Array Tuning',
    favoredCategories: ['maintenance', 'research'],
  },
  MJ: {
    id: 'MJ',
    name: 'MJ',
    role: 'Bio-Systems Engineer',
    specialty: 'Hydroponics & Air Scrubbers',
    favoredCategories: ['research', 'crew'],
  },
  Darryl: {
    id: 'Darryl',
    name: 'Darryl',
    role: 'Safety & Geology Lead',
    specialty: 'Radiation Shielding & Surveys',
    favoredCategories: ['exploration', 'crew'],
  },
  Magno: {
    id: 'Magno',
    name: 'Magno',
    role: 'Systems Technician',
    specialty: 'Hydraulics & Diagnostics',
    favoredCategories: ['maintenance', 'exploration'],
  },
};

export function formatActivityRewardSummary(reward: ActivityReward, targetBuildingId?: BuildingId): string {
  const parts: string[] = [];
  if (reward.resourcesDelta) {
    if (reward.resourcesDelta.energy) parts.push(`+${reward.resourcesDelta.energy} Energy`);
    if (reward.resourcesDelta.oxygen) parts.push(`+${reward.resourcesDelta.oxygen} O2`);
    if (reward.resourcesDelta.water) parts.push(`+${reward.resourcesDelta.water} Water`);
    if (reward.resourcesDelta.food) parts.push(`+${reward.resourcesDelta.food} Food`);
  }
  if (reward.buildingConditionDelta && reward.buildingConditionDelta > 0) {
    const bName = targetBuildingId ? BUILDING_DEFINITIONS[targetBuildingId].shortName : 'Facility';
    parts.push(`+${reward.buildingConditionDelta}% ${bName}`);
  }
  if (reward.dustCleared && reward.dustCleared > 0) {
    parts.push(`-${reward.dustCleared}% Dust`);
  }
  if (reward.crewEnergyDelta && reward.crewEnergyDelta > 0) {
    parts.push(`+${reward.crewEnergyDelta}% Stamina`);
  }
  if (reward.crewHealthDelta && reward.crewHealthDelta > 0) {
    parts.push(`+${reward.crewHealthDelta}% Crew HP`);
  }
  if (reward.crewRadiationDelta && reward.crewRadiationDelta < 0) {
    parts.push(`${reward.crewRadiationDelta}% Rad`);
  }
  if (reward.solarOutputBonusPctDelta && reward.solarOutputBonusPctDelta > 0) {
    parts.push(`+${reward.solarOutputBonusPctDelta}% Solar Output`);
  }
  if (reward.cropBoostDays && reward.cropBoostDays > 0) {
    parts.push(`+${reward.cropBoostDays}d Crop Boost`);
  }
  return parts.join(' · ') || 'Colony readiness boost';
}

const OPERATIONAL_SYSTEM_IDS: BuildingId[] = [
  'main_habitat',
  'solar_panels',
  'oxygen_generator',
  'water_recycling',
  'greenhouse',
  'radiation_shelter',
  'energy_storage',
  'oxygen_storage',
  'water_storage',
  'food_storage',
  'maintenance_facility',
];

export const DAILY_ACTIVITY_TEMPLATES: DailyActivityTemplate[] = [
  // ======================== MAINTENANCE ========================
  {
    id: 'maint_preventive_seal_sweep',
    category: 'maintenance',
    title: 'Preventive Seal & Weld Sweep',
    shortDesc: 'Inspect pressure gaskets and reinforce hairline wear before leaks form.',
    defaultBuildingId: 'main_habitat',
    isOutdoor: false,
    recommendedCrew: 'Magno',
    skillLabel: 'Systems Tech',
    skillBonusLabel: 'Magno adds +4% structural seal bonus',
    durationHours: 1,
    workDurationSec: 2.2,
    crewEnergyCost: 6,
    resourceCost: { energy: 3 },
    cooldownSols: 4,
    minDay: 2,
    baseReward: { buildingConditionDelta: 12 },
    evaluateContext: ({ buildings }) => {
      const candidates = OPERATIONAL_SYSTEM_IDS
        .map((id) => ({ id, b: buildings[id] }))
        .filter(({ b }) => b.status === 'operational' && b.condition >= 65 && b.condition < 94)
        .sort((a, b) => a.b.condition - b.b.condition);
      const target = candidates[0];
      if (!target) {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      const bName = BUILDING_DEFINITIONS[target.id].shortName;
      const isIndoor = target.id === 'main_habitat' || target.id === 'radiation_shelter';
      return {
        eligible: true,
        weight: target.b.condition < 82 ? 85 : 58,
        targetBuildingId: target.id,
        relevanceReason: `${bName} is at ${target.b.condition}% condition — preventive seal sweep avoids breakdowns.`,
        rewardOverrides: isIndoor
          ? { buildingConditionDelta: 12 }
          : { buildingConditionDelta: 12, resourcesDelta: { energy: 2 } },
      };
    },
  },
  {
    id: 'maint_solar_junction_tune',
    category: 'maintenance',
    title: 'Solar Bus & Dust Brush Check',
    shortDesc: 'Tighten photovoltaic junction relays and sweep light surface grit.',
    defaultBuildingId: 'solar_panels',
    isOutdoor: true,
    recommendedCrew: 'Brent',
    skillLabel: 'Power Spec',
    skillBonusLabel: 'Brent recovers +4 Energy during bus alignment',
    durationHours: 1,
    workDurationSec: 2.2,
    crewEnergyCost: 7,
    resourceCost: {},
    cooldownSols: 4,
    minDay: 2,
    baseReward: { dustCleared: 18, buildingConditionDelta: 8, resourcesDelta: { energy: 4 } },
    evaluateContext: ({ buildings }) => {
      const solar = buildings.solar_panels;
      if (solar.status === 'inactive' || (solar.dustLevel < 12 && solar.condition >= 94)) {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      return {
        eligible: true,
        weight: solar.dustLevel >= 22 ? 82 : 60,
        targetBuildingId: 'solar_panels',
        relevanceReason: `Solar Panels show ${solar.dustLevel}% dust & ${solar.condition}% condition.`,
      };
    },
  },
  {
    id: 'maint_battery_bus_balance',
    category: 'maintenance',
    title: 'Battery Cell Thermal Balance',
    shortDesc: 'Equalize charge across battery cells to reduce overnight voltage drift.',
    defaultBuildingId: 'energy_storage',
    isOutdoor: true,
    recommendedCrew: 'Brent',
    skillLabel: 'Power Spec',
    skillBonusLabel: 'Brent boosts cell equalization yield (+6 Energy)',
    durationHours: 1,
    workDurationSec: 2.2,
    crewEnergyCost: 6,
    resourceCost: {},
    cooldownSols: 5,
    minDay: 3,
    baseReward: { buildingConditionDelta: 10, resourcesDelta: { energy: 6 } },
    evaluateContext: ({ buildings, resources, activeEvent }) => {
      const batt = buildings.energy_storage;
      if (!batt.restoredOnce || batt.status === 'inactive') {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      const lowPower = resources.energy < 50;
      const postSurge =
        activeEvent?.definition.phenomenon === 'solar_storm_response' ||
        activeEvent?.definition.phenomenon === 'solar_energetic_particles' ||
        activeEvent?.definition.phenomenon === 'solar_flare_xray_uv';
      if (!lowPower && !postSurge && batt.condition >= 94) {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      return {
        eligible: true,
        weight: postSurge || lowPower ? 84 : 56,
        targetBuildingId: 'energy_storage',
        relevanceReason: postSurge
          ? 'Solar surge telemetry recommends equalizing Battery Bank cells.'
          : lowPower
          ? 'Energy reserves are tight — balancing cells recovers stored charge.'
          : `Battery Bank at ${batt.condition}% condition benefits from cell balancing.`,
      };
    },
  },
  {
    id: 'maint_water_valve_flush',
    category: 'maintenance',
    title: 'Hydraulics Valve & Filter Flush',
    shortDesc: 'Clear mineral buildup inside Water Recovery manifolds and pump seals.',
    defaultBuildingId: 'water_recycling',
    isOutdoor: true,
    recommendedCrew: 'Magno',
    skillLabel: 'Hydraulics',
    skillBonusLabel: 'Magno recovers +5 Water during line purge',
    durationHours: 2,
    workDurationSec: 2.4,
    crewEnergyCost: 8,
    resourceCost: { energy: 4 },
    cooldownSols: 5,
    minDay: 3,
    baseReward: { buildingConditionDelta: 11, resourcesDelta: { water: 5 } },
    evaluateContext: ({ buildings, resources }) => {
      const wRec = buildings.water_recycling;
      if (!wRec.restoredOnce || wRec.status === 'inactive') {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      if (wRec.condition >= 94 && resources.water >= 55 && (wRec.frostLevel ?? 0) === 0) {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      return {
        eligible: true,
        weight: resources.water < 45 || (wRec.frostLevel ?? 0) > 0 ? 84 : 62,
        targetBuildingId: 'water_recycling',
        relevanceReason:
          resources.water < 45
            ? 'Water reserves are dipping — flushing manifolds recovers trapped condensate.'
            : `Water Recovery at ${wRec.condition}% condition needs routine filter descaling.`,
      };
    },
  },
  {
    id: 'maint_workshop_lathe_cal',
    category: 'maintenance',
    title: 'Workshop Tool & CNC Calibration',
    shortDesc: 'Align fabrication jigs and inventory spare gaskets for faster repairs.',
    defaultBuildingId: 'maintenance_facility',
    isOutdoor: true,
    recommendedCrew: 'Magno',
    skillLabel: 'Fabrication',
    skillBonusLabel: 'Magno restores +14% Workshop condition',
    durationHours: 1,
    workDurationSec: 2.2,
    crewEnergyCost: 6,
    resourceCost: { energy: 3 },
    cooldownSols: 6,
    minDay: 4,
    baseReward: { buildingConditionDelta: 14, resourcesDelta: { oxygen: 3 } },
    evaluateContext: ({ buildings }) => {
      const shop = buildings.maintenance_facility;
      if (!shop.restoredOnce || shop.status === 'inactive' || shop.condition >= 95) {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      return {
        eligible: true,
        weight: shop.condition < 80 ? 78 : 52,
        targetBuildingId: 'maintenance_facility',
        relevanceReason: `Maintenance Workshop at ${shop.condition}% — calibrating tools keeps repair bonuses active.`,
      };
    },
  },

  // ======================== RESEARCH ========================
  {
    id: 'res_meda_dust_optics',
    category: 'research',
    title: 'MEDA Dust Opacity Calibration',
    shortDesc: 'Log Jezero atmospheric tau scattering to angle arrays for peak sunlight.',
    defaultBuildingId: 'solar_panels',
    isOutdoor: true,
    recommendedCrew: 'Brent',
    skillLabel: 'Solar Optics',
    skillBonusLabel: 'Brent unlocks +2% Solar Output efficiency',
    durationHours: 2,
    workDurationSec: 2.5,
    crewEnergyCost: 8,
    resourceCost: { energy: 2 },
    cooldownSols: 6,
    minDay: 3,
    baseReward: { solarOutputBonusPctDelta: 2, resourcesDelta: { energy: 6 } },
    evaluateContext: ({ buildings, lingeringHazards, activeEvent }) => {
      if (!buildings.solar_panels.restoredOnce || buildings.solar_panels.status === 'inactive') {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      const dustyWeather =
        buildings.solar_panels.dustLevel >= 15 ||
        lingeringHazards.some((h) => h.kind === 'toxic_dust') ||
        activeEvent?.definition.phenomenon === 'dust_devils' ||
        activeEvent?.definition.phenomenon === 'global_dust_storm';
      return {
        eligible: true,
        weight: dustyWeather ? 82 : 56,
        targetBuildingId: 'solar_panels',
        relevanceReason: dustyWeather
          ? 'Elevated atmospheric dust creates valuable optical calibration data.'
          : 'Clear Jezero skies let Brent fine-tune photovoltaic tracking angles.',
      };
    },
  },
  {
    id: 'res_moxie_cathode_trial',
    category: 'research',
    title: 'MOXIE Electrolysis Tuning',
    shortDesc: 'Test higher-efficiency CO2-to-O2 solid-oxide runs for extra breathable air.',
    defaultBuildingId: 'oxygen_generator',
    isOutdoor: true,
    recommendedCrew: 'MJ',
    skillLabel: 'Bio-Systems',
    skillBonusLabel: 'MJ extracts +10 Oxygen from tuned cycle',
    durationHours: 2,
    workDurationSec: 2.4,
    crewEnergyCost: 8,
    resourceCost: { energy: 5 },
    cooldownSols: 5,
    minDay: 2,
    baseReward: { resourcesDelta: { oxygen: 10 }, buildingConditionDelta: 6 },
    evaluateContext: ({ buildings, resources }) => {
      const o2 = buildings.oxygen_generator;
      if (!o2.restoredOnce || o2.status === 'inactive' || resources.energy < 14) {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      const lowAir = resources.oxygen < 58;
      return {
        eligible: true,
        weight: lowAir ? 86 : 58,
        targetBuildingId: 'oxygen_generator',
        relevanceReason: lowAir
          ? 'Oxygen reserves are below target — tuning MOXIE cells boosts daily O2 supply.'
          : 'Stable power allows an experimental CO2 electrolysis efficiency run.',
      };
    },
  },
  {
    id: 'res_par_hydroponic_trial',
    category: 'research',
    title: 'Hydroponic PAR Spectrum Study',
    shortDesc: 'Optimize grow-light wavelengths and nutrient dosing inside the Greenhouse.',
    defaultBuildingId: 'greenhouse',
    isOutdoor: false,
    recommendedCrew: 'MJ',
    skillLabel: 'Botany & Bio',
    skillBonusLabel: 'MJ grants +1d Crop Boost & +3 Food',
    durationHours: 2,
    workDurationSec: 2.3,
    crewEnergyCost: 7,
    resourceCost: { energy: 3, water: 3 },
    cooldownSols: 5,
    minDay: 3,
    baseReward: { cropBoostDays: 1, resourcesDelta: { food: 3 } },
    evaluateContext: ({ buildings, greenhouseCrop, resources }) => {
      const gh = buildings.greenhouse;
      if (!gh.restoredOnce || gh.status === 'inactive' || resources.water < 15) {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      if (!greenhouseCrop && resources.food >= 55) {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      return {
        eligible: true,
        weight: greenhouseCrop && !greenhouseCrop.isMature ? 82 : 55,
        targetBuildingId: 'greenhouse',
        relevanceReason: greenhouseCrop
          ? 'Active crops respond strongly to calibrated PAR spectrum lighting.'
          : 'Food reserves could benefit from hydroponic micro-greens testing.',
      };
    },
  },
  {
    id: 'res_rad_shielding_log',
    category: 'research',
    title: 'RAD Dosimetry & Shielding Audit',
    shortDesc: 'Map regolith shielding attenuation inside the Shelter to cut crew dose.',
    defaultBuildingId: 'radiation_shelter',
    isOutdoor: false,
    recommendedCrew: 'Darryl',
    skillLabel: 'Rad Safety',
    skillBonusLabel: 'Darryl cuts -6% Radiation & reinforces Shelter',
    durationHours: 1,
    workDurationSec: 2.1,
    crewEnergyCost: 5,
    resourceCost: { energy: 2 },
    cooldownSols: 4,
    minDay: 3,
    baseReward: { crewRadiationDelta: -6, buildingConditionDelta: 6 },
    evaluateContext: ({ buildings, crew, activeEvent, lingeringHazards }) => {
      const shelter = buildings.radiation_shelter;
      if (!shelter.restoredOnce || shelter.status === 'inactive') {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      const radHigh =
        crew.radiationExposure >= 18 ||
        Boolean(activeEvent?.definition.radiationLevel) ||
        lingeringHazards.some((h) => h.kind === 'ionizing_particles');
      if (!radHigh && !crew.inShelter) {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      return {
        eligible: true,
        weight: radHigh ? 90 : 62,
        targetBuildingId: 'radiation_shelter',
        relevanceReason: radHigh
          ? `Crew radiation at ${crew.radiationExposure}% — RAD dosimetry audit minimizes exposure.`
          : 'Sheltered downtime is ideal for logging cosmic-ray shielding telemetry.',
      };
    },
  },
  {
    id: 'res_water_brine_assay',
    category: 'research',
    title: 'Perchlorate Brine Recovery Lab',
    shortDesc: 'Extract residual moisture from filtered brine sludge without wasting power.',
    defaultBuildingId: 'water_recycling',
    isOutdoor: false,
    recommendedCrew: 'MJ',
    skillLabel: 'Hydro-Chem',
    skillBonusLabel: 'MJ reclaims +9 Water from brine tailings',
    durationHours: 2,
    workDurationSec: 2.3,
    crewEnergyCost: 7,
    resourceCost: { energy: 4 },
    cooldownSols: 5,
    minDay: 4,
    baseReward: { resourcesDelta: { water: 9 }, buildingConditionDelta: 5 },
    evaluateContext: ({ buildings, resources }) => {
      const wRec = buildings.water_recycling;
      if (!wRec.restoredOnce || wRec.status === 'inactive' || resources.water >= 75) {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      return {
        eligible: true,
        weight: resources.water < 50 ? 84 : 56,
        targetBuildingId: 'water_recycling',
        relevanceReason: `Water tanks at ${Math.round(resources.water)} — brine distillation yields clean reserve water.`,
      };
    },
  },

  // ======================== EXPLORATION ========================
  {
    id: 'exp_neretva_ice_vein',
    category: 'exploration',
    title: 'Neretva Delta Ice-Vein Core',
    shortDesc: 'Drill shallow clay-carbonate ice pockets along the ancient river delta.',
    defaultBuildingId: 'water_recycling',
    isOutdoor: true,
    recommendedCrew: 'Darryl',
    skillLabel: 'Field Geology',
    skillBonusLabel: 'Darryl locates high-purity +12 Water ice core',
    durationHours: 2,
    workDurationSec: 2.6,
    crewEnergyCost: 11,
    resourceCost: { energy: 4, oxygen: 2 },
    cooldownSols: 5,
    minDay: 2,
    baseReward: { resourcesDelta: { water: 12 } },
    evaluateContext: ({ resources, crew, activeEvent }) => {
      if (crew.energy < 22 || activeEvent?.definition.id === 'global_dust_storm') {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      const needWater = resources.water < 68;
      return {
        eligible: true,
        weight: needWater ? 88 : 54,
        targetBuildingId: 'water_recycling',
        relevanceReason: needWater
          ? 'Water supplies are running lean — Neretva delta clay ridges hold subsurface ice.'
          : 'Orbital radar spotted hydrated clay veins near the outpost perimeter.',
      };
    },
  },
  {
    id: 'exp_jezero_quartz_survey',
    category: 'exploration',
    title: 'Jezero Basalt & Oxygen Assay',
    shortDesc: 'Collect iron-oxide regolith samples and vent O2 catalyst byproducts.',
    defaultBuildingId: 'maintenance_facility',
    isOutdoor: true,
    recommendedCrew: 'Player',
    skillLabel: 'Command Recon',
    skillBonusLabel: 'Commander leads fast survey (+8 O2, +4 Energy)',
    durationHours: 2,
    workDurationSec: 2.5,
    crewEnergyCost: 10,
    resourceCost: { water: 2 },
    cooldownSols: 5,
    minDay: 2,
    baseReward: { resourcesDelta: { oxygen: 8, energy: 4 } },
    evaluateContext: ({ crew, activeEvent }) => {
      if (crew.energy < 22 || activeEvent?.definition.severity === 'super_major') {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      const postQuake = activeEvent?.definition.phenomenon === 'marsquake';
      return {
        eligible: true,
        weight: postQuake ? 86 : 58,
        targetBuildingId: 'maintenance_facility',
        relevanceReason: postQuake
          ? 'Recent Marsquake exposed fresh bedrock fractures ideal for regolith sampling.'
          : 'Calm surface window opens a field survey across Máaz Formation boulders.',
      };
    },
  },
  {
    id: 'exp_rover_cache_recovery',
    category: 'exploration',
    title: 'Perseverance Supply Cache Salvage',
    shortDesc: 'Retrieve pre-staged emergency ration packs and auxiliary fuel cells nearby.',
    defaultBuildingId: 'energy_storage',
    isOutdoor: true,
    recommendedCrew: 'Darryl',
    skillLabel: 'Recon Ops',
    skillBonusLabel: 'Darryl recovers +10 Energy & +5 Food cache',
    durationHours: 2,
    workDurationSec: 2.6,
    crewEnergyCost: 11,
    resourceCost: {},
    cooldownSols: 6,
    minDay: 4,
    baseReward: { resourcesDelta: { energy: 10, food: 5 } },
    evaluateContext: ({ resources, crew }) => {
      if (crew.energy < 24) {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      const lowRes = resources.energy < 48 || resources.food < 36;
      return {
        eligible: true,
        weight: lowRes ? 87 : 52,
        targetBuildingId: 'energy_storage',
        relevanceReason: lowRes
          ? 'Telemetry pinged an unrecovered landing supply pod to bolster low reserves.'
          : 'Beacon ping from a pre-mission Perseverance calibration depot 400m east.',
      };
    },
  },
  {
    id: 'exp_crater_wind_mast',
    category: 'exploration',
    title: 'Crater Rim Anemometer Check',
    shortDesc: 'Service perimeter weather mast sensors and clear windblown dust.',
    defaultBuildingId: 'solar_panels',
    isOutdoor: true,
    recommendedCrew: 'Magno',
    skillLabel: 'Field Telemetry',
    skillBonusLabel: 'Magno recovers +7 Energy & -12% panel dust',
    durationHours: 1,
    workDurationSec: 2.3,
    crewEnergyCost: 7,
    resourceCost: {},
    cooldownSols: 5,
    minDay: 3,
    baseReward: { resourcesDelta: { energy: 7 }, dustCleared: 12 },
    evaluateContext: ({ buildings, activeEvent, crew }) => {
      if (crew.energy < 18) {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      const windEvent =
        activeEvent?.definition.phenomenon === 'dust_devils' ||
        activeEvent?.definition.phenomenon === 'marsquake' ||
        buildings.solar_panels.dustLevel >= 18;
      return {
        eligible: true,
        weight: windEvent ? 80 : 50,
        targetBuildingId: 'solar_panels',
        relevanceReason: windEvent
          ? 'Recent wind/seismic activity shifted rim anemometers — quick field recalibration needed.'
          : 'Routine Jezero rim weather mast check helps forecast dust storms.',
      };
    },
  },
  {
    id: 'exp_biosignature_trench',
    category: 'exploration',
    title: 'Séítah Mineral Nutrient Sample',
    shortDesc: 'Gather mineral-rich mudstone dust to enrich Greenhouse hydroponic trays.',
    defaultBuildingId: 'greenhouse',
    isOutdoor: true,
    recommendedCrew: 'MJ',
    skillLabel: 'Astrobiology',
    skillBonusLabel: 'MJ turns mineral trace into +5 Food & +1d Crop Boost',
    durationHours: 2,
    workDurationSec: 2.5,
    crewEnergyCost: 9,
    resourceCost: { water: 2 },
    cooldownSols: 6,
    minDay: 5,
    baseReward: { resourcesDelta: { food: 5 }, cropBoostDays: 1 },
    evaluateContext: ({ buildings, resources, greenhouseCrop, crew }) => {
      if (
        crew.energy < 20 ||
        !buildings.greenhouse.restoredOnce ||
        buildings.greenhouse.status === 'inactive'
      ) {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      if (resources.food >= 70 && !greenhouseCrop) {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      return {
        eligible: true,
        weight: resources.food < 45 ? 84 : 56,
        targetBuildingId: 'greenhouse',
        relevanceReason:
          resources.food < 45
            ? 'Food stores are modest — Séítah carbonate nutrients accelerate crop yields.'
            : 'Greenhouse can synthesize extra mineral micronutrients from delta mudstones.',
      };
    },
  },

  // ======================== CREW ACTIVITIES ========================
  {
    id: 'crew_vitals_med_check',
    category: 'crew',
    title: 'Medical Vitals & Hydration Check',
    shortDesc: 'Run crew blood pressure, oxygen saturation, and electrolyte recovery inside Habitat.',
    defaultBuildingId: 'main_habitat',
    isOutdoor: false,
    recommendedCrew: 'Darryl',
    skillLabel: 'Medical Ops',
    skillBonusLabel: 'Darryl restores +8% Crew HP & -5% Radiation',
    durationHours: 1,
    workDurationSec: 2.0,
    crewEnergyCost: 0,
    resourceCost: { water: 2 },
    cooldownSols: 3,
    minDay: 2,
    baseReward: { crewHealthDelta: 8, crewRadiationDelta: -5, crewEnergyDelta: 6 },
    evaluateContext: ({ crew, resources }) => {
      if (resources.water < 8) {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      const needsMed = crew.condition < 94 || crew.radiationExposure >= 16;
      if (!needsMed) {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      return {
        eligible: true,
        weight: crew.condition < 75 || crew.radiationExposure >= 35 ? 95 : 76,
        targetBuildingId: 'main_habitat',
        relevanceReason:
          crew.condition < 85
            ? `Crew Health is at ${crew.condition}% — indoor medical care speeds recovery.`
            : `Radiation exposure at ${crew.radiationExposure}% calls for hydration & chelation.`,
      };
    },
  },
  {
    id: 'crew_communal_briefing',
    category: 'crew',
    title: 'Galley Meal & Crew Debrief',
    shortDesc: 'Share hot rations, swap mission stories with GIL, and shake off EVA fatigue.',
    defaultBuildingId: 'main_habitat',
    isOutdoor: false,
    recommendedCrew: 'Player',
    skillLabel: 'Crew Morale',
    skillBonusLabel: 'Commander boosts +18% Stamina & +4% Crew HP',
    durationHours: 2,
    workDurationSec: 2.1,
    crewEnergyCost: 0,
    resourceCost: { food: 2 },
    cooldownSols: 3,
    minDay: 2,
    baseReward: { crewEnergyDelta: 18, crewHealthDelta: 4 },
    evaluateContext: ({ crew, resources }) => {
      if (resources.food < 8 || crew.energy >= 86) {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      return {
        eligible: true,
        weight: crew.energy < 55 ? 92 : 70,
        targetBuildingId: 'main_habitat',
        relevanceReason: `Crew Stamina is at ${crew.energy}% — a warm galley break restores focus.`,
      };
    },
  },
  {
    id: 'crew_shelter_ergonomics',
    category: 'crew',
    title: 'Shelter Drill & Dosimetry Purge',
    shortDesc: 'Practice fast-entry storm stations and administer anti-rad antioxidant rations.',
    defaultBuildingId: 'radiation_shelter',
    isOutdoor: false,
    recommendedCrew: 'Darryl',
    skillLabel: 'Storm Readiness',
    skillBonusLabel: 'Darryl clears -8% Radiation & restores +6% Stamina',
    durationHours: 1,
    workDurationSec: 2.0,
    crewEnergyCost: 0,
    resourceCost: { energy: 2 },
    cooldownSols: 4,
    minDay: 4,
    baseReward: { crewRadiationDelta: -8, crewEnergyDelta: 6, crewHealthDelta: 3 },
    evaluateContext: ({ buildings, crew, activeEvent }) => {
      const shelter = buildings.radiation_shelter;
      if (!shelter.restoredOnce || shelter.status === 'inactive') {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      const relevant =
        crew.inShelter ||
        crew.radiationExposure >= 20 ||
        Boolean(activeEvent?.definition.radiationLevel);
      if (!relevant) {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      return {
        eligible: true,
        weight: crew.inShelter ? 88 : 74,
        targetBuildingId: 'radiation_shelter',
        relevanceReason: crew.inShelter
          ? 'Make productive use of time inside the Storm Shelter with a dosimetry purge.'
          : `Radiation exposure (${crew.radiationExposure}%) makes shelter readiness high value.`,
      };
    },
  },
  {
    id: 'crew_botany_walk',
    category: 'crew',
    title: 'Greenhouse Oxygen & Tea Break',
    shortDesc: 'Relax among leafy hydroponic beds to lift crew spirits and harvest herbal leaves.',
    defaultBuildingId: 'greenhouse',
    isOutdoor: false,
    recommendedCrew: 'MJ',
    skillLabel: 'Crew Wellness',
    skillBonusLabel: 'MJ restores +14% Stamina, +4% HP & +2 Food',
    durationHours: 1,
    workDurationSec: 2.0,
    crewEnergyCost: 0,
    resourceCost: {},
    cooldownSols: 4,
    minDay: 3,
    baseReward: { crewEnergyDelta: 14, crewHealthDelta: 4, resourcesDelta: { food: 2 } },
    evaluateContext: ({ buildings, crew }) => {
      const gh = buildings.greenhouse;
      if (!gh.restoredOnce || gh.status === 'inactive') {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      if (crew.energy >= 90 && crew.condition >= 95) {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      return {
        eligible: true,
        weight: 66,
        targetBuildingId: 'greenhouse',
        relevanceReason: 'Lush Greenhouse greenery boosts morale and relieves Martian cabin fever.',
      };
    },
  },
  {
    id: 'crew_eva_suit_fit',
    category: 'crew',
    title: 'EVA Suit Mobility & Seal Check',
    shortDesc: 'Adjust boot joints and helmet seals so future outdoor repairs take less effort.',
    defaultBuildingId: 'main_habitat',
    isOutdoor: false,
    recommendedCrew: 'Brent',
    skillLabel: 'EVA Gear',
    skillBonusLabel: 'Brent restores +10% Stamina & +5% Habitat condition',
    durationHours: 1,
    workDurationSec: 2.0,
    crewEnergyCost: 0,
    resourceCost: { oxygen: 2 },
    cooldownSols: 5,
    minDay: 2,
    baseReward: { crewEnergyDelta: 10, buildingConditionDelta: 5 },
    evaluateContext: ({ crew, resources }) => {
      if (resources.oxygen < 15 || crew.energy >= 92) {
        return { eligible: false, weight: 0, relevanceReason: '' };
      }
      return {
        eligible: true,
        weight: 55,
        targetBuildingId: 'main_habitat',
        relevanceReason: 'Tuning EVA suit bearings reduces crew fatigue on upcoming outdoor tasks.',
      };
    },
  },
];
