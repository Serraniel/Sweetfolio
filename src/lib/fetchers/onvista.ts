/**
 * Onvista public API (SC-1, SC-2). CORS-enabled, no key.
 * search → snapshot (idNotation, metadata) → eod_history (daily closes).
 */
import type { AssetClassification, PricePoint } from '#lib/domain/types.ts';
import { instantToBerlinDate } from '#lib/core/dates.ts';
import { normalizeSeries } from '#lib/core/series.ts';
import { exposureFromSnapshot, type ExposureSnapshot } from '#lib/core/exposure.ts';
import { getJSON, type RequestOptions } from './http.ts';
import type { InstrumentData, InstrumentInfo } from './types.ts';

export const ONVISTA_BASE = 'https://api.onvista.de/api/v1';

interface SearchHit {
	entityType: string;
	entityValue: string;
	isin?: string;
	name: string;
}

interface SearchResponse {
	instrument?: SearchHit | null;
	facets?: Array<{ type: string; results: SearchHit[] | null }>;
}

interface SnapshotResponse extends ExposureSnapshot {
	instrument?: { name?: string; isin?: string; wkn?: string; entityType?: string };
	quote?: { isoCurrency?: string };
	chart?: { idNotation?: number };
	idNotation?: number;
	isoCurrency?: string;
	name?: string;
	isin?: string;
	wkn?: string;
}

interface HistoryResponse {
	datetimeLast?: number[];
	last?: number[];
}

const TYPE_PATHS: Record<string, string> = {
	FUND: 'funds',
	STOCK: 'stocks',
	BOND: 'bonds',
	INDEX: 'indices',
	DERIVATIVE: 'derivatives',
	ETF: 'etfs',
	COMMODITY: 'commodities',
	PRECIOUS_METAL: 'precious_metals',
	CURRENCY: 'currencies',
	CRYPTO: 'crypto'
};

const CLASSIFICATIONS: Record<string, AssetClassification> = {
	STOCK: 'stock',
	ETF: 'etf',
	FUND: 'fund',
	BOND: 'bond',
	COMMODITY: 'commodity',
	PRECIOUS_METAL: 'commodity',
	DERIVATIVE: 'certificate',
	CRYPTO: 'crypto'
};

export function classificationFor(entityType: string): AssetClassification {
	return CLASSIFICATIONS[entityType] ?? 'unknown';
}

export async function search(query: string, opts?: RequestOptions): Promise<SearchResponse> {
	return getJSON<SearchResponse>(`${ONVISTA_BASE}/instruments/search/facet?perType=10&searchValue=${encodeURIComponent(query)}`, opts);
}

export async function findInstrument(query: string, opts?: RequestOptions): Promise<SearchHit | null> {
	const data = await search(query, opts);
	if (data.instrument) return data.instrument;
	const q = query.toUpperCase();
	const all = (data.facets ?? []).flatMap((f) => f.results ?? []);
	return all.find((h) => h.isin?.toUpperCase() === q) ?? all[0] ?? null;
}

export async function findCrypto(ticker: string, opts?: RequestOptions): Promise<SearchHit | null> {
	const data = await search(ticker, opts);
	const crypto = (data.facets ?? []).find((f) => f.type === 'CRYPTO')?.results ?? [];
	const t = ticker.toUpperCase();
	return (
		crypto.find((h) => h.entityValue.toUpperCase().startsWith(t)) ??
		crypto[0] ??
		(data.instrument?.entityType === 'CRYPTO' ? data.instrument : null)
	);
}

function readSnapshot(raw: SnapshotResponse) {
	return {
		idNotation: raw.chart?.idNotation ?? raw.idNotation ?? 0,
		currency: raw.quote?.isoCurrency ?? raw.isoCurrency ?? null,
		name: raw.instrument?.name ?? raw.name ?? null,
		isin: raw.instrument?.isin ?? raw.isin ?? null,
		wkn: raw.instrument?.wkn ?? raw.wkn ?? null,
		exposure: exposureFromSnapshot(raw)
	};
}

export async function snapshot(hit: SearchHit, opts?: RequestOptions) {
	const path = TYPE_PATHS[hit.entityType] ?? hit.entityType.toLowerCase();
	const id = hit.entityType === 'CRYPTO' || !hit.isin ? encodeURIComponent(hit.entityValue) : `ISIN:${encodeURIComponent(hit.isin)}`;
	return readSnapshot(await getJSON<SnapshotResponse>(`${ONVISTA_BASE}/${path}/${id}/snapshot`, opts));
}

