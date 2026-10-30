import { describe, expect, it } from 'vitest';
import { getAssetPrices, getAssets, getHoldings, getPortfolios, getTransactions, parseExport } from './data.ts';

const exp = parseExport(
	JSON.stringify({
		format: 'sweetfolio-ai',
		version: '2',
		exportedAt: 'x',
		description: '',
		manifest: {},
		data: {
			portfolios: [
				{
					id: 'p1',
					name: 'Depot',
					mode: 'tracked',
					currency: 'EUR',
					targetAllocations: [],
					holdings: [{ assetId: 'a1', assetName: 'World', quantity: 2, averageCost: 10, marketValue: 24, weight: 1 }],
					transactions: [
						{ id: 't2', date: '2024-02-01', type: 'dividend', assetId: 'a1' },
						{ id: 't1', date: '2024-01-01', type: 'buy', assetId: 'a1' }
					]
				}
			],
			assets: [
				{
					id: 'a1',
					name: 'World',
					isin: 'IE00B4L5Y983',
					wkn: null,
					currency: 'EUR',
					classification: 'etf',
					latestPrice: 12,
					latestPriceDate: '2024-02-01',
					priceHistory: [
						{ date: '2024-01-01', close: 10 },
						{ date: '2024-02-01', close: 12 }
					]
				}
			]
		}
	})
);

describe('EX-8 MCP data tools', () => {
	it('lists portfolios with totals', () => {
		expect(getPortfolios(exp)[0]).toMatchObject({ name: 'Depot', transactionCount: 2, marketValue: 24 });
	});
	it('filters transactions by name, type and asset ISIN, sorted by date', () => {
		expect(getTransactions(exp, 'depot').map((t) => t.id)).toEqual(['t1', 't2']);
		expect(getTransactions(exp, 'p1', { type: 'buy', asset: 'IE00B4L5Y983' })).toHaveLength(1);
		expect(() => getTransactions(exp, 'nope')).toThrow(/not found/);
	});
	it('returns holdings, assets without history and price ranges', () => {
		expect(getHoldings(exp, 'Depot').holdings).toHaveLength(1);
		expect(getAssets(exp)[0]).not.toHaveProperty('priceHistory');
		expect(getAssetPrices(exp, 'World', { from: '2024-02-01' })).toMatchObject({ prices: [{ date: '2024-02-01', close: 12 }] });
	});
	it('rejects other files', () => {
		expect(() => parseExport('{"format":"sweetfolio"}')).toThrow(/sweetfolio-ai/);
	});
});
