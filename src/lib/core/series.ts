/** Price series utilities: sorting, de-duplication, business-day alignment. */
import type { ISODate, PricePoint } from '#lib/domain/types.ts';
import { fromDayNumber, isWeekend, toDayNumber } from './dates.ts';

/** Sort ascending by date; for duplicate dates the last occurrence wins. Drops non-finite closes. */
export function normalizeSeries(prices: readonly PricePoint[]): PricePoint[] {
	const map = new Map<string, number>();
	for (const p of prices) {
		if (typeof p.close === 'number' && Number.isFinite(p.close)) map.set(p.date, p.close);
	}
	return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([date, close]) => ({ date, close }));
}

export function isSorted(prices: readonly PricePoint[]): boolean {
	for (let i = 1; i < prices.length; i++) if (prices[i - 1]!.date >= prices[i]!.date) return false;
	return true;
}

/** Ensure ascending, unique dates without copying when already normalized. */
export function ensureSorted(prices: readonly PricePoint[]): readonly PricePoint[] {
	return isSorted(prices) ? prices : normalizeSeries(prices);
}

export function filterByDateRange(prices: readonly PricePoint[], start: ISODate, end: ISODate): PricePoint[] {
	return prices.filter((p) => p.date >= start && p.date <= end);
}

/**
 * Forward-fill a series over all business days (Mon–Fri) between its first and
 * last date. Weekend observations are carried into the next business day.
 */
export function forwardFillBusinessDays(prices: readonly PricePoint[]): PricePoint[] {
	const sorted = ensureSorted(prices);
	if (sorted.length === 0) return [];
	const first = toDayNumber(sorted[0]!.date);
	const last = toDayNumber(sorted[sorted.length - 1]!.date);
	const out: PricePoint[] = [];
	let idx = 0;
	let lastClose = sorted[0]!.close;
	for (let day = first; day <= last; day++) {
		const iso = fromDayNumber(day);
		while (idx < sorted.length && sorted[idx]!.date <= iso) {
			lastClose = sorted[idx]!.close;
			idx++;
		}
		if (!isWeekend(day)) out.push({ date: iso, close: lastClose });
	}
	return out;
}

export interface AlignedSeries {
	dates: ISODate[];
	values: number[][];
}

/**
 * Align several series on the business days they all cover (intersection of
 * their ranges), forward-filling gaps.
 */
export function alignSeries(series: ReadonlyArray<readonly PricePoint[]>): AlignedSeries {
	if (series.length === 0) return { dates: [], values: [] };
	const sorted = series.map(ensureSorted);
	if (sorted.some((s) => s.length === 0)) return { dates: [], values: sorted.map(() => []) };
	let start = sorted[0]![0]!.date;
	let end = sorted[0]![sorted[0]!.length - 1]!.date;
	for (const s of sorted) {
		if (s[0]!.date > start) start = s[0]!.date;
		if (s[s.length - 1]!.date < end) end = s[s.length - 1]!.date;
	}
	if (start > end) return { dates: [], values: sorted.map(() => []) };

	const startDay = toDayNumber(start);
	const endDay = toDayNumber(end);
	const dates: ISODate[] = [];
	for (let d = startDay; d <= endDay; d++) if (!isWeekend(d)) dates.push(fromDayNumber(d));

	const values = sorted.map((s) => {
		const out = new Array<number>(dates.length);
		let idx = 0;
		let lastClose = s[0]!.close;
		// Seed with the last observation on or before the start date.
		while (idx < s.length && s[idx]!.date <= start) {
			lastClose = s[idx]!.close;
			idx++;
		}
		for (let i = 0; i < dates.length; i++) {
			const date = dates[i]!;
			while (idx < s.length && s[idx]!.date <= date) {
				lastClose = s[idx]!.close;
				idx++;
			}
			out[i] = lastClose;
		}
		return out;
	});
	return { dates, values };
}

/** Value of a series on a date (last observation on or before it), or null. */
export function valueAt(prices: readonly PricePoint[], date: ISODate): number | null {
	let lo = 0;
	let hi = prices.length - 1;
	let best = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >>> 1;
		if (prices[mid]!.date <= date) {
			best = mid;
			lo = mid + 1;
		} else hi = mid - 1;
	}
	return best >= 0 ? prices[best]!.close : null;
}

/** Rebase a series to start at `base` (default 100). */
export function rebase(prices: readonly PricePoint[], base = 100): PricePoint[] {
	const first = prices[0]?.close;
	if (!first) return prices.map((p) => ({ ...p }));
	return prices.map((p) => ({ date: p.date, close: (p.close / first) * base }));
}

export function latestPrice(prices: readonly PricePoint[]): PricePoint | null {
	return prices.length ? prices[prices.length - 1]! : null;
}
