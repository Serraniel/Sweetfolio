import { describe, expect, it } from 'vitest';
import { convertAmount, convertPrices, deriveCrossRate, mergeRates, neededEcbPairs } from './currency.ts';

const usdEur = {
	pair: 'USDEUR',
	rates: [
		{ date: '2024-01-02', rate: 0.9 },
		{ date: '2024-01-04', rate: 0.8 }
	]
};

describe('CU-2 conversion', () => {
	const prices = [
		{ date: '2024-01-01', close: 10 },
		{ date: '2024-01-03', close: 10 },
		{ date: '2024-01-05', close: 10 }
	];
	it('uses direct pairs with forward fill and earliest rate before start', () => {
		const r = convertPrices(prices, 'USD', 'EUR', [usdEur]);
		expect(r.status).toBe('converted');
		expect(r.prices.map((p) => p.close)).toEqual([9, 9, 8]);
	});
	it('uses inverse pairs', () => {
		const r = convertPrices(prices, 'EUR', 'USD', [usdEur]);
		expect(r.prices[2]!.close).toBeCloseTo(12.5);
	});
	it('reports missing pairs and same currency', () => {
		expect(convertPrices(prices, 'GBP', 'EUR', [usdEur]).status).toBe('missing');
		expect(convertPrices(prices, 'EUR', 'EUR', []).status).toBe('same');
		expect(convertAmount(10, '2024-01-04', 'USD', 'EUR', [usdEur])).toBeCloseTo(8);
		expect(convertAmount(10, '2024-01-04', 'GBP', 'EUR', [])).toBeNull();
	});
});

describe('CU-4 ECB planning', () => {
	it('needs pairs for foreign currencies only', () => {
		expect(neededEcbPairs(['EUR', 'USD', 'usd', 'GBP'], 'EUR')).toEqual(['GBPEUR', 'USDEUR']);
		expect(neededEcbPairs(['EUR'], 'EUR')).toEqual([]);
	});
	it('adds the main currency for cross rates', () => {
		expect(neededEcbPairs(['EUR', 'GBP'], 'USD')).toEqual(['GBPEUR', 'USDEUR']);
		expect(neededEcbPairs(['USD'], 'USD')).toEqual([]);
	});
	it('derives cross rates and merges with manual data winning', () => {
		const gbp = { pair: 'GBPEUR', rates: [{ date: '2024-01-02', rate: 1.2 }] };
		const usd = { pair: 'USDEUR', rates: [{ date: '2024-01-02', rate: 0.8 }] };
		expect(deriveCrossRate(gbp, usd, 'GBPUSD').rates[0]!.rate).toBeCloseTo(1.5);
		const merged = mergeRates(
			{ pair: 'USDEUR', rates: [{ date: '2024-01-02', rate: 1 }] },
			{
				pair: 'USDEUR',
				rates: [
					{ date: '2024-01-02', rate: 2 },
					{ date: '2024-01-01', rate: 3 }
				]
			}
		);
		expect(merged.rates).toEqual([
			{ date: '2024-01-01', rate: 3 },
			{ date: '2024-01-02', rate: 1 }
		]);
	});
});
