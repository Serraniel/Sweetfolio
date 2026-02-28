/**
 * Weighted portfolio return calculations from constituent assets.
 */

import type { PricePoint } from '$lib/types';
import { alignPriceSeries } from '$lib/utils/dates';

/**
 * Compute a synthetic portfolio price series from weighted constituent assets.
 * Prices are rebased to 100 at the start, then combined using weights.
 */
export function computePortfolioPrices(
  assets: Array<{ id: string; prices: PricePoint[]; weight: number }>,
): PricePoint[] {
  if (assets.length === 0) return [];

  const { dates, alignedSeries } = alignPriceSeries(assets.map((a) => a.prices));
  if (dates.length === 0) return [];

  // Normalize weights to sum to 1
  const rawWeights = assets.map((a) => a.weight);
  const totalWeight = rawWeights.reduce((sum, w) => sum + w, 0);
  const weights = totalWeight > 0 ? rawWeights.map((w) => w / totalWeight) : rawWeights;

  // Rebase each series to 100
  const rebased = alignedSeries.map((series) => {
    const base = series[0];
    if (base === 0) return series;
    return series.map((v) => (v / base) * 100);
  });

  // Compute weighted portfolio value at each date
  const portfolioPrices: PricePoint[] = [];
  for (let t = 0; t < dates.length; t++) {
    let value = 0;
    for (let i = 0; i < rebased.length; i++) {
      value += rebased[i][t] * weights[i];
    }
    portfolioPrices.push({ date: dates[t], close: value });
  }

  return portfolioPrices;
}
