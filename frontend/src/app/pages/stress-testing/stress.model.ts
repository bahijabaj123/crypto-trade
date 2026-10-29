export type BankType = 'conventional' | 'non-conventional';
export type FactorKey = 'gdp' | 'rates' | 'unemployment' | 'defaults' | 'assetQuality' | 'revenue' | 'markets';
export type Shock = Record<FactorKey, number>;
export type Status = 'resilient' | 'vulnerable' | 'critical';

export interface FactorDef {
  key: FactorKey;
  label: string;
  short: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export interface Indicators {
  cet1: number; // ratio CET1 (%)
  npl: number;  // créances douteuses (%)
  roa: number;  // rentabilité des actifs (%)
  lcr: number;  // ratio de liquidité (%)
}

export interface Bank {
  id: string;
  name: string;
  type: BankType;
  totalAssets: number; // milliards
  indicators: Indicators;
  profile: Record<FactorKey, number>; // multiplicateurs de sensibilité propres à la banque
}

export interface Scenario {
  id: string;
  name: string;
  short: string;
  description: string;
  shock: Shock;
}

export interface Contribution {
  key: FactorKey;
  label: string;
  points: number; // contribution au CET1 (pts)
}

export interface BankResult {
  bank: Bank;
  before: Indicators;
  after: Indicators;
  cet1Path: number[];
  cet1Base: number[];
  contributions: Contribution[];
  lossesBn: number;
  status: Status;
}

export interface StressRun {
  date: Date;
  scenario: Scenario;
  severity: number;
  shock: Shock;
  results: BankResult[];
}

export interface StressHistoryItem {
  date: Date;
  scenario: string;
  severity: number;
  banks: number;
  avgImpact: number;
}