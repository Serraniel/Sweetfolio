/**
 * Compute all financial metrics for an asset across all time periods.
 */

import type { PricePoint, MetricsResult, PeriodMetrics, PeriodKey } from '$lib/types';
import { cumulativeReturn, annualizedReturn } from './returns';
import { annualizedVolatility } from './volatility';
import { sharpeRatio } from './sharpe';
import { maxDrawdown } from './drawdown';
import { subtractYears, filterByDateRange } from '$lib/utils/dates';

const PERIOD_YEARS: Record<PeriodKey, number | null> = {
  '1y': 1,
  '3y': 3,
  '5y': 5,
  '10y': 10,
  '15y': 15,
  all: null,
};

/**
 * Compute metrics for all periods for a given price series.
 */
export function computeAllMetrics(
  assetId: string,
  prices: PricePoint[],
  riskFreeRate: number = 0,
): MetricsResult {
  if (prices.length === 0) {
    return {
      assetId,
      periods: { '1y': null, '3y': null, '5y': null, '10y': null, '15y': null, all: null },
    };
  }

  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date));
  const endDate = sorted[sorted.length - 1].date;

  const periods = {} as Record<PeriodKey, PeriodMetrics | null>;

  for (const [key, years] of Object.entries(PERIOD_YEARS) as [PeriodKey, number | null][]) {
    if (years === null) {
      periods[key] = computePeriodMetrics(sorted, riskFreeRate);
    } else {
      const startDate = subtractYears(endDate, years);
      const filtered = filterByDateRange(sorted, startDate, endDate);
      // Need at least 2 data points for meaningful metrics
      if (filtered.length < 2) {
        periods[key] = null;
      } else {
        periods[key] = computePeriodMetrics(filtered, riskFreeRate);
      }
    }
  }

  return { assetId, periods };
}

function computePeriodMetrics(
  prices: PricePoint[],
  riskFreeRate: number,
): PeriodMetrics {
  return {
    cumulativeReturn: cumulativeReturn(prices),
    annualizedReturn: annualizedReturn(prices),
    volatility: annualizedVolatility(prices),
    sharpeRatio: sharpeRatio(prices, riskFreeRate),
    maxDrawdown: maxDrawdown(prices),
  };
}
