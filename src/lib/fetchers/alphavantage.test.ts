import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchSymbol, fetchDailyPrices, fetchPriceData } from './alphavantage';

function mockFetch(responses: Array<{ ok: boolean; json: () => unknown }>) {
	let callIndex = 0;
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
		const resp = responses[callIndex++];
		if (!resp) throw new Error('Unexpected fetch call');
		if (!resp.ok) {
			return { ok: false, status: 403, statusText: 'Forbidden' } as Response;
		}
		return {
			ok: true,
			status: 200,
			json: async () => resp.json()
		} as Response;
	});
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('searchSymbol', () => {
	it('returns best match from search results', async () => {
		mockFetch([
			{
				ok: true,
				json: () => ({
					bestMatches: [
						{
							'1. symbol': 'VWRL.LON',
							'2. name': 'Vanguard FTSE All-World UCITS ETF',
							'3. type': 'ETF',
							'4. region': 'United Kingdom',
							'8. currency': 'GBP',
							'9. matchScore': '1.0000'
						}
					]
				})
			}
		]);

		const result = await searchSymbol('IE00B3RBWM25', 'test-key');
		expect(result).toEqual({
			symbol: 'VWRL.LON',
			name: 'Vanguard FTSE All-World UCITS ETF',
			currency: 'GBP'
		});
	});

	it('returns null when no matches', async () => {
		mockFetch([
			{
				ok: true,
				json: () => ({ bestMatches: [] })
			}
		]);

		const result = await searchSymbol('INVALID', 'test-key');
		expect(result).toBeNull();
	});

	it('returns null on API error response', async () => {
		mockFetch([
			{
				ok: true,
				json: () => ({ 'Error Message': 'Invalid API call' })
			}
		]);

		const result = await searchSymbol('TEST', 'bad-key');
		expect(result).toBeNull();
	});
});

describe('fetchDailyPrices', () => {
	it('parses daily time series into PricePoint array', async () => {
		mockFetch([
			{
				ok: true,
				json: () => ({
					'Meta Data': { '2. Symbol': 'IBM' },
					'Time Series (Daily)': {
						'2024-01-03': {
							'1. open': '160',
							'2. high': '162',
							'3. low': '159',
							'4. close': '161.50',
							'5. volume': '5000000'
						},
						'2024-01-02': {
							'1. open': '158',
							'2. high': '161',
							'3. low': '157',
							'4. close': '160.00',
							'5. volume': '4000000'
						}
					}
				})
			}
		]);

		const prices = await fetchDailyPrices('IBM', 'test-key');
		expect(prices).toHaveLength(2);
		expect(prices[0]).toEqual({ date: '2024-01-02', close: 160.0 });
		expect(prices[1]).toEqual({ date: '2024-01-03', close: 161.5 });
	});

	it('returns empty array when no time series data', async () => {
		mockFetch([
			{
				ok: true,
				json: () => ({ 'Error Message': 'Invalid API call' })
			}
		]);

		const prices = await fetchDailyPrices('INVALID', 'test-key');
		expect(prices).toHaveLength(0);
	});
});

describe('fetchPriceData', () => {
	it('returns full result combining search and daily data', async () => {
		mockFetch([
			{
				ok: true,
				json: () => ({
					bestMatches: [
						{
							'1. symbol': 'VWRL.LON',
							'2. name': 'Vanguard FTSE All-World',
							'3. type': 'ETF',
							'4. region': 'United Kingdom',
							'8. currency': 'GBP',
							'9. matchScore': '1.0000'
						}
					]
				})
			},
			{
				ok: true,
				json: () => ({
					'Meta Data': { '2. Symbol': 'VWRL.LON' },
					'Time Series (Daily)': {
						'2024-01-02': { '4. close': '100.50' },
						'2024-01-03': { '4. close': '101.00' }
					}
				})
			}
		]);

		const result = await fetchPriceData('IE00B3RBWM25', 'test-key');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.prices).toHaveLength(2);
			expect(result.data.name).toBe('Vanguard FTSE All-World');
			expect(result.data.currency).toBe('GBP');
		}
	});

	it('returns error when symbol not found', async () => {
		mockFetch([
			{
				ok: true,
				json: () => ({ bestMatches: [] })
			}
		]);

		const result = await fetchPriceData('NOTFOUND', 'test-key');
		expect(result.success).toBe(false);
	});

	it('returns error on network failure', async () => {
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

		const result = await fetchPriceData('IE00B4L5Y983', 'test-key');
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.message).toContain('Network error');
		}
	});
});
