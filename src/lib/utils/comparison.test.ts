import { describe, it, expect } from 'vitest';
import {
	formatPercent,
	formatNumber,
	getMetricValue,
	valueClass,
	bestInRow
} from './comparison';
import type { MetricsResult, PeriodKey } from '$lib/types';

// --- Helper to build a MetricsResult ---
function makeMetrics(
	assetId: string,
	allMetrics: {
		cumulativeReturn: number;
		annualizedReturn: number;
		volatility: number;
		sharpeRatio: number;
		maxDrawdown: number;
	}
): MetricsResult {
	return {
		assetId,
		periods: {
			'1y': { ...allMetrics },
			'3y': null,
			'5y': null,
			'10y': null,
			'15y': null,
			all: { ...allMetrics }
		}
	};
}

describe('formatPercent', () => {
	it('formats positive values correctly', () => {
		expect(formatPercent(0.1234)).toBe('12.34%');
	});

	it('formats negative values correctly', () => {
		expect(formatPercent(-0.0567)).toBe('-5.67%');
	});

	it('formats zero', () => {
		expect(formatPercent(0)).toBe('0.00%');
	});

	it('returns dash for undefined', () => {
		expect(formatPercent(undefined)).toBe('\u2014');
	});

	it('returns dash for null', () => {
		expect(formatPercent(null)).toBe('\u2014');
	});
});

describe('formatNumber', () => {
	it('formats positive values to 3 decimals', () => {
		expect(formatNumber(1.2346)).toBe('1.235');
	});

	it('formats negative values', () => {
		expect(formatNumber(-0.5)).toBe('-0.500');
	});

	it('formats zero', () => {
		expect(formatNumber(0)).toBe('0.000');
	});

	it('returns dash for undefined', () => {
		expect(formatNumber(undefined)).toBe('\u2014');
	});

	it('returns dash for null', () => {
		expect(formatNumber(null)).toBe('\u2014');
	});
});

describe('getMetricValue', () => {
	const metricsMap = new Map<string, MetricsResult>();
	metricsMap.set(
		'asset-1',
		makeMetrics('asset-1', {
			cumulativeReturn: 0.15,
			annualizedReturn: 0.07,
			volatility: 0.2,
			sharpeRatio: 0.35,
			maxDrawdown: -0.12
		})
	);

	it('returns the correct metric for a valid asset and period', () => {
		expect(getMetricValue(metricsMap, 'asset-1', '1y', 'cumulativeReturn')).toBe(0.15);
		expect(getMetricValue(metricsMap, 'asset-1', 'all', 'volatility')).toBe(0.2);
		expect(getMetricValue(metricsMap, 'asset-1', '1y', 'sharpeRatio')).toBe(0.35);
	});

	it('returns undefined for unknown asset', () => {
		expect(getMetricValue(metricsMap, 'unknown', '1y', 'cumulativeReturn')).toBeUndefined();
	});

	it('returns undefined for null period', () => {
		expect(getMetricValue(metricsMap, 'asset-1', '3y', 'cumulativeReturn')).toBeUndefined();
	});

	it('returns undefined for unknown metric key', () => {
		expect(getMetricValue(metricsMap, 'asset-1', '1y', 'nonExistent')).toBeUndefined();
	});
});

