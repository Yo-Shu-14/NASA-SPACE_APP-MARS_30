import { isEventOfficiallyActive } from '../systems/events';
import { ActiveEvent } from '../types/event';

export interface NasaReferenceEntry {
  source: 'MOXIE' | 'MEDA' | 'RAD' | 'DONKI' | 'HiRISE / MOLA';
  title: string;
  fact: string;
  measurementNote: string;
}

export interface SubjectDescriptionEntry {
  key: string;
  title: string;
  description: string;
  imageUrl: string;
  credit: string;
  capabilities?: ReadonlyArray<{
    title: string;
    detail: string;
  }>;
}

export interface JezeroCraterProfile {
  siteName: string;
  landingSiteName: string;
  coordinates: string;
  diameterKm: number;
  floorElevationM: number;
  rimReliefM: number;
  deltaSystem: string;
  geologicalUnits: ReadonlyArray<{
    name: string;
    composition: string;
    note: string;
  }>;
  atmosphereComposition: string;
  solarConstantMarsWm2: number;
  solarConstantNote: string;
  skyObservation: string;
}

export const JEZERO_CRATER_DATA: JezeroCraterProfile = {
  siteName: 'Jezero Crater (Western Isidis Planitia Rim)',
  landingSiteName: 'Octavia E. Butler Landing (Perseverance · Feb 18, 2021)',
  coordinates: '18.38°N, 77.58°E',
  diameterKm: 45,
  floorElevationM: -2569,
  rimReliefM: 600,
  deltaSystem: 'Neretva Vallis paleolake inflow & fan-delta deposits',
  geologicalUnits: [
    {
      name: 'Máaz Formation',
      composition: 'Olivine-rich basaltic lava & igneous crater floor',
      note: 'Dark, wind-etched volcanic stone forming the rugged crater floor.',
    },
    {
      name: 'Séítah & Delta Front',
      composition: 'Layered clay-carbonate mudstones & aeolian sand ripples',
      note: 'Pale sedimentary outcrops deposited where an ancient river entered Lake Jezero.',
    },
    {
      name: 'Belva & Rim Terraces',
      composition: 'Ejecta breccia, crater walls & terraced highlands (+600 m)',
      note: 'Stepped crater walls framing the eastern horizon of the outpost plateau.',
    },
  ],
  atmosphereComposition: '95.3% CO2 · 2.6% N2 · 1.9% Ar (~610–750 Pa surface pressure)',
  solarConstantMarsWm2: 590,
  solarConstantNote: '~590 W/m² peak top-of-atmosphere irradiance (~43% of Earth’s 1,361 W/m²).',
  skyObservation:
    'NASA rover Mastcam-Z imagery shows butterscotch daytime skies from suspended iron-oxide dust (Mie scattering) shifting to cool bluish-gray around the setting and rising Sun.',
};

export interface MedaTelemetrySnapshot {
  temperatureC: number;
  pressurePa: number;
  windSpeedMs: number;
  opticalDepthTau: number;
  radiationMsvSol: number;
  uvIndexNote: string;
  skyConditionLabel: string;
  dataSourceLabel: string;
}

/**
 * Computes scientifically grounded Martian environmental conditions for Jezero Crater
 * calibrated to NASA Perseverance MEDA, Curiosity RAD, and NASA DONKI observations.
 * NOTE: Numerical gameplay resource rates remain simplified abstractions for playability.
 */
