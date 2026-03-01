import type { MetricsResult, PeriodKey, PeriodMetrics } from '$lib/types';

/**
 * Format a decimal value as a percentage string.
 * Returns "—" for null/undefined values.
 */
export function formatPercent(value: number | undefined | null): string {
	if (value === undefined || value === null) return '\u2014';
	return (value * 100).toFixed(2) + '%';
}

/**
 * Format a number to 3 decimal places.
 * Returns "—" for null/undefined values.
 */
export function formatNumber(value: number | undefined | null): string {
	if (value === undefined || value === null) return '\u2014';
	return value.toFixed(3);
}

/**
 * Get a specific metric value for an asset at a given period.
 */
export function getMetricValue(
	metricsMap: Map<string, MetricsResult>,
	assetId: string,
	period: PeriodKey,
	metricKey: string
): number | undefined {
	const m = metricsMap.get(assetId);
	if (!m) return undefined;
	const periodData = m.periods[period];
	if (!periodData) return undefined;
	return (periodData as unknown as Record<string, number>)[metricKey];
}

/**
 * Determine the CSS class for a metric value (positive, negative, or empty).
 */
export function valueClass(key: string, value: number | undefined | null): string {
	if (value === undefined || value === null) return '';
	if (key === 'maxDrawdown') return 'negative';
	if (key === 'cumulativeReturn' || key === 'annualizedReturn') {
		return value >= 0 ? 'positive' : 'negative';
	}
	return '';
}

/**
 * Find the asset ID with the "best" value for a given metric among the provided assets.
 *
 * "Best" means:
 * - For maxDrawdown: closest to 0 (least negative)
 * - For volatility: lower is better
 * - For all others (return, sharpe): higher is better
 *
 * Returns null if fewer than 2 assets or no values are available.
 */
export function bestInRow(
	assetIds: string[],
	metricKey: string,
	metricsMap: Map<string, MetricsResult>,
	period: PeriodKey
): string | null {
	if (assetIds.length < 2) return null;
	let bestId: string | null = null;
	let bestVal: number | undefined;

	for (const id of assetIds) {
		const val = getMetricValue(metricsMap, id, period, metricKey);
		if (val === undefined) continue;

		if (bestVal === undefined) {
			bestVal = val;
			bestId = id;
			continue;
		}

		if (metricKey === 'maxDrawdown') {
			if (val > bestVal) { bestVal = val; bestId = id; }
		} else if (metricKey === 'volatility') {
			if (val < bestVal) { bestVal = val; bestId = id; }
		} else {
			if (val > bestVal) { bestVal = val; bestId = id; }
		}
	}
	return bestId;
}
