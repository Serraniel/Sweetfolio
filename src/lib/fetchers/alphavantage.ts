/**
 * Alpha Vantage price data fetcher.
 *
 * Requires a free API key from https://www.alphavantage.co/support/#api-key
 * Uses SYMBOL_SEARCH to find ticker from ISIN/WKN, then TIME_SERIES_DAILY for prices.
 */

import type { PricePoint } from '$lib/types';
import type { FetchOutcome, FetchResult } from './types';

const BASE_URL = 'https://www.alphavantage.co/query';

interface SearchMatch {
	'1. symbol': string;
	'2. name': string;
	'3. type': string;
	'4. region': string;
	'8. currency': string;
	'9. matchScore': string;
}

interface SearchResponse {
	bestMatches?: SearchMatch[];
	'Error Message'?: string;
	Information?: string;
}

interface DailyResponse {
	'Meta Data'?: Record<string, string>;
	'Time Series (Daily)'?: Record<string, Record<string, string>>;
	'Error Message'?: string;
	Note?: string;
	Information?: string;
}

async function fetchJSON<T>(url: string): Promise<T> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Alpha Vantage API error: ${response.status} ${response.statusText}`);
	}
	return response.json() as Promise<T>;
}

export async function searchSymbol(
	query: string,
	apiKey: string
): Promise<{ symbol: string; name: string; currency: string } | null> {
	const url = `${BASE_URL}?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${encodeURIComponent(apiKey)}`;
	const data = await fetchJSON<SearchResponse>(url);

	if (!data.bestMatches || data.bestMatches.length === 0) return null;

	const match = data.bestMatches[0];
	return {
		symbol: match['1. symbol'],
		name: match['2. name'],
		currency: match['8. currency']
	};
}

export async function fetchDailyPrices(symbol: string, apiKey: string): Promise<PricePoint[]> {
	const url = `${BASE_URL}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=full&apikey=${encodeURIComponent(apiKey)}`;
	const data = await fetchJSON<DailyResponse>(url);

	const timeSeries = data['Time Series (Daily)'];
	if (!timeSeries) return [];

	const prices: PricePoint[] = Object.entries(timeSeries)
		.map(([date, values]) => {
			const close = parseFloat(values['4. close']);
			if (!isFinite(close)) return null;
			return { date, close };
		})
		.filter((p): p is PricePoint => p !== null);

	prices.sort((a, b) => a.date.localeCompare(b.date));
	return prices;
}

export async function fetchPriceData(query: string, apiKey: string): Promise<FetchOutcome> {
	try {
		const instrument = await searchSymbol(query, apiKey);
		if (!instrument) {
			return {
				success: false,
				error: {
					message: `No instrument found on Alpha Vantage for "${query}".`,
					recoverable: true
				}
			};
		}

		const prices = await fetchDailyPrices(instrument.symbol, apiKey);

		if (prices.length === 0) {
			return {
				success: false,
				error: {
					message: `No price data available on Alpha Vantage for "${query}" (${instrument.symbol}).`,
					recoverable: true
				}
			};
		}

		const result: FetchResult = {
			prices,
			name: instrument.name,
			isin: null,
			wkn: null,
			currency: instrument.currency,
			classification: null
		};

		return { success: true, data: result };
	} catch (err) {
		const message =
			err instanceof Error ? err.message : 'Unknown error fetching from Alpha Vantage';
		return {
			success: false,
			error: { message, recoverable: true }
		};
	}
}
