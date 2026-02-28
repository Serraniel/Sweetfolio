/**
 * Thin helper for creating and communicating with Web Workers.
 * Uses Vite's ?worker import for proper bundling.
 */

import type {
  CalcWorkerRequest,
  CalcWorkerResponse,
  MonteCarloWorkerRequest,
  MonteCarloWorkerResponse,
  PricePoint,
  MetricsResult,
  CorrelationMatrix,
  CurrencyRate,
} from '$lib/types';

import CalcWorkerModule from './calc.worker?worker';
import MonteCarloWorkerModule from './montecarlo.worker?worker';

/** Default worker timeout: 60 seconds */
const DEFAULT_TIMEOUT_MS = 60_000;

/** Create a new calc worker instance. */
export function createCalcWorker(): Worker {
  return new CalcWorkerModule();
}

/** Create a new Monte Carlo worker instance. */
export function createMonteCarloWorker(): Worker {
  return new MonteCarloWorkerModule();
}

/**
 * One-shot metric calculation: creates a worker, sends the request,
 * waits for the result, and terminates the worker.
 * Includes a timeout to prevent hanging workers.
 */
export function calculateMetrics(
  assetId: string,
  prices: PricePoint[],
  riskFreeRate: number = 0,
  currencyConversion?: {
    currencyRate: CurrencyRate;
    sourceCurrency: string;
    targetCurrency: string;
  },
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<MetricsResult> {
  return new Promise((resolve, reject) => {
    const worker = createCalcWorker();
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        worker.terminate();
        reject(new Error(`Metrics calculation timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    worker.onmessage = (event: MessageEvent<CalcWorkerResponse>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const msg = event.data;
      if (msg.type === 'metrics-result') {
        resolve(msg.payload.result);
      } else if (msg.type === 'error') {
        reject(new Error(msg.payload.message));
      }
      worker.terminate();
    };

    worker.onerror = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
      worker.terminate();
    };

    const request: CalcWorkerRequest = {
      type: 'calculate-metrics',
      payload: { assetId, prices, riskFreeRate, currencyConversion },
    };
    worker.postMessage(request);
  });
}

/**
 * One-shot correlation calculation with timeout.
 */
export function calculateCorrelation(
  assets: Array<{ id: string; prices: PricePoint[] }>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<CorrelationMatrix> {
  return new Promise((resolve, reject) => {
    const worker = createCalcWorker();
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        worker.terminate();
        reject(new Error(`Correlation calculation timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    worker.onmessage = (event: MessageEvent<CalcWorkerResponse>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const msg = event.data;
      if (msg.type === 'correlation-result') {
        resolve(msg.payload);
      } else if (msg.type === 'error') {
        reject(new Error(msg.payload.message));
      }
      worker.terminate();
    };

    worker.onerror = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
      worker.terminate();
    };

    const request: CalcWorkerRequest = {
      type: 'calculate-correlation',
      payload: { assets },
    };
    worker.postMessage(request);
  });
}
