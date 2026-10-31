/** Merging freshly fetched prices into stored ones (SC-5). */
import type { PricePoint } from '#lib/domain/types.ts';
import { normalizeSeries } from './series.ts';

export interface PriceConflict {
	date: string;
	existingClose: number;
	fetchedClose: number;
}

export interface PriceMergeResult {
	merged: PricePoint[];
	conflicts: PriceConflict[];
	addedCount: number;
}

export const PRICE_CONFLICT_THRESHOLD = 0.01;

export function mergePrices(existing: readonly PricePoint[], fetched: readonly PricePoint[]): PriceMergeResult {
	const map = new Map(existing.map((p) => [p.date, p.close]));
	const conflicts: PriceConflict[] = [];
	let addedCount = 0;
	for (const f of fetched) {
		const e = map.get(f.date);
		if (e === undefined) {
			map.set(f.date, f.close);
			addedCount++;
		} else if (e !== 0 && Math.abs(f.close - e) / Math.abs(e) > PRICE_CONFLICT_THRESHOLD) {
			conflicts.push({ date: f.date, existingClose: e, fetchedClose: f.close });
		}
	}
	const merged = normalizeSeries([...map.entries()].map(([date, close]) => ({ date, close })));
	return { merged, conflicts, addedCount };
}

/** Apply chosen conflict resolutions (dates for which the fetched value should be used). */
export function applyPriceResolutions(prices: readonly PricePoint[], useFetched: ReadonlyMap<string, number>): PricePoint[] {
	return prices.map((p) => (useFetched.has(p.date) ? { date: p.date, close: useFetched.get(p.date)! } : p));
}
