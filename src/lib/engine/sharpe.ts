/**
 * Sharpe ratio: (annualized return - risk-free rate) / annualized volatility
 */

import type { PricePoint } from '$lib/types';
import { annualizedReturn } from './returns';
import { annualizedVolatility } from './volatility';

export function sharpeRatio(
  prices: PricePoint[],
  riskFreeRate: number = 0,
): number {
  const ret = annualizedReturn(prices);
  const vol = annualizedVolatility(prices);
  if (vol === 0) return 0;
  return (ret - riskFreeRate) / vol;
}
