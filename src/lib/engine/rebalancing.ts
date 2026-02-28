/**
 * Portfolio rebalancing logic.
 * Computes a rebalanced portfolio price series where allocations are
 * periodically reset to target weights.
 */

import type { PricePoint } from '$lib/types';
import { alignPriceSeries } from '$lib/utils/dates';

export type RebalanceFrequency = 'monthly' | 'quarterly' | 'annually' | 'none';

/**
 * Compute a rebalanced portfolio price series.
 * At each rebalance date, portfolio weights are reset to target allocations.
 *
 * @param assets - Constituent assets with target weights
 * @param frequency - Rebalance frequency ('none' for buy-and-hold)
 * @returns Synthetic portfolio price series
 */
export function computeRebalancedPortfolioPrices(
  assets: Array<{ id: string; prices: PricePoint[]; weight: number }>,
  frequency: RebalanceFrequency = 'none',
): PricePoint[] {
  if (assets.length === 0) return [];

  const { dates, alignedSeries } = alignPriceSeries(assets.map((a) => a.prices));
  if (dates.length === 0) return [];

  // Normalize weights to sum to 1
  const rawWeights = assets.map((a) => a.weight);
  const totalWeight = rawWeights.reduce((sum, w) => sum + w, 0);
  const targetWeights = totalWeight > 0 ? rawWeights.map((w) => w / totalWeight) : rawWeights;

  if (frequency === 'none') {
    return computeBuyAndHold(dates, alignedSeries, targetWeights);
  }

  return computeWithRebalancing(dates, alignedSeries, targetWeights, frequency);
}

/**
 * Buy-and-hold: weights drift naturally with price changes.
 * Same as computePortfolioPrices but using aligned series directly.
 */
function computeBuyAndHold(
  dates: string[],
  alignedSeries: number[][],
  weights: number[],
): PricePoint[] {
  // Rebase each series to 100
  const rebased = alignedSeries.map((series) => {
    const base = series[0];
    if (base === 0) return series;
    return series.map((v) => (v / base) * 100);
  });

  const result: PricePoint[] = [];
  for (let t = 0; t < dates.length; t++) {
    let value = 0;
    for (let i = 0; i < rebased.length; i++) {
      value += rebased[i][t] * weights[i];
    }
    result.push({ date: dates[t], close: value });
  }
  return result;
}

/**
 * Rebalanced portfolio: at each rebalance date, reset allocations to target weights.
 */
function computeWithRebalancing(
  dates: string[],
  alignedSeries: number[][],
  targetWeights: number[],
  frequency: RebalanceFrequency,
): PricePoint[] {
  const n = alignedSeries.length;
  const startValue = 100;

  // Track how many "units" of each asset we hold
  let units = new Array(n);
  for (let i = 0; i < n; i++) {
    const assetValue = startValue * targetWeights[i];
    units[i] = alignedSeries[i][0] > 0 ? assetValue / alignedSeries[i][0] : 0;
  }

  const result: PricePoint[] = [];
  let lastRebalanceDate = dates[0];

  for (let t = 0; t < dates.length; t++) {
    // Compute current portfolio value
    let portfolioValue = 0;
    for (let i = 0; i < n; i++) {
      portfolioValue += units[i] * alignedSeries[i][t];
    }

    result.push({ date: dates[t], close: portfolioValue });

    // Check if we should rebalance (not on the last day)
    if (t < dates.length - 1 && shouldRebalance(lastRebalanceDate, dates[t], frequency)) {
      lastRebalanceDate = dates[t];
      // Rebalance: redistribute portfolio value according to target weights
      for (let i = 0; i < n; i++) {
        const assetValue = portfolioValue * targetWeights[i];
        units[i] = alignedSeries[i][t] > 0 ? assetValue / alignedSeries[i][t] : 0;
      }
    }
  }

  return result;
}

/**
 * Determine if a rebalance should occur based on the frequency.
 */
function shouldRebalance(
  lastRebalanceDate: string,
  currentDate: string,
  frequency: RebalanceFrequency,
): boolean {
  const last = new Date(lastRebalanceDate);
  const current = new Date(currentDate);

  switch (frequency) {
    case 'monthly':
      return current.getMonth() !== last.getMonth() || current.getFullYear() !== last.getFullYear();
    case 'quarterly': {
      const lastQ = Math.floor(last.getMonth() / 3);
      const currentQ = Math.floor(current.getMonth() / 3);
      return currentQ !== lastQ || current.getFullYear() !== last.getFullYear();
    }
    case 'annually':
      return current.getFullYear() !== last.getFullYear();
    default:
      return false;
  }
}
