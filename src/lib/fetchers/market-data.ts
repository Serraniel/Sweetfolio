/** Source orchestration for price lookups (SC-1 … SC-4). */
import type { Settings } from '#lib/domain/types.ts';
import { detectIdentifier, isValidISIN, isValidWKN } from '#lib/parsers/identifiers.ts';
import * as alphavantage from './alphavantage.ts';
import * as coingecko from './coingecko.ts';
import * as onvista from './onvista.ts';
import type { FetchOutcome, InstrumentData } from './types.ts';

export type SourceSettings = Pick<Settings, 'alphaVantageApiKey' | 'corsProxyUrl' | 'dataSourcePrimary' | 'mainCurrency'>;

type Attempt = { name: string; run: () => Promise<InstrumentData> };

async function firstSuccess(attempts: Attempt[], fallbackMessage: string): Promise<FetchOutcome> {
	const errors: string[] = [];
	for (const a of attempts) {
		try {
			return { ok: true, data: await a.run() };
		} catch (err) {
			errors.push(err instanceof Error ? err.message : String(err));
		}
	}
	return { ok: false, error: [fallbackMessage, ...errors].join(' ') };
}

export async function fetchSecurity(identifier: string, settings: SourceSettings, signal?: AbortSignal): Promise<FetchOutcome> {
	const id = identifier.trim().toUpperCase();
	if (!isValidISIN(id) && !isValidWKN(id)) return { ok: false, error: `"${identifier}" is not a valid ISIN or WKN.` };
	const ov: Attempt = { name: 'onvista', run: () => onvista.fetchByIdentifier(id, { signal }) };
	const av: Attempt[] = settings.alphaVantageApiKey
		? [{ name: 'alphavantage', run: () => alphavantage.fetchSymbol(id, settings.alphaVantageApiKey, { signal }) }]
		: [];
	const order = settings.dataSourcePrimary === 'alphavantage' ? [...av, ov] : [ov, ...av];
	return firstSuccess(order, `Could not fetch prices for ${id}. You can upload a CSV file instead.`);
}

export async function fetchCrypto(ticker: string, settings: SourceSettings, signal?: AbortSignal): Promise<FetchOutcome> {
	const t = ticker.trim().toUpperCase();
	const attempts: Attempt[] = [{ name: 'onvista', run: () => onvista.fetchCrypto(t, { signal }) }];
	if (settings.corsProxyUrl)
		attempts.push({ name: 'coingecko', run: () => coingecko.fetchCrypto(t, settings.mainCurrency, settings.corsProxyUrl, { signal }) });
	const hint = settings.corsProxyUrl ? '' : ' Configure a CORS proxy in Settings to enable the CoinGecko fallback.';
	return firstSuccess(attempts, `Could not fetch prices for ${t}.${hint}`);
}

/** Lookup by any identifier (AM-7). */
export async function fetchAny(identifier: string, settings: SourceSettings, signal?: AbortSignal): Promise<FetchOutcome> {
	const type = detectIdentifier(identifier);
	if (type === 'isin' || type === 'wkn') return fetchSecurity(identifier, settings, signal);
	if (type === 'ticker') return fetchCrypto(identifier, settings, signal);
	return { ok: false, error: `"${identifier}" is not a valid ISIN, WKN or crypto ticker.` };
}

export { onvista };
