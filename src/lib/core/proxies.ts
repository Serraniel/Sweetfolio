/**
 * Long-run proxy series for the crisis tester (CR-3). Assets rarely have
 * prices before 2005, so their history is extended backwards with a series
 * that matches their exposure:
 *   - equity and gold indices the user downloads from Onvista (not bundled),
 *   - US treasury returns modelled from FRED yields (bundled, public domain),
 *   - daily leverage applied to the index returns.
 */
import type { Exposure, ISODate, PricePoint } from '#lib/domain/types.ts';
import { fromDayNumber, toDayNumber } from './dates.ts';
import { valueAt } from './series.ts';

export interface ProxyIndexDef {
	key: string;
	label: string;
	entityType: string;
	entityValue: string;
	idNotation: number;
	currency: string;
	note: string;
}

/** Index histories fetched from Onvista on request; never bundled or exported. */
export const PROXY_INDICES: readonly ProxyIndexDef[] = [
	{
		key: 'sp500',
		label: 'S&P 500',
		entityType: 'INDEX',
		entityValue: '4359526',
		idNotation: 4359526,
		currency: 'USD',
		note: 'price index, daily from 1928'
	},
	{
		key: 'msciWorld',
		label: 'MSCI World',
		entityType: 'INDEX',
		entityValue: '3193857',
		idNotation: 3193857,
		currency: 'USD',
		note: 'price index, monthly 1970–1994, then daily'
	},
	{
		key: 'nasdaq100',
		label: 'NASDAQ 100',
		entityType: 'INDEX',
		entityValue: '325104',
		idNotation: 325104,
		currency: 'USD',
		note: 'price index, daily from 1993'
	},
	{
		key: 'msciEm',
		label: 'MSCI Emerging Markets',
		entityType: 'INDEX',
		entityValue: '1643097',
		idNotation: 1643097,
		currency: 'USD',
		note: 'price index, monthly from 1988, later daily'
	},
	{
		key: 'stoxx600',
		label: 'STOXX Europe 600',
		entityType: 'INDEX',
		entityValue: '193741',
		idNotation: 193741,
		currency: 'EUR',
		note: 'price index, monthly from 1992, later daily'
	},
	{
		key: 'dax',
		label: 'DAX',
		entityType: 'INDEX',
		entityValue: '20735',
		idNotation: 20735,
		currency: 'EUR',
		note: 'performance index, daily from 1988'
	},
	{
		key: 'gold',
		label: 'Gold spot',
		entityType: 'PRECIOUS_METAL',
		entityValue: '1326189',
		idNotation: 1326189,
		currency: 'USD',
		note: 'daily from 1995'
	}
];

export interface ProxyIndexData {
	key: string;
	currency: string;
	prices: PricePoint[];
	fetchedAt: string;
}

export interface EncodedSeries {
	start: ISODate;
	scale: number;
	d: number[];
	v: number[];
}

export interface CrisisRatesFile {
	source: string;
	generated: string;
	series: Record<'tbill' | 'short' | 'intermediate' | 'long' | 'usdeur', EncodedSeries>;
}

export interface CrisisRates {
	source: string;
	/** Yields in percent. */
	tbill: PricePoint[];
	short: PricePoint[];
	intermediate: PricePoint[];
	long: PricePoint[];
	/** EUR per USD. */
	usdeur: PricePoint[];
}

export function decodeSeries(s: EncodedSeries): PricePoint[] {
	const out: PricePoint[] = new Array(s.d.length);
	let day = toDayNumber(s.start);
	let value = 0;
	for (let i = 0; i < s.d.length; i++) {
		day += i === 0 ? 0 : s.d[i]!;
		value += s.v[i]!;
		out[i] = { date: fromDayNumber(day), close: value / s.scale };
	}
	return out;
}

export function decodeRates(file: CrisisRatesFile): CrisisRates {
	return {
		source: file.source,
		tbill: decodeSeries(file.series.tbill),
		short: decodeSeries(file.series.short),
		intermediate: decodeSeries(file.series.intermediate),
		long: decodeSeries(file.series.long),
		usdeur: decodeSeries(file.series.usdeur)
	};
}

/** Maturity in years of the par bond each yield series stands for (long: calibrated against 20+ year treasury ETFs). */
const BOND_YEARS = { short: 2, intermediate: 10, long: 30 } as const;

/**
 * Total return index of a constant-maturity par bond from its yields
 * (Swinkels 2019): carry + duration × yield change + convexity term.
 */
export function bondIndex(yields: readonly PricePoint[], years: number, base = 100): PricePoint[] {
	if (yields.length === 0) return [];
	const out: PricePoint[] = [{ date: yields[0]!.date, close: base }];
	let value = base;
	for (let i = 1; i < yields.length; i++) {
		const y0 = yields[i - 1]!.close / 100;
		const y1 = yields[i]!.close / 100;
		const dt = (toDayNumber(yields[i]!.date) - toDayNumber(yields[i - 1]!.date)) / 365.25;
		const r = y0 > 0 ? parBondReturn(y0, y1, years, dt) : y0 * dt;
		value *= 1 + r;
		out.push({ date: yields[i]!.date, close: value });
	}
	return out;
}

