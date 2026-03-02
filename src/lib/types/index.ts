// --- Core data types ---

export interface PricePoint {
  date: string; // ISO 8601 date (YYYY-MM-DD)
  close: number;
}

export const ASSET_CLASSIFICATIONS = [
  'stock', 'etf', 'etn', 'etc',
  'fund', 'bond', 'certificate',
  'crypto', 'commodity', 'unknown',
] as const;

export type AssetClassification = (typeof ASSET_CLASSIFICATIONS)[number];

export interface Asset {
  id: string;
  name: string;
  isin: string | null;
  wkn: string | null;
  currency: string;
  classification: AssetClassification;
  prices: PricePoint[];
  formatConfig: DetectedFormat | null;
  rawCSV: string | null;
  rawCSVStoredAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastRefreshedAt: string | null;
}

export type PortfolioMode = 'model' | 'tracked' | 'both';

export interface Portfolio {
  id: string;
  name: string;
  mode: PortfolioMode;
  allocations: Array<{ assetId: string; weight: number }>;
  isBenchmark: boolean;
  trackCash: boolean;
  cashCurrency: string;
  sourceStrategyId: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Strategy ---

export interface StrategyGroupNode {
  type: 'group';
  id: string;
  label: string;
  weight: number;
  children: StrategyNode[];
}

export interface StrategyLeafNode {
  type: 'leaf';
  id: string;
  assetId: string;
  weight: number;
}

export type StrategyNode = StrategyGroupNode | StrategyLeafNode;

export interface Strategy {
  id: string;
  name: string;
  root: StrategyGroupNode;
  generatedPortfolioIds: string[];
  createdAt: string;
  updatedAt: string;
}

// --- Transactions & Holdings ---

export type TransactionType = 'buy' | 'sell' | 'dividend';

export interface Transaction {
  id: string;
  portfolioId: string;
  type: TransactionType;
  assetId: string;
  date: string;
  quantity: number | null;
  price: number | null;
  fee: number;
  amount: number | null;
  withholdingTax: number;
  currency: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Holding {
  assetId: string;
  quantity: number;
  avgCostBasis: number;
  totalCost: number;
  currentPrice: number;
  currentValue: number;
  unrealizedGain: number;
  unrealizedGainPercent: number;
  weight: number;
}

export interface HoldingLot {
  assetId: string;
  quantity: number;
  purchasePrice: number;
  purchaseDate: string;
}

export interface RealizedGain {
  assetId: string;
  sellDate: string;
  quantity: number;
  costBasis: number;
  proceeds: number;
  gain: number;
}

export interface DriftItem {
  assetId: string;
  modelWeight: number;
  actualWeight: number;
  drift: number;
}

export interface CurrencyRate {
  pair: string; // e.g. "USDEUR"
  rates: Array<{ date: string; rate: number }>;
}

// --- Metrics ---

export interface PeriodMetrics {
  cumulativeReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

export type PeriodKey = '1y' | '3y' | '5y' | '10y' | '15y' | 'all';

export interface MetricsResult {
  assetId: string;
  periods: Record<PeriodKey, PeriodMetrics | null>;
}

export interface CorrelationMatrix {
  assetIds: string[];
  matrix: number[][]; // assetIds.length x assetIds.length
}

// --- Monte Carlo ---

export interface MonteCarloConfig {
  simulationCount: number;
  assetIds: string[];
  riskFreeRate: number;
  benchmarkPortfolioId: string | null;
}

export interface SimulatedPortfolio {
  weights: Record<string, number>; // assetId -> weight
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
}

export interface MonteCarloResult {
  /** Compact scatter data — typed arrays for zero-copy worker transfer. */
  scatterVolatilities: Float64Array;
  scatterReturns: Float64Array;
  portfolioCount: number;
  efficientFrontier: SimulatedPortfolio[];
}

// --- CSV Parsing ---

export interface DetectedFormat {
  delimiter: string; // ',' | ';' | '\t'
  decimalSeparator: string; // '.' | ','
  dateFormat: string; // e.g. 'DD.MM.YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'
  hasHeader: boolean;
  dateColumn: number;
  closeColumn: number;
  ambiguous?: boolean; // true when DD/MM vs MM/DD cannot be distinguished
}

export interface ParseResult {
  prices: PricePoint[];
  detectedFormat: DetectedFormat;
  warnings: string[];
  rowCount: number;
}

// --- Settings ---

export interface SettingEntry {
  key: string;
  value: unknown;
}

// --- Simulation storage ---

export interface StoredSimulation {
  id: string;
  config: MonteCarloConfig;
  results: MonteCarloResult;
  createdAt: string;
}

// --- Worker Messages ---

export type CalcWorkerRequest =
  | {
      type: 'calculate-metrics';
      payload: {
        assetId: string;
        prices: PricePoint[];
        riskFreeRate: number;
        currencyConversion?: {
          currencyRate: CurrencyRate;
          sourceCurrency: string;
          targetCurrency: string;
        };
      };
    }
  | {
      type: 'calculate-correlation';
      payload: {
        assets: Array<{ id: string; prices: PricePoint[] }>;
      };
    };

export type CalcWorkerResponse =
  | {
      type: 'metrics-result';
      payload: { assetId: string; result: MetricsResult };
    }
  | {
      type: 'correlation-result';
      payload: CorrelationMatrix;
    }
  | {
      type: 'error';
      payload: { message: string };
    };

export type MonteCarloWorkerRequest = {
  type: 'run-simulation';
  payload: {
    config: MonteCarloConfig;
    assets: Array<{ id: string; prices: PricePoint[] }>;
  };
};

export type MonteCarloWorkerResponse =
  | {
      type: 'simulation-progress';
      payload: { completed: number; total: number };
    }
  | {
      type: 'simulation-result';
      payload: MonteCarloResult;
    }
  | {
      type: 'error';
      payload: { message: string };
    };
