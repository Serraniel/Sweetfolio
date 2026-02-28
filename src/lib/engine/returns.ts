/**
 * Return calculations: log returns, cumulative returns, annualized returns.
 */

import type { PricePoint } from '$lib/types';
import { daysBetween } from '$lib/utils/dates';

/**
 * Compute log returns: r(t) = ln(P(t) / P(t-1))
 * Non-positive prices are skipped and a warning is added.
 */
export function computeLogReturns(
  prices: PricePoint[],
  warnings?: string[],
): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1].close > 0 && prices[i].close > 0) {
      returns.push(Math.log(prices[i].close / prices[i - 1].close));
    } else {
      warnings?.push(
        `Non-positive price at ${prices[i - 1].close <= 0 ? prices[i - 1].date : prices[i].date}, skipping data point`,
      );
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
 * Annualized return using trading days (252) for consistency with volatility.
 * Calendar days are converted to approximate trading days for the exponent.
 */
export function annualizedReturn(prices: PricePoint[]): number {
  if (prices.length < 2) return 0;
  const cumRet = cumulativeReturn(prices);
  const calendarDays = daysBetween(prices[0].date, prices[prices.length - 1].date);
  if (calendarDays <= 0) return 0;
  const tradingDays = calendarDays * 252 / 365.25;
  // Handle negative cumulative returns that would make base negative
  const base = 1 + cumRet;
  if (base <= 0) return -1;
  return Math.pow(base, 252 / tradingDays) - 1;
}

const TRADING_DAYS_PER_YEAR = 252;

/**
 * Annualized return using mean of log returns * 252.
 * This is the continuously compounded expected return — the same formula
 * used by the Monte Carlo simulation worker for portfolio returns.
 * Use this when plotting alongside MC simulation results.
 */
export function annualizedLogReturn(prices: PricePoint[]): number {
  const logRet = computeLogReturns(prices);
  if (logRet.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < logRet.length; i++) sum += logRet[i];
  return (sum / logRet.length) * TRADING_DAYS_PER_YEAR;
}
