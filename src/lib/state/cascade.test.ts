import { describe, expect, it } from 'vitest';
import { asset, tx } from '#test/fixtures.ts';
import { normalizePortfolio, normalizeStrategy } from '#lib/domain/normalize.ts';
import { deleteAssetChanges, deletePortfolioChanges, deleteStrategyChanges } from './cascade.ts';

const strategy = normalizeStrategy({
	id: 's1',
	name: 'S',
	generatedPortfolioIds: ['p2'],
	root: {
		type: 'group',
		id: 'r',
		label: 'R',
		weight: 1,
		children: [
			{ type: 'leaf', id: 'l1', assetId: 'a1', weight: 0.5 },
			{ type: 'leaf', id: 'l2', assetId: 'a2', weight: 0.5 }
		]
	}
});
const data = {
	assets: [asset({ id: 'a1' }), asset({ id: 'a2' })],
	portfolios: [
		normalizePortfolio({
			id: 'p1',
			name: 'Mixed',
			allocations: [
				{ assetId: 'a1', weight: 0.25 },
				{ assetId: 'a2', weight: 0.75 }
			]
		}),
		normalizePortfolio({ id: 'p2', name: 'Only a1', allocations: [{ assetId: 'a1', weight: 1 }], sourceStrategyId: 's1' }),
		normalizePortfolio({ id: 'p3', name: 'Tracked', mode: 'tracked', allocations: [] })
	],
	strategies: [strategy],
	transactions: [
		tx({ id: 't1', portfolioId: 'p3', assetId: 'a1', type: 'buy', date: '2024-01-01' }),
		tx({ id: 't2', portfolioId: 'p3', assetId: 'a2', type: 'buy', date: '2024-01-01' })
	],
	benchmark: { type: 'portfolio' as const, id: 'p2' }
};

describe('AM-6 cascade delete of assets', () => {
	const cs = deleteAssetChanges(data, 'a1');
	it('re-normalizes portfolios and deletes emptied model portfolios', () => {
		expect(cs.put.portfolios.find((p) => p.id === 'p1')!.allocations).toEqual([{ assetId: 'a2', weight: 1 }]);
		expect(cs.delete.portfolios).toEqual(['p2']);
	});
	it('removes transactions, updates strategies and clears the benchmark', () => {
		expect(cs.delete.transactions).toEqual(['t1']);
		const s = cs.put.strategies.find((x) => x.id === 's1')!;
		expect(s.root.children).toHaveLength(1);
		expect(s.generatedPortfolioIds).toEqual([]);
		expect(cs.benchmark).toBeNull();
	});
});

describe('ST-6 portfolio and strategy deletion', () => {
	it('deleting a portfolio removes its transactions and strategy links', () => {
		const cs = deletePortfolioChanges(data, 'p2');
		expect(cs.put.strategies[0]!.generatedPortfolioIds).toEqual([]);
		expect(cs.benchmark).toBeNull();
		expect(deletePortfolioChanges(data, 'p3').delete.transactions).toEqual(['t1', 't2']);
	});
	it('deleting a strategy unlinks generated portfolios', () => {
		const cs = deleteStrategyChanges(data, 's1');
		expect(cs.put.portfolios).toHaveLength(1);
		expect(cs.put.portfolios[0]).toMatchObject({ id: 'p2', sourceStrategyId: null });
	});
});