describe('valueClass', () => {
	it('returns "negative" for maxDrawdown regardless of value', () => {
		expect(valueClass('maxDrawdown', -0.1)).toBe('negative');
		expect(valueClass('maxDrawdown', 0)).toBe('negative');
	});

	it('returns "positive" for positive cumulative return', () => {
		expect(valueClass('cumulativeReturn', 0.05)).toBe('positive');
	});

	it('returns "negative" for negative cumulative return', () => {
		expect(valueClass('cumulativeReturn', -0.03)).toBe('negative');
	});

	it('returns "positive" for positive annualized return', () => {
		expect(valueClass('annualizedReturn', 0.1)).toBe('positive');
	});

	it('returns "negative" for negative annualized return', () => {
		expect(valueClass('annualizedReturn', -0.02)).toBe('negative');
	});

	it('returns "positive" for zero return (>=0)', () => {
		expect(valueClass('cumulativeReturn', 0)).toBe('positive');
		expect(valueClass('annualizedReturn', 0)).toBe('positive');
	});

	it('returns empty string for volatility', () => {
		expect(valueClass('volatility', 0.2)).toBe('');
	});

	it('returns empty string for sharpeRatio', () => {
		expect(valueClass('sharpeRatio', 1.5)).toBe('');
	});

	it('returns empty string for undefined', () => {
		expect(valueClass('cumulativeReturn', undefined)).toBe('');
	});

	it('returns empty string for null', () => {
		expect(valueClass('cumulativeReturn', null)).toBe('');
	});
});

describe('bestInRow', () => {
	const period: PeriodKey = '1y';

	const metricsMap = new Map<string, MetricsResult>();
	metricsMap.set(
		'a',
		makeMetrics('a', {
			cumulativeReturn: 0.2,
			annualizedReturn: 0.1,
			volatility: 0.15,
			sharpeRatio: 0.67,
			maxDrawdown: -0.08
		})
	);
	metricsMap.set(
		'b',
		makeMetrics('b', {
			cumulativeReturn: 0.1,
			annualizedReturn: 0.05,
			volatility: 0.1,
			sharpeRatio: 0.5,
			maxDrawdown: -0.15
		})
	);
	metricsMap.set(
		'c',
		makeMetrics('c', {
			cumulativeReturn: 0.3,
			annualizedReturn: 0.12,
			volatility: 0.25,
			sharpeRatio: 0.48,
			maxDrawdown: -0.05
		})
	);

	it('returns null when fewer than 2 assets', () => {
		expect(bestInRow(['a'], 'cumulativeReturn', metricsMap, period)).toBeNull();
		expect(bestInRow([], 'cumulativeReturn', metricsMap, period)).toBeNull();
	});

	it('picks highest cumulative return', () => {
		expect(bestInRow(['a', 'b', 'c'], 'cumulativeReturn', metricsMap, period)).toBe('c');
	});

	it('picks highest annualized return', () => {
		expect(bestInRow(['a', 'b', 'c'], 'annualizedReturn', metricsMap, period)).toBe('c');
	});

	it('picks highest sharpe ratio', () => {
		expect(bestInRow(['a', 'b', 'c'], 'sharpeRatio', metricsMap, period)).toBe('a');
	});

	it('picks lowest volatility (lower is better)', () => {
		expect(bestInRow(['a', 'b', 'c'], 'volatility', metricsMap, period)).toBe('b');
	});

	it('picks least negative max drawdown (closest to 0)', () => {
		expect(bestInRow(['a', 'b', 'c'], 'maxDrawdown', metricsMap, period)).toBe('c');
	});

	it('returns null when no metrics data exists', () => {
		const emptyMap = new Map<string, MetricsResult>();
		expect(bestInRow(['a', 'b'], 'cumulativeReturn', emptyMap, period)).toBeNull();
	});

	it('handles assets with null periods gracefully', () => {
		// period '3y' is null for all assets
		expect(bestInRow(['a', 'b', 'c'], 'cumulativeReturn', metricsMap, '3y')).toBeNull();
	});

	it('handles mixed availability (some assets have data, some do not)', () => {
		const partialMap = new Map<string, MetricsResult>();
		partialMap.set(
			'a',
			makeMetrics('a', {
				cumulativeReturn: 0.2,
				annualizedReturn: 0.1,
				volatility: 0.15,
				sharpeRatio: 0.67,
				maxDrawdown: -0.08
			})
		);
		// 'b' has no metrics
		expect(bestInRow(['a', 'b'], 'cumulativeReturn', partialMap, period)).toBe('a');
	});
});
