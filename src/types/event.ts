import { BuildingId, BuildingMalfunctionKind } from './building';
import { ResourceAmounts } from './resource';

export type EventSeverity = 'minor' | 'major' | 'super_major';

export type EventPhenomenon =
  | 'marsquake'
  | 'secondary_neutron_cascades'
  | 'water_ice_clouds'
  | 'dust_devils'
  | 'solar_flare_xray_uv'
  | 'solar_storm_response'
  | 'solar_energetic_particles'
  | 'global_dust_storm';

export type DecisionIconType = 'shield' | 'zap' | 'wrench' | 'sun' | 'leaf' | 'users';

export interface EventDecisionOption {
  id: string;
  title: string;
  icon: DecisionIconType;
  shortDesc: string;
  benefitTag: string;
  riskTag: string;
  gilHeadline: string;
  gilOutcome: string;
  gilFutureWarning: string;
  urgency: 'info' | 'warning' | 'alert';
  immediateEffect: {
    resourcesDelta?: Partial<ResourceAmounts>;
    crewEnergyDelta?: number;
    crewConditionDelta?: number;
    crewRadiationDelta?: number;
    setInShelter?: boolean;
    timeHoursCost?: number;
    buildingDeltas?: Partial<Record<BuildingId, number>>;
    solarDustDelta?: number;
    solarOutputBonusPctDelta?: number;
    stormDamageFactorMultiplier?: number;
    extraDustNextStormDelta?: number;
    cropBoostDays?: number;
  };
}

export type CutsceneSpeaker = 'Player' | 'GIL' | 'Brent' | 'MJ' | 'Darryl' | 'Magno';

export type CutsceneMood =
  | 'calm'
  | 'alert'
  | 'worried'
  | 'concerned'
  | 'determined'
  | 'excited';

export interface EventCutsceneBeat {
  id: string;
  speaker: CutsceneSpeaker;
  roleLabel: string;
  mood: CutsceneMood;
  line: string;
  focusBuildingId?: BuildingId;
  cameraZoom?: number;
}

export interface EventDefinition {
  id: string;
  phenomenon: EventPhenomenon;
  title: string;
  severity: EventSeverity;
  summary: string;
  scienceContext: string;
  recommendedAction: string;
  solarPenaltyFactor?: number; // e.g., 0.5 means 50% solar reduction on event day
  radiationLevel?: number; // 0 to 50 raw exposure before shelter mitigation
  crewEnergyImpact?: number;
  resourceLoss?: Partial<ResourceAmounts>;
  targetBuildings?: BuildingId[];
  conditionDamage?: number;
  dustAdded?: number;
  cropGrowthPenalty?: number;
  cutscene?: EventCutsceneBeat[];
  choices?: EventDecisionOption[];
}

export interface BuildingEventImpact {
  buildingId: BuildingId;
  conditionDelta: number;
  dustAdded?: number;
  frostAdded?: number;
  malfunctionKind?: BuildingMalfunctionKind;
  shutdown?: boolean;
}

export interface ActiveEvent {
  definition: EventDefinition;
  dayTriggered: number;
  resolved: boolean;
  cutsceneCompleted?: boolean;
  shelterUsed: boolean;
  selectedChoiceId?: string;
  mitigationSummary: string;
  animationDuration: number;
  animationRemaining: number;
  initialDamageApplied?: boolean;
  radiationPenaltyApplied?: boolean;
  appliedBuildingImpacts?: BuildingEventImpact[];
  hazardDrainRemainder?: number;
  totalHazardHealthLost?: number;
  shelterEnteredLate?: boolean;
  lateEntryHealthPenalty?: number;
}

export interface EventLogEntry {
  day: number;
  eventId: string;
  title: string;
  severity: EventSeverity;
  choiceTitle?: string;
  outcomeSummary: string;
}
