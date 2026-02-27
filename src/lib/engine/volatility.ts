/**
 * Volatility calculation: annualized standard deviation of daily log returns.
 * Annualization factor: sqrt(252) trading days.
 */

import type { PricePoint } from '$lib/types';
import { stddev } from '$lib/utils/math';
import { computeLogReturns } from './returns';

const TRADING_DAYS_PER_YEAR = 252;

/**
 * Annualized volatility from a price series.
 * Uses sample standard deviation (N-1 denominator) as is standard in finance.
 */
export function annualizedVolatility(prices: PricePoint[]): number {
  const logRet = computeLogReturns(prices);
  if (logRet.length < 2) return 0;
  const dailyStdDev = stddev(logRet, false); // sample stddev
  return dailyStdDev * Math.sqrt(TRADING_DAYS_PER_YEAR);
}
