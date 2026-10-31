import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEurRate, parseEcbCsv } from './ecb.ts';
import { fetchAny, fetchSecurity } from './market-data.ts';
import * as coingecko from './coingecko.ts';
import { toPricePoints } from './onvista.ts';
import { viaProxy } from './http.ts';

const settings = { alphaVantageApiKey: '', corsProxyUrl: '', dataSourcePrimary: 'onvista' as const, mainCurrency: 'EUR' };

function mockFetch(routes: Array<[RegExp, unknown, number?]>) {
	const calls: string[] = [];
	vi.stubGlobal('fetch', async (url: string) => {
		calls.push(url);
		const route = routes.find(([re]) => re.test(url));
		if (!route) return new Response('not found', { status: 404, statusText: 'Not Found' });
		const [, body, status = 200] = route;
		return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
	});
	return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('SC-1 Onvista', () => {
	it('searches, snapshots and uses eod_history', async () => {
		const calls = mockFetch([
			[/search\/facet/, { instrument: { entityType: 'ETF', entityValue: '12345', isin: 'IE00B4L5Y983', name: 'iShares' } }],
			[
				/etfs\/ISIN:IE00B4L5Y983\/snapshot/,
				{
					instrument: { name: 'iShares Core MSCI World', isin: 'IE00B4L5Y983', wkn: 'A0RPWH' },
					quote: { isoCurrency: 'EUR' },
					chart: { idNotation: 99 }
				}
			],
			[/eod_history/, { datetimeLast: [Date.UTC(2024, 0, 14, 23) / 1000, Date.UTC(2024, 0, 15, 23) / 1000], last: [80.5, 81] }]
		]);
		const r = await fetchSecurity('IE00B4L5Y983', settings);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data).toMatchObject({
			name: 'iShares Core MSCI World',
			wkn: 'A0RPWH',
			currency: 'EUR',
			classification: 'etf',
			source: 'onvista'
		});
		expect(r.data.prices).toEqual([
			{ date: '2024-01-15', close: 80.5 },
			{ date: '2024-01-16', close: 81 }
		]);
		const hist = calls.find((c) => c.includes('eod_history'))!;
		expect(hist).toContain('range=MAX');
		expect(hist).toContain('idNotation=99');
		expect(calls.some((c) => c.includes('chart_history'))).toBe(false);
	});
	it('reports failures with a CSV hint', async () => {
		mockFetch([[/search\/facet/, { facets: [] }]]);
		const r = await fetchSecurity('IE00B4L5Y983', settings);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toMatch(/CSV/);
	});
	it('rejects invalid identifiers without network', async () => {
		const r = await fetchAny('??', settings);
		expect(r.ok).toBe(false);
	});
	it('drops invalid points and dedupes', () => {
		expect(toPricePoints({ datetimeLast: [1, 2, 3], last: [1, NaN, -1] })).toHaveLength(1);
		expect(toPricePoints({ datetimeLast: [1], last: [] })).toEqual([]);
	});
});

describe('SC-2 crypto fallback', () => {
	it('falls back to CoinGecko through the proxy', async () => {
		coingecko.resetCoinListCache();
		const calls = mockFetch([
			[/search\/facet/, { facets: [{ type: 'CRYPTO', results: [] }] }],
			[
				/coins\/list/,
				[
					{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' },
					{ id: 'btc-fake', symbol: 'btc', name: 'Fake' }
				]
			],
			[
				/market_chart/,
				{
					prices: [
						[Date.UTC(2024, 0, 1), 40000],
						[Date.UTC(2024, 0, 2), 41000]
					]
				}
			]
		]);
		const r = await fetchAny('BTC', { ...settings, corsProxyUrl: 'https://proxy.test/' });
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.data).toMatchObject({ name: 'Bitcoin', classification: 'crypto', source: 'coingecko' });
		expect(calls.some((c) => c.startsWith('https://proxy.test/https://api.coingecko.com'))).toBe(true);
	});
	it('explains the missing proxy', async () => {
		mockFetch([[/search\/facet/, { facets: [] }]]);
		const r = await fetchAny('BTC', settings);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toMatch(/CORS proxy/);
	});
	it('supports {url} proxy templates', () => {
		expect(viaProxy('https://a.b/c?d=1', 'https://p/?u={url}')).toBe('https://p/?u=https%3A%2F%2Fa.b%2Fc%3Fd%3D1');
	});
});

describe('SC-3 Alpha Vantage', () => {
	it('is used first when configured as primary', async () => {
		const calls = mockFetch([
			[/SYMBOL_SEARCH/, { bestMatches: [{ '1. symbol': 'IWDA.AMS', '2. name': 'iShares', '8. currency': 'EUR' }] }],
			[/TIME_SERIES_DAILY/, { 'Time Series (Daily)': { '2024-01-02': { '4. close': '80' }, '2024-01-03': { '4. close': '81' } } }]
		]);
		const r = await fetchSecurity('IE00B4L5Y983', { ...settings, alphaVantageApiKey: 'k', dataSourcePrimary: 'alphavantage' });
		expect(r.ok && r.data.source).toBe('alphavantage');
		expect(calls[0]).toContain('alphavantage');
	});
});

describe('CU-4 ECB', () => {
	const csv = 'KEY,FREQ,TIME_PERIOD,OBS_VALUE\nEXR.D.USD.EUR.SP00.A,D,2024-01-03,1.0919\nEXR.D.USD.EUR.SP00.A,D,2024-01-02,1.0956\n';
	it('parses the csvdata format', () => {
		expect(parseEcbCsv(csv)).toEqual([
			{ date: '2024-01-02', rate: 1.0956 },
			{ date: '2024-01-03', rate: 1.0919 }
		]);
	});
	it('returns EUR per unit of the currency (inverted ECB quote)', async () => {
		mockFetch([[/D\.USD\.EUR\.SP00\.A/, csv]]);
		const r = await fetchEurRate('USD');
		expect(r.pair).toBe('USDEUR');
		expect(r.rates[0]!.rate).toBeCloseTo(1 / 1.0956);
	});
});
