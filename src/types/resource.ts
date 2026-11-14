export type ResourceType = 'oxygen' | 'water' | 'food' | 'energy';

export type ResourceAmounts = Record<ResourceType, number>;

export interface ResourceConfig {
  id: ResourceType;
  label: string;
  unit: string;
  initialAmount: number;
  baseCapacity: number;
  dailyCrewConsumption: number;
  criticalThreshold: number;
  description: string;
}

export interface ResourceNetRate {
  production: number;
  consumption: number;
  net: number;
}
