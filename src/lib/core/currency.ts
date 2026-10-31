/** Currency conversion, ECB pair planning, cross rates and rate merging (CU-1 … CU-4). */
import type { CurrencyRate, PricePoint } from '#lib/domain/types.ts';

export type ConversionStatus = 'same' | 'converted' | 'missing';

export interface ConversionResult {
	prices: PricePoint[];
	status: ConversionStatus;
}

/** Find a stored rate usable for `source → target` (direct or inverse pair). */
export function findRate(rates: readonly CurrencyRate[], source: string, target: string): { rate: CurrencyRate; invert: boolean } | null {
	const s = source.toUpperCase();
	const t = target.toUpperCase();
	const direct = rates.find((r) => r.pair === s + t && r.rates.length > 0);
	if (direct) return { rate: direct, invert: false };
	const inverse = rates.find((r) => r.pair === t + s && r.rates.length > 0);
	if (inverse) return { rate: inverse, invert: true };
	return null;
}

/**
 * Convert prices with forward-filled historical rates. Before the first known
 * rate, the earliest rate is used.
 */
export function convertWithRate(prices: readonly PricePoint[], rate: CurrencyRate, invert: boolean): PricePoint[] {
	const sorted = [...rate.rates].filter((r) => r.rate > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
	if (sorted.length === 0) return [...prices];
	const out: PricePoint[] = new Array(prices.length);
	let idx = 0;
	let current = sorted[0]!.rate;
	// Prices are expected ascending; fall back to binary search otherwise.
	let lastDate = '';
	for (let i = 0; i < prices.length; i++) {
		const p = prices[i]!;
		if (p.date < lastDate) {
			idx = 0;
			current = sorted[0]!.rate;
		}
		lastDate = p.date;
		while (idx < sorted.length && sorted[idx]!.date <= p.date) {
			current = sorted[idx]!.rate;
			idx++;
		}
		out[i] = { date: p.date, close: p.close * (invert ? 1 / current : current) };
	}
	return out;
}

export function convertPrices(
	prices: readonly PricePoint[],
	source: string,
	target: string,
	rates: readonly CurrencyRate[]
): ConversionResult {
	if (!source || source.toUpperCase() === target.toUpperCase()) return { prices: [...prices], status: 'same' };
	const found = findRate(rates, source, target);
	if (!found) return { prices: [...prices], status: 'missing' };
	return { prices: convertWithRate(prices, found.rate, found.invert), status: 'converted' };
}

/** Convert a single amount at a date. Returns null when no rate is available. */
export function convertAmount(amount: number, date: string, source: string, target: string, rates: readonly CurrencyRate[]): number | null {
	if (source.toUpperCase() === target.toUpperCase()) return amount;
	const found = findRate(rates, source, target);
	if (!found) return null;
	return convertWithRate([{ date, close: amount }], found.rate, found.invert)[0]!.close;
}

export const ECB_CURRENCIES = [
	'USD',
	'JPY',
	'GBP',
	'CHF',
	'AUD',
	'CAD',
	'SEK',
	'NOK',
	'DKK',
	'CZK',
	'HUF',
	'PLN',
	'RON',
	'BGN',
	'ISK',
	'TRY',
	'BRL',
	'CNY',
	'HKD',
	'IDR',
	'ILS',
	'INR',
	'KRW',
	'MXN',
	'MYR',
	'NZD',
	'PHP',
	'SGD',
	'THB',
	'ZAR'
] as const;
const ECB_SET = new Set<string>(ECB_CURRENCIES);

/** EUR-based pairs (`CCYEUR`) to fetch for the given asset/transaction currencies and main currency. */
export function neededEcbPairs(currencies: Iterable<string>, mainCurrency: string): string[] {
	const main = mainCurrency.toUpperCase();
	const needed = new Set<string>();
	let anyForeign = false;
	for (const c of currencies) {
		const ccy = c.toUpperCase();
		if (!ccy || ccy === main) continue;
		anyForeign = true;
		if (ccy !== 'EUR' && ECB_SET.has(ccy)) needed.add(ccy);
	}
	if (anyForeign && main !== 'EUR' && ECB_SET.has(main)) needed.add(main);
	return [...needed].sort().map((c) => `${c}EUR`);
}

/** Cross rate from two EUR-based series: `SRC/DST = SRCEUR / DSTEUR` on common dates. */
export function deriveCrossRate(sourceEur: CurrencyRate, targetEur: CurrencyRate, pair: string): CurrencyRate {
	const target = new Map(targetEur.rates.map((r) => [r.date, r.rate]));
	const rates: CurrencyRate['rates'] = [];
	for (const s of sourceEur.rates) {
		const t = target.get(s.date);
		if (t !== undefined && t > 0) rates.push({ date: s.date, rate: s.rate / t });
	}
	rates.sort((a, b) => (a.date < b.date ? -1 : 1));
	return { pair, rates };
}

/** Merge fetched rates into existing ones; existing (manual) values win on overlapping dates. */
export function mergeRates(existing: CurrencyRate | undefined, fetched: CurrencyRate): CurrencyRate {
	if (!existing) return { pair: fetched.pair, rates: [...fetched.rates] };
	const dates = new Set(existing.rates.map((r) => r.date));
	const rates = [...existing.rates, ...fetched.rates.filter((r) => !dates.has(r.date))];
	rates.sort((a, b) => (a.date < b.date ? -1 : 1));
	return { pair: existing.pair || fetched.pair, rates };
}
