/** Backtest of a weighted model portfolio with optional periodic rebalancing (PM-2). */
import type { PricePoint, RebalanceFrequency } from '#lib/domain/types.ts';
import { alignSeries } from './series.ts';

export interface WeightedSeries {
	id: string;
	prices: readonly PricePoint[];
	weight: number;
}

export function normalizeWeights(weights: readonly number[]): number[] {
	const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
	if (total <= 0) return weights.map(() => (weights.length ? 1 / weights.length : 0));
	return weights.map((w) => Math.max(0, w) / total);
}

function periodKey(date: string, frequency: RebalanceFrequency): string {
	const y = date.slice(0, 4);
	const m = Number(date.slice(5, 7));
	switch (frequency) {
		case 'monthly':
			return `${y}-${m}`;
		case 'quarterly':
			return `${y}-Q${Math.floor((m - 1) / 3)}`;
		case 'annually':
			return y;
		default:
			return '';
	}
}

/**
 * Portfolio value series starting at 100. With `none` the initial units are
 * held (buy & hold); otherwise the portfolio is reset to target weights on the
 * first trading day of each new period.
 */
export function backtestPortfolio(
	assets: readonly WeightedSeries[],
	frequency: RebalanceFrequency = 'none',
	startValue = 100
): PricePoint[] {
	const active = assets.filter((a) => a.weight > 0 && a.prices.length > 0);
	if (active.length === 0) return [];
	const { dates, values } = alignSeries(active.map((a) => a.prices));
	if (dates.length === 0) return [];
	const weights = normalizeWeights(active.map((a) => a.weight));
	const n = active.length;

	const units = new Array<number>(n);
	const allocate = (t: number, total: number) => {
		for (let i = 0; i < n; i++) {
			const price = values[i]![t]!;
			units[i] = price > 0 ? (total * weights[i]!) / price : 0;
		}
	};
	allocate(0, startValue);

	const out: PricePoint[] = new Array(dates.length);
	let currentPeriod = periodKey(dates[0]!, frequency);
	for (let t = 0; t < dates.length; t++) {
		if (frequency !== 'none' && t > 0) {
			const p = periodKey(dates[t]!, frequency);
			if (p !== currentPeriod) {
				currentPeriod = p;
				let total = 0;
				for (let i = 0; i < n; i++) total += units[i]! * values[i]![t]!;
				allocate(t, total);
			}
		}
		let value = 0;
		for (let i = 0; i < n; i++) value += units[i]! * values[i]![t]!;
		out[t] = { date: dates[t]!, close: value };
	}
	return out;
}
