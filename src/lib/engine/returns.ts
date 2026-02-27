/**
 * Return calculations: log returns, cumulative returns, annualized returns.
 */

import type { PricePoint } from '$lib/types';
import { daysBetween } from '$lib/utils/dates';

/**
 * Compute log returns: r(t) = ln(P(t) / P(t-1))
 */
export function computeLogReturns(prices: PricePoint[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1].close > 0 && prices[i].close > 0) {
      returns.push(Math.log(prices[i].close / prices[i - 1].close));
    } else {
      returns.push(0);
    }
  }
  return returns;
}

/**
 * Cumulative return over a price series: (P_end / P_start) - 1
 */
export function cumulativeReturn(prices: PricePoint[]): number {
  if (prices.length < 2) return 0;
  const start = prices[0].close;
  const end = prices[prices.length - 1].close;
  if (start <= 0) return 0;
  return end / start - 1;
}

/**
 * Annualized return: (1 + cumulative)^(365.25 / days) - 1
 */
export function annualizedReturn(prices: PricePoint[]): number {
  if (prices.length < 2) return 0;
  const cumRet = cumulativeReturn(prices);
  const days = daysBetween(prices[0].date, prices[prices.length - 1].date);
  if (days <= 0) return 0;
  // Handle negative cumulative returns that would make base negative
  const base = 1 + cumRet;
  if (base <= 0) return -1;
  return Math.pow(base, 365.25 / days) - 1;
}