function parBondReturn(y0: number, y1: number, years: number, dt: number): number {
	const z = 1 + y0 / 2;
	const n = 2 * years;
	const duration = (1 - Math.pow(z, -n)) / y0;
	const convexity = (2 / (y0 * y0)) * (1 - Math.pow(z, -n)) - (2 * years) / (y0 * Math.pow(z, n + 1));
	const dy = y1 - y0;
	return y0 * dt - duration * dy + 0.5 * convexity * dy * dy;
}

/** Money market account earning the t-bill rate. */
export function cashIndex(rates: readonly PricePoint[], base = 100): PricePoint[] {
	if (rates.length === 0) return [];
	const out: PricePoint[] = [{ date: rates[0]!.date, close: base }];
	let value = base;
	for (let i = 1; i < rates.length; i++) {
		const days = toDayNumber(rates[i]!.date) - toDayNumber(rates[i - 1]!.date);
		value *= 1 + ((rates[i - 1]!.close / 100) * days) / 360;
		out.push({ date: rates[i]!.date, close: value });
	}
	return out;
}

export const LEVERAGE_SPREAD = 0.004;
export const LEVERAGED_TER = 0.006;

/**
 * Daily leveraged version of an index: r_L = L·r − (L−1)·rate − spread − TER,
 * reset every observation, so volatility decay is modelled. The financing
 * rate comes from `rates` (t-bill, percent).
 */
export function leveragedIndex(prices: readonly PricePoint[], leverage: number, rates: readonly PricePoint[], base = 100): PricePoint[] {
	if (prices.length === 0 || leverage === 1) return prices.slice();
	const out: PricePoint[] = [{ date: prices[0]!.date, close: base }];
	let value = base;
	for (let i = 1; i < prices.length; i++) {
		const r = prices[i]!.close / prices[i - 1]!.close - 1;
		const days = toDayNumber(prices[i]!.date) - toDayNumber(prices[i - 1]!.date);
		const rate = (valueAt(rates, prices[i - 1]!.date) ?? 0) / 100;
		const financing = (leverage - 1) * rate + Math.max(0, leverage - 1) * LEVERAGE_SPREAD;
		value *= Math.max(0, 1 + leverage * r - ((financing + LEVERAGED_TER) * days) / 365);
		out.push({ date: prices[i]!.date, close: Math.max(value, 1e-9) });
	}
	return out;
}

/** Converts prices between USD and EUR with the long-run rate series; other pairs are left to the caller. */
export function convertLongRun(
	prices: readonly PricePoint[],
	from: string,
	to: string,
	usdeur: readonly PricePoint[]
): PricePoint[] | null {
	if (from === to) return prices.slice();
	const usdToEur = from === 'USD' && to === 'EUR';
	if (!usdToEur && !(from === 'EUR' && to === 'USD')) return null;
	return prices.map((p) => {
		const rate = valueAt(usdeur, p.date) ?? usdeur[0]?.close ?? 1;
		return { date: p.date, close: usdToEur ? p.close * rate : p.close / rate };
	});
}

/**
 * Extends `recent` backwards with `older`, scaled to meet at the first date of
 * `recent`. Returns `recent` unchanged when `older` does not start earlier.
 */
export function spliceBackwards(recent: readonly PricePoint[], older: readonly PricePoint[]): PricePoint[] {
	if (recent.length === 0) return older.slice();
	const start = recent[0]!.date;
	if (older.length === 0 || older[0]!.date >= start) return recent.slice();
	const anchor = valueAt(older, start);
	if (!anchor) return recent.slice();
	const scale = recent[0]!.close / anchor;
	const head: PricePoint[] = [];
	for (const p of older) {
		if (p.date >= start) break;
		head.push({ date: p.date, close: p.close * scale });
	}
	return head.concat(recent);
}

export type ProxyKind = 'index' | 'bond' | 'cash';

export interface ProxySource {
	/** Index key from PROXY_INDICES, or `bond:<maturity>` / `cash`. */
	key: string;
	kind: ProxyKind;
	/** The proxy only approximates the exposure (other region, credit risk, broad market for tech). */
	approximate: boolean;
}

