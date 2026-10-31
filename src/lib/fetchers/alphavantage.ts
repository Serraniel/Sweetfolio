/** Alpha Vantage (optional, API key required) (SC-3). */
import type { PricePoint } from '#lib/domain/types.ts';
import { normalizeSeries } from '#lib/core/series.ts';
import { getJSON, type RequestOptions } from './http.ts';
import type { InstrumentData } from './types.ts';

const BASE = 'https://www.alphavantage.co/query';

interface SearchResponse {
	bestMatches?: Array<Record<string, string>>;
	Note?: string;
	Information?: string;
	'Error Message'?: string;
}

interface DailyResponse {
	'Time Series (Daily)'?: Record<string, Record<string, string>>;
	Note?: string;
	Information?: string;
	'Error Message'?: string;
}

function apiError(r: { Note?: string; Information?: string; 'Error Message'?: string }): string | null {
	return r['Error Message'] ?? r.Note ?? r.Information ?? null;
}

export async function fetchSymbol(query: string, apiKey: string, opts?: RequestOptions): Promise<InstrumentData> {
	const search = await getJSON<SearchResponse>(
		`${BASE}?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${encodeURIComponent(apiKey)}`,
		opts
	);
	const err = apiError(search);
	if (err) throw new Error(`Alpha Vantage: ${err}`);
	const match = search.bestMatches?.[0];
	if (!match) throw new Error(`Alpha Vantage found no instrument for "${query}".`);
	const symbol = match['1. symbol']!;
	const daily = await getJSON<DailyResponse>(
		`${BASE}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=full&apikey=${encodeURIComponent(apiKey)}`,
		opts
	);
	const err2 = apiError(daily);
	if (err2) throw new Error(`Alpha Vantage: ${err2}`);
	const series = daily['Time Series (Daily)'] ?? {};
	const prices: PricePoint[] = normalizeSeries(Object.entries(series).map(([date, v]) => ({ date, close: Number(v['4. close']) })));
	if (!prices.length) throw new Error(`Alpha Vantage has no price history for ${symbol}.`);
	return {
		prices,
		name: match['2. name'] ?? symbol,
		isin: null,
		wkn: null,
		currency: match['8. currency'] ?? null,
		classification: null,
		source: 'alphavantage'
	};
}

export async function testKey(apiKey: string): Promise<void> {
	await fetchSymbol('IBM', apiKey, { timeoutMs: 15_000 });
}
