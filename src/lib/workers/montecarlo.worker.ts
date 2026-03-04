/**
 * Monte Carlo simulation Web Worker.
 * Generates random portfolio weight vectors, computes return and volatility
 * for each, and extracts the efficient frontier.
 */

import type {
  MonteCarloWorkerRequest,
  MonteCarloWorkerResponse,
  PricePoint,
  SimulatedPortfolio,
  MonteCarloResult,
  WeightConstraint,
} from '$lib/types';
import { alignPriceSeries } from '$lib/utils/dates';
import { logReturns, mean, stddev } from '$lib/utils/math';
import { generateRandomWeights } from '$lib/engine/weights';

const TRADING_DAYS_PER_YEAR = 252;
const PROGRESS_INTERVAL = 500;

self.onmessage = (event: MessageEvent<MonteCarloWorkerRequest>) => {
  const { config, assets } = event.data.payload;

  try {
    const result = runSimulation(config, assets);
    const response: MonteCarloWorkerResponse = {
      type: 'simulation-result',
      payload: result,
    };
    // Transfer typed arrays for zero-copy (no structured clone overhead)
    self.postMessage(response, {
      transfer: [
        result.scatterVolatilities.buffer as ArrayBuffer,
        result.scatterReturns.buffer as ArrayBuffer,
      ],
    });
  } catch (error) {
    const response: MonteCarloWorkerResponse = {
      type: 'error',
      payload: { message: error instanceof Error ? error.message : String(error) },
    };
    self.postMessage(response);
  }
};

function runSimulation(
  config: import('$lib/types').MonteCarloConfig,
  assets: Array<{ id: string; prices: PricePoint[] }>,
): MonteCarloResult {
  const { simulationCount, riskFreeRate, constraints, defaultMinWeight, stepSize } = config;
  const n = assets.length;
  if (n === 0) return {
    scatterVolatilities: new Float64Array(0),
    scatterReturns: new Float64Array(0),
    portfolioCount: 0,
    efficientFrontier: [],
  };

  // Per-asset expected returns use each asset's FULL individual history.
  // This gives a better estimate since the mean only depends on one series.
  // (Hybrid approach per Stambaugh 1997 / practitioner convention.)
  const fullReturns = assets.map((a) => logReturns(a.prices.map((p) => p.close)));
  const assetMeans = fullReturns.map((r) => mean(r) * TRADING_DAYS_PER_YEAR);
  const assetIds = assets.map((a) => a.id);

  // Build per-asset constraint arrays (min/max weight for each position)
  const constraintMap = new Map<string, WeightConstraint>();
  if (constraints) {
    for (const c of constraints) constraintMap.set(c.assetId, c);
  }
  const defaultMin = defaultMinWeight ?? 0;
  const step = stepSize ?? 0.005;
  const mins = assetIds.map((id) => constraintMap.get(id)?.min ?? defaultMin);
  const maxs = assetIds.map((id) => constraintMap.get(id)?.max ?? 1);

  // Covariance matrix requires synchronized (contemporaneous) observations,
  // so we align all series to their common date intersection.
  const { alignedSeries } = alignPriceSeries(assets.map((a) => a.prices));
  const alignedReturns = alignedSeries.map((prices) => logReturns(prices));
  const covMatrix = computeCovarianceMatrix(alignedReturns);

  // Pre-allocate typed arrays at max capacity; trim after deduplication
  const volArr = new Float64Array(simulationCount);
  const retArr = new Float64Array(simulationCount);
  const sharpeArr = new Float64Array(simulationCount);
  // Keep full portfolio objects in a temp array for frontier extraction
  const portfolios: SimulatedPortfolio[] = [];
  const seen = new Set<string>();
  let count = 0;

  for (let sim = 0; sim < simulationCount; sim++) {
    // Generate random weights (non-negative, sum to 1, discrete steps, respecting constraints)
    const weights = generateRandomWeights(n, mins, maxs, Math.random, step);

    // Deduplicate: skip if we've seen this exact weight combo before
    const key = weights.map((w) => w.toFixed(3)).join(',');
    if (seen.has(key)) {
      // Report progress but skip duplicate
      if ((sim + 1) % PROGRESS_INTERVAL === 0 || sim === simulationCount - 1) {
        const progress: MonteCarloWorkerResponse = {
          type: 'simulation-progress',
          payload: { completed: sim + 1, total: simulationCount },
        };
        self.postMessage(progress);
      }
      continue;
    }
    seen.add(key);

    // Portfolio annualized return = sum(w_i * mean_return_i)
    let portReturn = 0;
    for (let i = 0; i < n; i++) {
      portReturn += weights[i] * assetMeans[i];
    }

    // Portfolio variance = w' * Cov * w (annualized)
    let portVariance = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        portVariance += weights[i] * weights[j] * covMatrix[i][j];
      }
    }
    const portVolatility = Math.sqrt(portVariance * TRADING_DAYS_PER_YEAR);

    const portSharpe = portVolatility > 0 ? (portReturn - riskFreeRate) / portVolatility : 0;

    volArr[count] = portVolatility;
    retArr[count] = portReturn;
    sharpeArr[count] = portSharpe;

    const weightMap: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      weightMap[assetIds[i]] = weights[i];
    }

    portfolios.push({
      weights: weightMap,
      annualizedReturn: portReturn,
      volatility: portVolatility,
      sharpeRatio: portSharpe,
    });
    count++;

    // Report progress periodically
    if ((sim + 1) % PROGRESS_INTERVAL === 0 || sim === simulationCount - 1) {
      const progress: MonteCarloWorkerResponse = {
        type: 'simulation-progress',
        payload: { completed: sim + 1, total: simulationCount },
      };
      self.postMessage(progress);
    }
  }

  const efficientFrontier = extractEfficientFrontier(portfolios);

  // Trim typed arrays to actual count and return compact result
  return {
    scatterVolatilities: volArr.subarray(0, count),
    scatterReturns: retArr.subarray(0, count),
    portfolioCount: count,
    efficientFrontier,
  };
}