/** Proxy sources for an exposure, most specific first. Empty when nothing fits. */
export function proxyChain(e: Exposure): ProxySource[] {
	const idx = (key: string, approximate = false): ProxySource => ({ key, kind: 'index', approximate });
	switch (e.assetClass) {
		case 'equity': {
			const tech = e.style === 'tech';
			switch (e.region) {
				case 'us':
					return tech ? [idx('nasdaq100'), idx('sp500', true)] : [idx('sp500')];
				case 'europe':
					return [idx('stoxx600', tech), idx('msciWorld', true), idx('sp500', true)];
				case 'germany':
					return [idx('dax', tech), idx('stoxx600', true), idx('msciWorld', true), idx('sp500', true)];
				case 'emerging':
					return [idx('msciEm', tech), idx('msciWorld', true), idx('sp500', true)];
				case 'world':
					return tech ? [idx('nasdaq100', true), idx('msciWorld', true), idx('sp500', true)] : [idx('msciWorld'), idx('sp500', true)];
				default:
					return [idx('msciWorld', true), idx('sp500', true)];
			}
		}
		case 'govBond':
			return [{ key: `bond:${e.maturity}`, kind: 'bond', approximate: e.region !== 'us' }];
		case 'corpBond':
			return [{ key: `bond:${e.maturity}`, kind: 'bond', approximate: true }];
		case 'gold':
			return [idx('gold')];
		case 'cash':
			return [{ key: 'cash', kind: 'cash', approximate: e.region !== 'us' }];
		default:
			return [];
	}
}

export interface ProxyInputs {
	rates: CrisisRates | null;
	indices: ReadonlyMap<string, ProxyIndexData>;
	/** Investor currency of the result. */
	currency: string;
	/** Conversion for pairs other than USD/EUR (ECB rates); null when impossible. */
	convert: (prices: PricePoint[], from: string, to: string) => PricePoint[] | null;
}

export interface ProxySegment {
	key: string;
	label: string;
	from: ISODate;
	to: ISODate;
	approximate: boolean;
	/** Fewer than ~100 observations per year (monthly index values). */
	coarse: boolean;
}

export interface ProxySeries {
	prices: PricePoint[];
	segments: ProxySegment[];
}

function sourceSeries(src: ProxySource, inputs: ProxyInputs): { prices: PricePoint[]; currency: string; label: string } | null {
	const { rates } = inputs;
	if (src.kind === 'index') {
		const data = inputs.indices.get(src.key);
		const def = PROXY_INDICES.find((d) => d.key === src.key);
		return data && data.prices.length ? { prices: data.prices, currency: data.currency, label: def?.label ?? src.key } : null;
	}
	if (!rates) return null;
	if (src.kind === 'cash') return { prices: cashIndex(rates.tbill), currency: inputs.currency, label: 'US t-bill rate' };
	const maturity = src.key.slice(5) as keyof typeof BOND_YEARS;
	const labels = {
		short: 'US treasuries 2y (from yields)',
		intermediate: 'US treasuries 10y (from yields)',
		long: 'US treasuries 20–30y (from yields)'
	};
	return { prices: bondIndex(rates[maturity], BOND_YEARS[maturity]), currency: 'USD', label: labels[maturity] };
}

function isCoarse(prices: readonly PricePoint[], from: ISODate, to: ISODate): boolean {
	const days = toDayNumber(to) - toDayNumber(from);
	if (days < 60) return false;
	let n = 0;
	for (const p of prices) if (p.date >= from && p.date <= to) n++;
	return n / (days / 365.25) < 100;
}

/**
 * Proxy series for an exposure in the investor currency: the chain's sources
 * spliced from newest to oldest, each with leverage applied in its own
 * currency before conversion.
 */
export function buildProxy(e: Exposure, inputs: ProxyInputs): ProxySeries | null {
	let prices: PricePoint[] = [];
	const segments: ProxySegment[] = [];
	for (const src of proxyChain(e)) {
		const s = sourceSeries(src, inputs);
		if (!s) continue;
		let series = s.prices;
		if (e.leverage !== 1 && inputs.rates && src.kind !== 'cash') series = leveragedIndex(series, e.leverage, inputs.rates.tbill);
		const converted =
			(inputs.rates && convertLongRun(series, s.currency, inputs.currency, inputs.rates.usdeur)) ??
			inputs.convert(series, s.currency, inputs.currency);
		if (!converted || converted.length === 0) continue;
		const before = prices[0]?.date;
		const next = spliceBackwards(prices, converted);
		if (next.length === prices.length && prices.length > 0) continue;
		const from = next[0]!.date;
		const to = before ?? next[next.length - 1]!.date;
		segments.unshift({ key: src.key, label: s.label, from, to, approximate: src.approximate, coarse: isCoarse(converted, from, to) });
		prices = next;
	}
	return prices.length ? { prices, segments } : null;
}

/** Real prices extended backwards by the proxy; segments describe the proxy part. */
export function extendWithProxy(real: readonly PricePoint[], proxy: ProxySeries | null): ProxySeries {
	if (!proxy || real.length === 0) return { prices: real.slice(), segments: [] };
	const start = real[0]!.date;
	const prices = spliceBackwards(real, proxy.prices);
	const segments = proxy.segments.filter((s) => s.from < start).map((s) => ({ ...s, to: s.to < start ? s.to : start }));
	return { prices, segments };
}
