/**
 * Data quality checks for asset price series.
 * Computes quick health metrics and flags suspicious data.
 */

import type { PricePoint } from '$lib/types';
import { annualizedVolatility } from './volatility';
import { annualizedLogReturn, computeLogReturns } from './returns';
import { daysBetween } from '$lib/utils/dates';

export interface DataQualityWarning {
  type: 'high_volatility' | 'negative_return' | 'few_data_points' | 'short_history' | 'large_daily_move';
  message: string;
}

export interface AssetHealthMetrics {
  annualizedReturn: number;
  volatility: number;
  maxDailyMove: number;
  dataPoints: number;
  historyDays: number;
  warnings: DataQualityWarning[];
}

/**
 * Compute quick health metrics and warnings for an asset.
 */
export function computeAssetHealth(prices: PricePoint[]): AssetHealthMetrics {
  const warnings: DataQualityWarning[] = [];
  const dataPoints = prices.length;

  if (dataPoints < 2) {
    return {
      annualizedReturn: 0,
      volatility: 0,
      maxDailyMove: 0,
      dataPoints,
      historyDays: 0,
      warnings: [{ type: 'few_data_points', message: 'Insufficient data (< 2 points)' }],
    };
  }

  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date));
  const historyDays = daysBetween(sorted[0].date, sorted[sorted.length - 1].date);
  const ret = annualizedLogReturn(sorted);
  const vol = annualizedVolatility(sorted);

  // Compute max single-day move from log returns
  const logRet = computeLogReturns(sorted);
  let maxDailyMove = 0;
  for (const r of logRet) {
    const absR = Math.abs(r);
    if (absR > maxDailyMove) maxDailyMove = absR;
  }

  // Check warnings
  if (dataPoints < 50) {
    warnings.push({
      type: 'few_data_points',
      message: `Only ${dataPoints} data points — metrics may be unreliable`,
    });
  }

  if (historyDays < 365) {
    warnings.push({
      type: 'short_history',
      message: `Only ${historyDays} days of history — less than 1 year`,
    });
  }

  if (vol > 0.8) {
    warnings.push({
      type: 'high_volatility',
      message: `Very high volatility (${(vol * 100).toFixed(0)}%) — data may be unreliable`,
    });
  }

  if (ret < -0.1) {
    warnings.push({
      type: 'negative_return',
      message: `Negative annualized return (${(ret * 100).toFixed(1)}%)`,
    });
  }

  if (maxDailyMove > 0.2) {
    warnings.push({
      type: 'large_daily_move',
      message: `Max single-day move of ${(maxDailyMove * 100).toFixed(1)}% — check for data errors`,
    });
  }

  return { annualizedReturn: ret, volatility: vol, maxDailyMove, dataPoints, historyDays, warnings };
}
