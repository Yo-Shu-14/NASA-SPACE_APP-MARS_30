import { EventPhenomenon } from './event';
import { ResourceAmounts, ResourceType } from './resource';

export type BuildingId =
  | 'main_habitat'
  | 'solar_panels'
  | 'energy_storage'
  | 'oxygen_generator'
  | 'oxygen_storage'
  | 'water_recycling'
  | 'water_storage'
  | 'greenhouse'
  | 'food_storage'
  | 'radiation_shelter'
  | 'maintenance_facility';

export type BuildingStatus = 'operational' | 'damaged' | 'inactive' | 'maintenance';

export type BuildingCategory = 'habitat' | 'energy' | 'life_support' | 'food' | 'safety';

export interface BuildingDefinition {
  id: BuildingId;
  name: string;
  shortName: string;
  category: BuildingCategory;
  description: string;
  scienceNote: string;
  nasaImageUrl?: string;
  nasaImageCredit?: string;
  gridX: number;
  gridY: number;
  widthTiles: number;
  heightTiles: number;
  initialStatus: BuildingStatus;
  initialCondition: number;
  dailyProduction: Partial<ResourceAmounts>;
  dailyConsumption: Partial<ResourceAmounts>;
  storageBonus?: Partial<Record<ResourceType, number>>;
  waterRecoveryRate?: number;
  requiresPower: boolean;
  isCritical: boolean;
}

export type BuildingMalfunctionKind = 'electrical' | 'electronic' | 'frost' | 'disrupted';

export interface BuildingState {
  id: BuildingId;
  status: BuildingStatus;
  condition: number; // 0 to 100
  dustLevel: number; // 0 to 100 (especially affects solar panels)
  frostLevel?: number; // 0 to 100 (frost/freezing from Water Ice Cloud Formation)
  malfunctionDaysRemaining?: number; // temporary disruption/malfunction sols remaining
  malfunctionKind?: BuildingMalfunctionKind;
  restoredOnce: boolean;
  timesMaintained: number;
  lastMaintainedDay?: number;
  hasVisibleDamage?: boolean;
  damageCause?: EventPhenomenon | 'wear';
  damageSeverity?: 'minor' | 'major' | 'super_major';
}

