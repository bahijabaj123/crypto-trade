export type CrisisKind =
  | 'LIQUIDATION'
  | 'HACK'
  | 'MACRO'
  | 'DEPEG'
  | 'ETF'
  | 'WHALE'
  | 'GEO'
  | 'NARRATIVE';

export type CrisisAction = 'HOLD' | 'CUT_25' | 'CUT_ALL' | 'HEDGE' | 'ADD';

export interface CrisisTick {
  minute: number;
  headline: string;
  source: string;
  movePct: number;
  funding: string;
  liquidationsUsd: string;
}

export interface CrisisScenario {
  id: string;
  kind: CrisisKind;
  title: string;
  mentorHook: string;
  asset: string;
  startingEquity: number;
  positionPct: number;
  leverage: number;
  ticks: CrisisTick[];
  candles: number[];
  disciplineRule: string;
  trap: string;
  idealActions: CrisisAction[];
}

export interface CrisisDebrief {
  finalEquity: number;
  pnlPct: number;
  survived: boolean;
  grade: 'A' | 'B' | 'C' | 'D';
  xp: number;
  headline: string;
  bullets: string[];
  nextDrill: string;
}

export type CognitiveBias =
  | 'FOMO'
  | 'REVENGE'
  | 'CONFIRMATION'
  | 'ANCHORING'
  | 'RECENCY'
  | 'OVERCONFIDENCE'
  | 'LOSS_AVERSION'
  | 'NARRATIVE';

export interface BiasFeedItem {
  kind: 'tweet' | 'telegram' | 'news' | 'influencer' | 'onchain';
  author: string;
  text: string;
  heat: number;
}

export interface BiasScenario {
  id: string;
  title: string;
  marketContext: string;
  candles: number[];
  feed: BiasFeedItem[];
  trueBiases: CognitiveBias[];
  decoyBiases: CognitiveBias[];
  soundAction: string;
  trapAction: string;
  mentorNote: string;
}

export interface BiasDebrief {
  identified: CognitiveBias[];
  missed: CognitiveBias[];
  falsePositives: CognitiveBias[];
  actionSound: boolean;
  score: number;
  xp: number;
  narrative: string;
}

export interface MentorConcept {
  key: string;
  aliases: string[];
  coachIfMissing: string;
}

export interface MentorQuestion {
  prompt: string;
  concepts: MentorConcept[];
}

export interface MentorCase {
  id: string;
  title: string;
  brief: string;
  hiddenTruth: string;
  candles: number[];
  questions: MentorQuestion[];
  synthesisStrong: string;
  synthesisWeak: string;
  relatedCourseId?: string;
}

export interface MentorChatMessage {
  role: 'mentor' | 'you' | 'system';
  text: string;
}

export interface PersonalizedBriefing {
  greeting: string;
  focusSkill: string;
  diagnosis: string;
  drill: string;
  quote: string;
}