export function getMedaTelemetrySnapshot(
  hoursElapsed: number,
  activeEvent: ActiveEvent | null,
  solarDustLevel = 0
): MedaTelemetrySnapshot {
  // Diurnal temperature cycle observed by Perseverance MEDA at Jezero Crater:
  // Coldest ~-80°C around 05:00 LMST; warmest ~-18°C around 14:30 LMST.
  const clampedH = Math.max(0, Math.min(24.65, hoursElapsed));
  const phaseAngle = ((clampedH - 14.5) / 24.65) * Math.PI * 2;
  const diurnalCos = Math.cos(phaseAngle); // +1 at 14:30, -1 around 02:10–05:00
  let tempC = -49 + 31 * diurnalCos;

  // Seasonal / Jezero floor pressure ~625–650 Pa (<1% of Earth sea-level 101,325 Pa)
  let pressurePa = 638 + Math.round(14 * Math.sin(((clampedH - 9) / 24.65) * Math.PI * 2));
  let windMs = clampedH >= 9 && clampedH <= 17 ? 7.4 : 3.2;
  let tau = Number((0.42 + (solarDustLevel / 100) * 0.25).toFixed(2));
  let radiationMsvSol = 0.64; // Curiosity RAD ambient baseline (~0.64 mSv/sol)
  let uvIndexNote = 'Unshielded UV-C/UV-B (thin CO2, zero ozone layer)';
  let skyConditionLabel =
    clampedH >= 17.5 || clampedH < 6.5 ? 'Twilight Blue-Haze' : 'Clear Butterscotch';

  if (isEventOfficiallyActive(activeEvent) && activeEvent) {
    switch (activeEvent.definition.id) {
      case 'global_dust_storm':
        // High optical depth cools daytime highs and traps thermal IR slightly at night
        tempC = -52 + 13 * diurnalCos;
        pressurePa += 18;
        windMs = 26.5;
        tau = 4.2;
        radiationMsvSol = 0.72;
        skyConditionLabel = 'Planet-Encircling Dust (τ 4.2)';
        break;
      case 'dust_devils':
        windMs = 21.4;
        tau = 1.15;
        skyConditionLabel = 'Convective Dust Vortices';
        break;
      case 'water_ice_cloud_formation':
        tempC -= 11;
        windMs = 5.8;
        tau = 0.85;
        skyConditionLabel = 'High-Altitude H2O Ice Cirrus';
        break;
      case 'solar_storm_response':
        radiationMsvSol = 3.8;
        uvIndexNote = 'DONKI CME / Solar Particle Surge';
        skyConditionLabel = 'High-Energy Solar Storm';
        break;
      case 'solar_energetic_particles':
        radiationMsvSol = 4.6;
        uvIndexNote = 'DONKI SEP Flux Elevated';
        skyConditionLabel = 'Charged Particle Flux';
        break;
      case 'solar_flare_xray_uv':
        radiationMsvSol = 1.9;
        uvIndexNote = 'X-Ray / Extreme-UV Flare Burst';
        skyConditionLabel = 'Solar UV / X-Ray Spike';
        break;
      case 'secondary_neutron_cascades':
        radiationMsvSol = 2.1;
        uvIndexNote = 'Regolith Secondary Neutron Albedo';
        skyConditionLabel = 'Cosmic Ray Ground Scatter';
        break;
      case 'marsquake':
        skyConditionLabel = 'Seismic Tremor · Dust Lofted';
        windMs += 1.5;
        break;
      default:
        break;
    }
  }

  return {
    temperatureC: Math.round(tempC),
    pressurePa,
    windSpeedMs: Number(windMs.toFixed(1)),
    opticalDepthTau: tau,
    radiationMsvSol: Number(radiationMsvSol.toFixed(2)),
    uvIndexNote,
    skyConditionLabel,
    dataSourceLabel: 'Calibrated to NASA Perseverance MEDA & Curiosity RAD',
  };
}

export const NASA_SIMULATION_BOUNDARY = {
  realScience: [
    'Jezero Crater terrain, Neretva Vallis delta & -2,569 m MOLA elevation (18.38°N, 77.58°E)',
    'MEDA diurnal temperature (-18°C day to -80°C night), ~638 Pa CO2 pressure & dust optical depth τ',
    'MOXIE atmospheric CO2-to-O2 electrolysis concept (~6–12 g O2/hr flight demo)',
    'Curiosity RAD ~0.64 mSv/sol baseline radiation & NASA DONKI solar storm warnings',
    'Mie-scattered butterscotch daytime haze & cool blue Martian sunrise/sunset twilight',
  ],
  fictionalGameplay: [
    'Prebuilt 11-module abandoned outpost awaiting restoration by Junior Astronaut & crew',
    'Named crewmates (Brent, MJ, Darryl, Magno) and AI companion GIL',
    'Compressed 30-sol restoration survival loop & 150-sol sustainability evaluation',
    'Whole-unit resource balances, stamina clock, repair tasks, and interactive minigames',
  ],
} as const;