export function toPricePoints(data: HistoryResponse): PricePoint[] {
	const ts = data.datetimeLast ?? [];
	const last = data.last ?? [];
	if (ts.length !== last.length) return [];
	const out: PricePoint[] = [];
	for (let i = 0; i < ts.length; i++) {
		const close = last[i];
		if (close == null || !Number.isFinite(close) || close <= 0) continue;
		const t = ts[i]!;
		out.push({ date: instantToBerlinDate(t > 1e12 ? t : t * 1000), close });
	}
	return normalizeSeries(out);
}

/** Full daily history via `eod_history` (the retired `chart_history` must not be used). */
export async function history(hit: SearchHit, idNotation: number, startDate = '2000-01-01', opts?: RequestOptions): Promise<PricePoint[]> {
	const url =
		`${ONVISTA_BASE}/instruments/${encodeURIComponent(hit.entityType)}/${encodeURIComponent(hit.entityValue)}/eod_history` +
		`?idNotation=${idNotation}&range=MAX&startDate=${startDate}`;
	return toPricePoints(await getJSON<HistoryResponse>(url, opts));
}

/** Onvista returns at most this many points per request; longer histories are paged. */
const PAGE_LIMIT = 19000;

/** Complete daily history of an index or metal from `startDate` on, paged (crisis proxies, CR-3). */
export async function longHistory(
	entityType: string,
	entityValue: string,
	idNotation: number,
	startDate = '1900-01-01',
	opts?: RequestOptions
): Promise<PricePoint[]> {
	const all: PricePoint[] = [];
	let start = startDate;
	for (let page = 0; page < 20; page++) {
		const url =
			`${ONVISTA_BASE}/instruments/${encodeURIComponent(entityType)}/${encodeURIComponent(entityValue)}/eod_history` +
			`?idNotation=${idNotation}&range=MAX&startDate=${start}`;
		const data = await getJSON<HistoryResponse>(url, opts);
		const points = toPricePoints(data);
		all.push(...points);
		if ((data.datetimeLast?.length ?? 0) < PAGE_LIMIT || points.length === 0) break;
		const next = new Date(Date.parse(points[points.length - 1]!.date) + 864e5).toISOString().slice(0, 10);
		if (next <= start) break;
		start = next;
	}
	return normalizeSeries(all);
}

async function load(hit: SearchHit, opts?: RequestOptions, crypto = false): Promise<InstrumentData> {
	const snap = await snapshot(hit, opts);
	const prices = await history(hit, snap.idNotation, undefined, opts);
	if (prices.length === 0) throw new Error(`Onvista has no price history for ${hit.name}.`);
	return {
		prices,
		name: snap.name ?? hit.name,
		isin: snap.isin ?? hit.isin ?? null,
		wkn: snap.wkn,
		currency: snap.currency,
		classification: crypto ? 'crypto' : classificationFor(hit.entityType),
		exposure: snap.exposure,
		source: 'onvista'
	};
}

export async function fetchByIdentifier(query: string, opts?: RequestOptions): Promise<InstrumentData> {
	const hit = await findInstrument(query, opts);
	if (!hit) throw new Error(`Onvista found no instrument for "${query}".`);
	return load(hit, opts);
}

export async function fetchCrypto(ticker: string, opts?: RequestOptions): Promise<InstrumentData> {
	const hit = await findCrypto(ticker, opts);
	if (!hit) throw new Error(`Onvista found no cryptocurrency for "${ticker}".`);
	return load(hit, opts, true);
}

/** Metadata only (used to resolve names from filenames, AM-3b). */
export async function lookupInfo(query: string, opts?: RequestOptions): Promise<InstrumentInfo | null> {
	const hit = await findInstrument(query, opts);
	if (!hit) return null;
	try {
		const snap = await snapshot(hit, opts);
		return {
			name: snap.name ?? hit.name,
			isin: snap.isin ?? hit.isin ?? null,
			wkn: snap.wkn,
			currency: snap.currency,
			classification: classificationFor(hit.entityType),
			exposure: snap.exposure
		};
	} catch {
		return { name: hit.name, isin: hit.isin ?? null, wkn: null, currency: null, classification: classificationFor(hit.entityType) };
	}
}