// Weight generation is in $lib/engine/weights.ts (shared with tests)

function computeCovarianceMatrix(returns: number[][]): number[][] {
  const n = returns.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const means = returns.map((r) => mean(r));

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const len = Math.min(returns[i].length, returns[j].length);
      let sum = 0;
      for (let t = 0; t < len; t++) {
        sum += (returns[i][t] - means[i]) * (returns[j][t] - means[j]);
      }
      const cov = len > 1 ? sum / (len - 1) : 0;
      matrix[i][j] = cov;
      matrix[j][i] = cov;
    }
  }

  return matrix;
}

/**
 * Extract the efficient frontier: for each volatility bucket, keep the portfolio
 * with the highest return, then enforce monotonicity (higher vol → higher return).
 */
function extractEfficientFrontier(portfolios: SimulatedPortfolio[]): SimulatedPortfolio[] {
  if (portfolios.length === 0) return [];

  // Determine volatility range
  let minVol = Infinity;
  let maxVol = -Infinity;
  for (const p of portfolios) {
    if (p.volatility < minVol) minVol = p.volatility;
    if (p.volatility > maxVol) maxVol = p.volatility;
  }

  const bucketCount = Math.min(100, portfolios.length);
  const bucketWidth = (maxVol - minVol) / bucketCount;
  if (bucketWidth === 0) return [portfolios[0]];

  const buckets = new Map<number, SimulatedPortfolio>();

  for (const p of portfolios) {
    const bucket = Math.floor((p.volatility - minVol) / bucketWidth);
    const existing = buckets.get(bucket);
    if (!existing || p.annualizedReturn > existing.annualizedReturn) {
      buckets.set(bucket, p);
    }
  }

  const sorted = [...buckets.values()].sort((a, b) => a.volatility - b.volatility);

  // Enforce monotonicity: walk left-to-right, only keep points where
  // return >= max return seen so far. This eliminates zigzag.
  const frontier: SimulatedPortfolio[] = [];
  let maxReturn = -Infinity;
  for (const p of sorted) {
    if (p.annualizedReturn >= maxReturn) {
      frontier.push(p);
      maxReturn = p.annualizedReturn;
    }
  }

  return frontier;
}
