export type ScoreBand = 'Elite Opportunity' | 'Strong Candidate' | 'Watchlist' | 'Research Only' | 'Pass' | 'Not Rated';

export interface Quote {
  symbol: string;
  name?: string;
  price: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  avgVolume?: number;
  marketCap?: number;
  yearHigh?: number;
  yearLow?: number;
  timestamp?: string;
}

export interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
}

export interface FinancialStatement {
  date?: string;
  period?: string;
  revenue?: number;
  grossProfit?: number;
  operatingIncome?: number;
  netIncome?: number;
  eps?: number;
  ebitda?: number;
  totalAssets?: number;
  totalCurrentAssets?: number;
  cashAndCashEquivalents?: number;
  totalDebt?: number;
  totalCurrentLiabilities?: number;
  totalStockholdersEquity?: number;
  operatingCashFlow?: number;
  capitalExpenditure?: number;
  freeCashFlow?: number;
  stockBasedCompensation?: number;
  weightedAverageShsOutDil?: number;
}

export interface FundamentalSnapshot {
  sector?: string;
  industry?: string;
  description?: string;
  beta?: number;
  priceToEarnings?: number;
  forwardPE?: number;
  priceToSales?: number;
  priceToBook?: number;
  enterpriseValue?: number;
  evToSales?: number;
  evToEbitda?: number;
  priceToFreeCashFlow?: number;
  currentRatio?: number;
  quickRatio?: number;
  debtToEquity?: number;
  returnOnEquity?: number;
  returnOnInvestedCapital?: number;
  grossMargin?: number;
  operatingMargin?: number;
  netMargin?: number;
  freeCashFlowMargin?: number;
  revenueGrowth?: number;
  epsGrowth?: number;
  sharesGrowth?: number;
  institutionalOwnership?: number;
  insiderOwnership?: number;
  shortFloat?: number;
  cash?: number;
  debt?: number;
  latestAnnual?: FinancialStatement;
  priorAnnual?: FinancialStatement;
  latestQuarter?: FinancialStatement;
  priorQuarter?: FinancialStatement;
  warnings: string[];
}

export interface TechnicalSnapshot {
  sma20?: number;
  sma50?: number;
  sma200?: number;
  sma50Slope?: number;
  sma200Slope?: number;
  rsi14?: number;
  atr14?: number;
  relativeVolume?: number;
  vwap20?: number;
  distanceSma20Atr?: number;
  distanceSma50Atr?: number;
  distanceSma200Pct?: number;
  momentum20?: number;
  momentum63?: number;
  momentum126?: number;
  support?: number;
  resistance?: number;
  trend: 'strong-up' | 'up' | 'sideways' | 'down' | 'strong-down' | 'unknown';
}

export interface CatalystItem {
  date?: string;
  type: string;
  title: string;
  summary?: string;
  url?: string;
  source?: string;
  binary?: boolean;
}

export interface OptionContract {
  ticker: string;
  type: 'call' | 'put';
  strike: number;
  expiration: string;
  bid?: number;
  ask?: number;
  last?: number;
  volume?: number;
  openInterest?: number;
  impliedVolatility?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  breakEven?: number;
}

export interface ScoreComponent {
  name: string;
  raw: number;
  weight: number;
  contribution: number;
  explanation: string;
}

export interface ModelScore {
  score: number | null;
  band: ScoreBand;
  components: ScoreComponent[];
  vetoes: string[];
}

export interface TradePlan {
  status: 'Qualified Trade' | 'Watch' | 'Pass';
  preferredEntryLow?: number;
  preferredEntryHigh?: number;
  confirmationAbove?: number;
  invalidationBelow?: number;
  target1?: number;
  target2?: number;
  stretchTarget?: number;
  rewardRisk?: number;
  reasoning: string[];
}

export interface BenchmarkResult {
  symbol: 'VTI' | 'VOO';
  longTermQuality: number;
  timing: number;
  technical: TechnicalSnapshot;
  price?: number;
  explanation: string;
}

export interface AnalysisResult {
  leveragedFund?: {
    symbol:string; name:string; index:string; direction:'Bull'|'Bear';
    dailyMultiple:number; sourceUrl:string;
  };
  leveragedContext?:{headline:string;summary:string;status:string};
  leveragedAlternatives?:{
    symbol:string;name:string;exposure:string;reason:string;
    isVerifiedNow:false;sourceUrl:string;
  }[];
  instrumentType?: 'Stock' | 'ETF';
  fundProfile?: {
    tracks:string;
    portfolioDescription:string;
    expenseRatioPct:number;
    expenseAsOf:string;
    approximateHoldings:number;
    holdingsAsOf:string;
    sourceUrl:string;
    concentrationNote:string;
  };
  fundTiming?: number;
  fundTimingExplanation?: string;
  marketClassification?: 'OTC' | 'Listed' | 'Unknown';
  priceDataAgeDays?: number;
  assessmentWarnings?: string[];
  symbol: string;
  companyName: string;
  mode: 'live' | 'demo';
  dataProvider: string;
  asOf: string;
  quote: Quote;
  fundamentals: FundamentalSnapshot;
  technicals: TechnicalSnapshot;
  catalysts: CatalystItem[];
  options: OptionContract[];
  scores: {
    core: ModelScore;
    growth: ModelScore;
    asymmetric: ModelScore;
    swing: ModelScore;
  };
  tradePlan: TradePlan;
  benchmarks: BenchmarkResult[];
  simpleSummary: string;
  whatWeLike: string[];
  concerns: string[];
  scoreImprovers: string[];
  psychology: string[];
  dataCompleteness: number;
  warnings: string[];
}