export const SUBJECT_DESCRIPTIONS: Record<string, SubjectDescriptionEntry> = {
  jezero: {
    key: 'jezero',
    title: 'Jezero Crater, Mars (18.38°N, 77.58°E)',
    description:
      'Billions of years ago, rivers carving Neretva Vallis flowed into Jezero Crater (-2,569 m floor elevation) and formed a lake delta—making it NASA Perseverance’s landing site.',
    imageUrl: 'https://images-assets.nasa.gov/image/PIA24096/PIA24096~medium.jpg',
    credit: 'NASA / ESA Mars Express',
  },
  marsquake: {
    key: 'marsquake',
    title: 'Marsquakes (InSight SEIS Data)',
    description:
      'Mars cools and contracts deep underground, sending seismic waves across the crust—over 1,300 marsquakes were recorded by NASA’s InSight seismometer.',
    imageUrl: 'https://images-assets.nasa.gov/image/PIA19811/PIA19811~medium.jpg',
    credit: 'NASA InSight Mission',
  },
  dust_devils: {
    key: 'dust_devils',
    title: 'Martian Dust Devils (MEDA Observations)',
    description:
      'Solar heating over rocky regolith drives convective vortices of 15–30 m/s winds in the thin CO2 air, captured across Jezero Crater by Perseverance’s MEDA & Navcams.',
    imageUrl: 'https://images-assets.nasa.gov/image/PIA25657/PIA25657~medium.jpg',
    credit: 'NASA Perseverance Rover',
  },
  water_ice_clouds: {
    key: 'water_ice_clouds',
    title: 'Martian Water-Ice Clouds',
    description:
      'Tiny water-ice crystals form wispy twilight clouds ~60 km up in Mars’s chilly sky, scattering sunlight and lowering midday temperatures below the crater rim.',
    imageUrl: 'https://images-assets.nasa.gov/image/PIA24661/PIA24661~orig.jpg',
    credit: 'NASA Curiosity Rover',
  },
  global_dust_storm: {
    key: 'global_dust_storm',
    title: 'Global Dust Storms (τ > 4.0)',
    description:
      'Planet-encircling Mars dust storms raise atmospheric optical depth above τ 4.0, blocking up to 99% of direct sunlight from solar arrays for weeks.',
    imageUrl: 'https://images-assets.nasa.gov/image/PIA22329/PIA22329~medium.jpg',
    credit: 'NASA Opportunity Mission',
  },
  solar_flare_xray_uv: {
    key: 'solar_flare_xray_uv',
    title: 'Solar Flares & Thin-Air UV',
    description:
      'Without Earth’s thick atmosphere or ozone layer, X-ray and ultraviolet flare bursts ionize Mars’s upper atmosphere and stress unshielded electronics.',
    imageUrl: 'https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e000963/GSFC_20171208_Archive_e000963~small.jpg',
    credit: 'NASA Solar Dynamics Observatory',
  },
  solar_storm_response: {
    key: 'solar_storm_response',
    title: 'Solar Radiation Storms (DONKI CMEs)',
    description:
      'Coronal mass ejections tracked by NASA DONKI hurl energetic protons across interplanetary space, requiring Mars surface crews to take shelter.',
    imageUrl: 'https://images-assets.nasa.gov/image/PIA21856/PIA21856~orig.jpg',
    credit: 'NASA MAVEN Mission',
  },
  solar_energetic_particles: {
    key: 'solar_energetic_particles',
    title: 'Solar Energetic Particles (SEPs)',
    description:
      'High-speed charged particles from solar eruptions can spike surface radiation doses above ~4 mSv/sol and trigger electronic single-event upsets.',
    imageUrl: 'https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e000963/GSFC_20171208_Archive_e000963~small.jpg',
    credit: 'NASA Solar Dynamics Observatory',
  },
  secondary_neutron_cascades: {
    key: 'secondary_neutron_cascades',
    title: 'Surface Neutron Albedo Cascades',
    description:
      'Galactic cosmic rays strike rocky Martian basalt and eject upward secondary neutrons (measured by RAD), making regolith-shielded bunkers essential.',
    imageUrl: 'https://images-assets.nasa.gov/image/PIA21856/PIA21856~orig.jpg',
    credit: 'NASA Mars Radiation Research',
  },
  orion: {
    key: 'orion',
    title: 'NASA Orion Spacecraft',
    description:
      'NASA’s Orion spacecraft is a crewed deep-space exploration vehicle engineered to carry astronauts safely beyond low Earth orbit—sustaining crews during multi-week journeys around the Moon and paving the way for future human missions to Mars.',
    imageUrl: 'https://images-assets.nasa.gov/image/art001e000672/art001e000672~medium.jpg',
    credit: 'NASA Artemis I · Orion in Deep Space',
    capabilities: [
      {
        title: 'Conical Crew Module & Life Support',
        detail:
          'Pressurized cabin for up to four astronauts featuring regenerative air and water systems, crew quarters, and fault-tolerant avionics for deep-space navigation.',
      },
      {
        title: 'Radiation Shelter & Avcoat Heat Shield',
        detail:
          'Includes an onboard solar storm shelter to shield astronauts from intense cosmic radiation and an ablative heat shield built for 25,000 mph Earth re-entry.',
      },
      {
        title: 'European Service Module & Solar Wings',
        detail:
          'Supplies primary orbital propulsion, thermal control, breathable oxygen, and water, powered by four deployable X-wing solar arrays.',
      },
    ],
  },
};

