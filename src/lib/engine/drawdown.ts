/**
 * Maximum drawdown: largest peak-to-trough decline in price.
 */

import type { PricePoint } from '$lib/types';

/**
 * Compute max drawdown as a negative fraction (e.g. -0.25 for 25% decline).
 */
export function maxDrawdown(prices: PricePoint[]): number {
  if (prices.length < 2) return 0;

  let peak = prices[0].close;
  let maxDD = 0;

  for (let i = 1; i < prices.length; i++) {
    const price = prices[i].close;
    if (price > peak) {
      peak = price;
    }
    const dd = (price - peak) / peak;
    if (dd < maxDD) {
      maxDD = dd;
    }
  }

  return maxDD;
}

/**
 * Compute drawdown series (fraction below peak at each point).
 * Useful for drawdown charts.
 */
export function drawdownSeries(prices: PricePoint[]): Array<{ date: string; drawdown: number }> {
  if (prices.length === 0) return [];

  const result: Array<{ date: string; drawdown: number }> = [];
  let peak = prices[0].close;

  for (const p of prices) {
    if (p.close > peak) peak = p.close;
    result.push({
      date: p.date,
      drawdown: peak > 0 ? (p.close - peak) / peak : 0,
    });
  }

  return result;
}
