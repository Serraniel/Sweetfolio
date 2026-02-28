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
} from '$lib/types';
import { alignPriceSeries } from '$lib/utils/dates';
import { logReturns, mean, stddev } from '$lib/utils/math';

const TRADING_DAYS_PER_YEAR = 252;
const PROGRESS_INTERVAL = 500;

self.onmessage = (event: MessageEvent<MonteCarloWorkerRequest>) => {
  const { config, assets } = event.data.payload;

  try {
    const result = runSimulation(config.simulationCount, config.riskFreeRate, assets);
    const response: MonteCarloWorkerResponse = {
      type: 'simulation-result',
      payload: result,
    };
    self.postMessage(response);
  } catch (error) {
    const response: MonteCarloWorkerResponse = {
      type: 'error',
      payload: { message: error instanceof Error ? error.message : String(error) },
    };
    self.postMessage(response);
  }
};

function runSimulation(
  simulationCount: number,
  riskFreeRate: number,
  assets: Array<{ id: string; prices: PricePoint[] }>,
): MonteCarloResult {
  const n = assets.length;
  if (n === 0) return { portfolios: [], efficientFrontier: [] };

  // Align and compute log returns for all assets
  const { alignedSeries } = alignPriceSeries(assets.map((a) => a.prices));
  const assetReturns = alignedSeries.map((prices) => logReturns(prices));

  // Pre-compute per-asset annualized stats
  const assetMeans = assetReturns.map((r) => mean(r) * TRADING_DAYS_PER_YEAR);
  const assetIds = assets.map((a) => a.id);

  // Pre-compute covariance matrix for portfolio volatility
  const covMatrix = computeCovarianceMatrix(assetReturns);

  const portfolios: SimulatedPortfolio[] = [];
  const seen = new Set<string>();

  for (let sim = 0; sim < simulationCount; sim++) {
    // Generate random weights (non-negative, sum to 1, discrete steps)
    const weights = generateRandomWeights(n);

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

  return { portfolios, efficientFrontier };
}

/**
 * Generate a random weight vector with discrete allocation steps.
 *
 * Rules:
 * - Weights are multiples of STEP (0.5% = 0.005)
 * - Each weight is either 0% (excluded from portfolio) or >= MIN_WEIGHT (3%)
 * - All weights sum to 1.0
 *
 * Uses Dirichlet-based generation, then snaps to the step grid while
 * enforcing the minimum allocation constraint.
 */
const STEP = 0.005; // 0.5%
const MIN_WEIGHT = 0.03; // 3%

function generateRandomWeights(n: number): number[] {
  // Generate raw Dirichlet weights
  const raw = new Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    raw[i] = -Math.log(Math.random() || 1e-10);
    sum += raw[i];
  }
  for (let i = 0; i < n; i++) {
    raw[i] /= sum;
  }

  // Snap to step grid: weights below MIN_WEIGHT become 0 (excluded)
  const snapped = new Array(n);
  let snappedSum = 0;
  for (let i = 0; i < n; i++) {
    if (raw[i] < MIN_WEIGHT) {
      snapped[i] = 0;
    } else {
      snapped[i] = Math.round(raw[i] / STEP) * STEP;
      snappedSum += snapped[i];
    }
  }

  // If all got zeroed out, give equal weight to the two largest raw weights
  if (snappedSum === 0) {
    const sorted = raw.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
    snapped[sorted[0].i] = 0.5;
    snapped[sorted[1].i] = 0.5;
    return snapped;
  }

  // Normalize to sum to 1.0, re-snap to grid
  for (let i = 0; i < n; i++) {
    if (snapped[i] > 0) {
      snapped[i] = Math.round((snapped[i] / snappedSum) / STEP) * STEP;
    }
  }

  // Fix rounding residual: adjust the largest weight
  let finalSum = 0;
  let maxIdx = 0;
  for (let i = 0; i < n; i++) {
    finalSum += snapped[i];
    if (snapped[i] > snapped[maxIdx]) maxIdx = i;
  }
  const residual = Math.round((1.0 - finalSum) / STEP) * STEP;
  snapped[maxIdx] += residual;

  // Ensure minimum constraint still holds after adjustment
  if (snapped[maxIdx] < MIN_WEIGHT && snapped[maxIdx] > 0) {
    snapped[maxIdx] = MIN_WEIGHT;
  }

  return snapped;
}

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
