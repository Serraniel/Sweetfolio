/** Return, risk and drawdown metrics for price series (FM-1 … FM-5). */
import type { ISODate, MetricsResult, PeriodKey, PeriodMetrics, PricePoint } from '#lib/domain/types.ts';
import { daysBetween, subtractYears } from './dates.ts';
import { logReturns, mean, stddev } from './math.ts';
import { ensureSorted, filterByDateRange } from './series.ts';

export const TRADING_DAYS = 252;
export const PERIOD_YEARS: Record<PeriodKey, number | null> = {
	'1y': 1,
	'3y': 3,
	'5y': 5,
	'10y': 10,
	'15y': 15,
	all: null
};
/** A period counts as covered when the first observation is at most this many days after its start. */
const COVERAGE_TOLERANCE_DAYS = 7;

export function seriesLogReturns(prices: readonly PricePoint[]): number[] {
	return logReturns(prices.map((p) => p.close));
}

export function cumulativeReturn(prices: readonly PricePoint[]): number {
	if (prices.length < 2) return 0;
	const start = prices[0]!.close;
	if (start <= 0) return 0;
	return prices[prices.length - 1]!.close / start - 1;
}

/** Geometric annualized return over calendar time: (1 + cum)^(365.25 / days) − 1. */
export function annualizedReturn(prices: readonly PricePoint[]): number {
	if (prices.length < 2) return 0;
	const days = daysBetween(prices[0]!.date, prices[prices.length - 1]!.date);
	if (days <= 0) return 0;
	const base = 1 + cumulativeReturn(prices);
	if (base <= 0) return -1;
	return Math.pow(base, 365.25 / days) - 1;
}

/** Mean daily log return × 252 — the estimator used by the Monte Carlo simulation. */
export function annualizedLogReturn(prices: readonly PricePoint[]): number {
	const r = seriesLogReturns(prices);
	return r.length ? mean(r) * TRADING_DAYS : 0;
}

export function annualizedVolatility(prices: readonly PricePoint[]): number {
	const r = seriesLogReturns(prices);
	if (r.length < 2) return 0;
	return stddev(r) * Math.sqrt(TRADING_DAYS);
}

export function sharpeRatio(annReturn: number, volatility: number, riskFreeRate = 0): number {
	return volatility === 0 ? 0 : (annReturn - riskFreeRate) / volatility;
}

export function maxDrawdown(prices: readonly PricePoint[]): number {
	let peak = -Infinity;
	let maxDD = 0;
	for (const p of prices) {
		if (p.close > peak) peak = p.close;
		if (peak > 0) {
			const dd = p.close / peak - 1;
			if (dd < maxDD) maxDD = dd;
		}
	}
	return maxDD;
}

export function drawdownSeries(prices: readonly PricePoint[]): PricePoint[] {
	let peak = -Infinity;
	return prices.map((p) => {
		if (p.close > peak) peak = p.close;
		return { date: p.date, close: peak > 0 ? p.close / peak - 1 : 0 };
	});
}

export function periodMetrics(prices: readonly PricePoint[], riskFreeRate = 0): PeriodMetrics {
	const ann = annualizedReturn(prices);
	const vol = annualizedVolatility(prices);
	return {
		cumulativeReturn: cumulativeReturn(prices),
		annualizedReturn: ann,
		volatility: vol,
		sharpeRatio: sharpeRatio(ann, vol, riskFreeRate),
		maxDrawdown: maxDrawdown(prices),
		startDate: prices[0]?.date ?? '',
		endDate: prices[prices.length - 1]?.date ?? ''
	};
}

/** Slice of a sorted series covering the last `years`, or null when the series is too short. */
export function periodSlice(sorted: readonly PricePoint[], years: number | null): PricePoint[] | null {
	if (sorted.length < 2) return null;
	if (years === null) return [...sorted];
	const end = sorted[sorted.length - 1]!.date;
	const start = subtractYears(end, years);
	if (daysBetween(start, sorted[0]!.date) > COVERAGE_TOLERANCE_DAYS) return null;
	const slice = filterByDateRange(sorted, start, end);
	return slice.length >= 2 ? slice : null;
}

/**
 * Metrics for all periods. `riskFreeRate` is a fraction (0.02 = 2 %).
 */
export function computeMetrics(prices: readonly PricePoint[], riskFreeRate = 0): MetricsResult {
	const sorted = ensureSorted(prices);
	const result = {} as MetricsResult;
	for (const [key, years] of Object.entries(PERIOD_YEARS) as Array<[PeriodKey, number | null]>) {
		const slice = periodSlice(sorted, years);
		result[key] = slice ? periodMetrics(slice, riskFreeRate) : null;
	}
	return result;
}

export function availablePeriods(prices: readonly PricePoint[]): Set<PeriodKey> {
	const sorted = ensureSorted(prices);
	const out = new Set<PeriodKey>();
	for (const [key, years] of Object.entries(PERIOD_YEARS) as Array<[PeriodKey, number | null]>) {
		if (periodSlice(sorted, years)) out.add(key);
	}
	return out;
}

export function dateRange(prices: readonly PricePoint[]): { start: ISODate; end: ISODate } | null {
	if (!prices.length) return null;
	return { start: prices[0]!.date, end: prices[prices.length - 1]!.date };
}