export const NASA_REFERENCE_DATA: NasaReferenceEntry[] = [
  {
    source: 'MOXIE',
    title: 'Oxygen From Mars Air',
    fact: 'Perseverance’s MOXIE instrument successfully electrolyzed breathable oxygen from Mars’s 95% carbon-dioxide atmosphere in Jezero Crater.',
    measurementNote: 'NASA Data: ~6–12 g O2/hour in tech-demo runs (in-game unit rates are simplified).',
  },
  {
    source: 'MEDA',
    title: 'Jezero Crater Weather & Dust',
    fact: 'MEDA sensors recorded diurnal swings from -18°C at midday down to -80°C before dawn, plus dust-devil gusts over 20 m/s.',
    measurementNote: 'NASA Data: ~610–750 Pa surface pressure (<1% of Earth sea-level pressure).',
  },
  {
    source: 'RAD',
    title: 'Surface Radiation Levels',
    fact: 'Curiosity’s RAD detector measures steady galactic cosmic rays plus sharp spikes during solar energetic particle events.',
    measurementNote: 'NASA Data: ~0.64 mSv/sol ambient surface background (storm hazards scaled for gameplay).',
  },
  {
    source: 'DONKI',
    title: 'Space Weather Alerts',
    fact: 'Solar flares and coronal mass ejections monitored by NASA DONKI reach Mars and warn crews to enter shielded habitats.',
    measurementNote: 'NASA Data: Real DONKI telemetry tracks CME travel times to Mars.',
  },
  {
    source: 'HiRISE / MOLA',
    title: 'Jezero Crater Topography',
    fact: 'MOLA & HiRISE orbital elevation maps show Jezero’s 45 km basin sitting at -2,569 m below datum beneath a +600 m ancient river delta rim.',
    measurementNote: 'NASA Data: 18.38°N, 77.58°E; Neretva Vallis delta sediments & Máaz basalt floor.',
  },
];
