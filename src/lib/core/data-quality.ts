/** Quick health metrics and warnings for an asset's price history (AM-5). */
import type { PricePoint } from '#lib/domain/types.ts';
import { daysBetween } from './dates.ts';
import { annualizedLogReturn, annualizedVolatility, seriesLogReturns } from './metrics.ts';
import { ensureSorted } from './series.ts';

export type DataQualityWarningType = 'few_data_points' | 'short_history' | 'high_volatility' | 'negative_return' | 'large_daily_move';

export interface DataQualityWarning {
	type: DataQualityWarningType;
	message: string;
}

export interface AssetHealth {
	annualizedReturn: number;
	volatility: number;
	maxDailyMove: number;
	dataPoints: number;
	historyDays: number;
	warnings: DataQualityWarning[];
}

export function computeAssetHealth(input: readonly PricePoint[]): AssetHealth {
	const prices = ensureSorted(input);
	const dataPoints = prices.length;
	if (dataPoints < 2) {
		return {
			annualizedReturn: 0,
			volatility: 0,
			maxDailyMove: 0,
			dataPoints,
			historyDays: 0,
			warnings: [{ type: 'few_data_points', message: 'Insufficient data (fewer than 2 prices)' }]
		};
	}
	const historyDays = daysBetween(prices[0]!.date, prices[dataPoints - 1]!.date);
	const ret = annualizedLogReturn(prices);
	const vol = annualizedVolatility(prices);
	let maxDailyMove = 0;
	for (const r of seriesLogReturns(prices)) maxDailyMove = Math.max(maxDailyMove, Math.abs(r));

	const warnings: DataQualityWarning[] = [];
	if (dataPoints < 50) warnings.push({ type: 'few_data_points', message: `Only ${dataPoints} data points — metrics may be unreliable` });
	if (historyDays < 365) warnings.push({ type: 'short_history', message: `Only ${historyDays} days of history — less than 1 year` });
	if (vol > 0.8) warnings.push({ type: 'high_volatility', message: `Very high volatility (${(vol * 100).toFixed(0)} %) — check the data` });
	if (ret < -0.1) warnings.push({ type: 'negative_return', message: `Negative annualized return (${(ret * 100).toFixed(1)} %)` });
	if (maxDailyMove > 0.2)
		warnings.push({
			type: 'large_daily_move',
			message: `Largest single-day move ${(maxDailyMove * 100).toFixed(1)} % — check for data errors`
		});
	return { annualizedReturn: ret, volatility: vol, maxDailyMove, dataPoints, historyDays, warnings };
}
