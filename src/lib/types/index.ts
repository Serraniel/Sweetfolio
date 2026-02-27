// --- Core data types ---

export interface PricePoint {
  date: string; // ISO 8601 date (YYYY-MM-DD)
  close: number;
}

export interface Asset {
  id: string;
  name: string;
  isin: string | null;
  wkn: string | null;
  currency: string;
  prices: PricePoint[];
  formatConfig: DetectedFormat | null;
  createdAt: string;
  updatedAt: string;
}

export interface Portfolio {
  id: string;
  name: string;
  allocations: Array<{ assetId: string; weight: number }>;
  isBenchmark: boolean;
  createdAt: string;
  updatedAt: string;
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
  portfolios: SimulatedPortfolio[];
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
