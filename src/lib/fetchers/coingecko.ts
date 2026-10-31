/** CoinGecko fallback for crypto tickers (SC-2). Requires a CORS proxy. */
import { instantToUTCDate } from '#lib/core/dates.ts';
import { normalizeSeries } from '#lib/core/series.ts';
import { getJSON, viaProxy, type RequestOptions } from './http.ts';
import type { InstrumentData } from './types.ts';

const BASE = 'https://api.coingecko.com/api/v3';
let coinList: Array<{ id: string; symbol: string; name: string }> | null = null;

export function resetCoinListCache(): void {
	coinList = null;
}

export async function fetchCrypto(ticker: string, vsCurrency: string, proxy: string, opts?: RequestOptions): Promise<InstrumentData> {
	coinList ??= await getJSON(viaProxy(`${BASE}/coins/list`, proxy), opts);
	const symbol = ticker.toLowerCase();
	const matches = coinList!.filter((c) => c.symbol === symbol);
	// Prefer the coin whose id equals its name (e.g. "bitcoin"), otherwise the first match.
	const coin = matches.find((c) => c.id === c.name.toLowerCase()) ?? matches[0];
	if (!coin) throw new Error(`CoinGecko found no cryptocurrency for "${ticker.toUpperCase()}".`);
	const data = await getJSON<{ prices: Array<[number, number]> }>(
		viaProxy(`${BASE}/coins/${coin.id}/market_chart?vs_currency=${vsCurrency.toLowerCase()}&days=max&interval=daily`, proxy),
		opts
	);
	const prices = normalizeSeries(
		(data.prices ?? []).filter(([, c]) => Number.isFinite(c) && c > 0).map(([t, c]) => ({ date: instantToUTCDate(t), close: c }))
	);
	if (!prices.length) throw new Error(`CoinGecko has no price history for ${coin.name}.`);
	return {
		prices,
		name: coin.name,
		isin: null,
		wkn: null,
		currency: vsCurrency.toUpperCase(),
		classification: 'crypto',
		source: 'coingecko'
	};
}
