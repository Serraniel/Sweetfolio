import { describe, it, expect } from 'vitest';
import type { Transaction } from '$lib/types';
import { FifoCostBasis } from './fifo';

function makeTx(
	overrides: Partial<Transaction> & Pick<Transaction, 'type' | 'assetId' | 'date'>
): Transaction {
	return {
		id: crypto.randomUUID(),
		portfolioId: 'p1',
		quantity: null,
		price: null,
		fee: 0,
		amount: null,
		withholdingTax: 0,
		currency: 'EUR',
		notes: '',
		createdAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-01T00:00:00Z',
		...overrides
	};
}

describe('FifoCostBasis', () => {
	const fifo = new FifoCostBasis();

	it('has name "FIFO"', () => {
		expect(fifo.name).toBe('FIFO');
	});

	describe('computeLots', () => {
		it('returns empty for no transactions', () => {
			expect(fifo.computeLots([])).toEqual([]);
		});

		it('creates a lot for a single buy', () => {
			const txs = [
				makeTx({ type: 'buy', assetId: 'A', date: '2024-01-01', quantity: 10, price: 50 })
			];
			const lots = fifo.computeLots(txs);
			expect(lots).toEqual([
				{ assetId: 'A', quantity: 10, purchasePrice: 50, purchaseDate: '2024-01-01' }
			]);
		});

		it('creates separate lots for multiple buys', () => {
			const txs = [
				makeTx({ type: 'buy', assetId: 'A', date: '2024-01-01', quantity: 5, price: 50 }),
				makeTx({ type: 'buy', assetId: 'A', date: '2024-02-01', quantity: 5, price: 80 })
			];
			const lots = fifo.computeLots(txs);
			expect(lots).toHaveLength(2);
			expect(lots[0]).toEqual({
				assetId: 'A',
				quantity: 5,
				purchasePrice: 50,
				purchaseDate: '2024-01-01'
			});
			expect(lots[1]).toEqual({
				assetId: 'A',
				quantity: 5,
				purchasePrice: 80,
				purchaseDate: '2024-02-01'
			});
		});

		it('consumes oldest lot first on sell (FIFO order)', () => {
			const txs = [
				makeTx({ type: 'buy', assetId: 'A', date: '2024-01-01', quantity: 10, price: 50 }),
				makeTx({ type: 'buy', assetId: 'A', date: '2024-02-01', quantity: 10, price: 80 }),
				makeTx({ type: 'sell', assetId: 'A', date: '2024-03-01', quantity: 5, price: 100 })
			];
			const lots = fifo.computeLots(txs);
			expect(lots).toHaveLength(2);
			expect(lots[0]).toEqual({
				assetId: 'A',
				quantity: 5,
				purchasePrice: 50,
				purchaseDate: '2024-01-01'
			});
			expect(lots[1]).toEqual({
				assetId: 'A',
				quantity: 10,
				purchasePrice: 80,
				purchaseDate: '2024-02-01'
			});
		});

		it('removes fully consumed lots', () => {
			const txs = [
				makeTx({ type: 'buy', assetId: 'A', date: '2024-01-01', quantity: 10, price: 50 }),
				makeTx({ type: 'sell', assetId: 'A', date: '2024-02-01', quantity: 10, price: 100 })
			];
			const lots = fifo.computeLots(txs);
			expect(lots).toEqual([]);
		});

		it('handles sell spanning multiple lots', () => {
			const txs = [
				makeTx({ type: 'buy', assetId: 'A', date: '2024-01-01', quantity: 5, price: 50 }),
				makeTx({ type: 'buy', assetId: 'A', date: '2024-02-01', quantity: 5, price: 80 }),
				makeTx({ type: 'sell', assetId: 'A', date: '2024-03-01', quantity: 7, price: 100 })
			];
			const lots = fifo.computeLots(txs);
			expect(lots).toHaveLength(1);
			expect(lots[0]).toEqual({
				assetId: 'A',
				quantity: 3,
				purchasePrice: 80,
				purchaseDate: '2024-02-01'
			});
		});

		it('tracks lots per asset independently', () => {
			const txs = [
				makeTx({ type: 'buy', assetId: 'A', date: '2024-01-01', quantity: 10, price: 50 }),
				makeTx({ type: 'buy', assetId: 'B', date: '2024-01-01', quantity: 20, price: 30 }),
				makeTx({ type: 'sell', assetId: 'A', date: '2024-02-01', quantity: 5, price: 100 })
			];
			const lots = fifo.computeLots(txs);
			expect(lots).toHaveLength(2);
			expect(lots.find((l) => l.assetId === 'A')).toEqual({
				assetId: 'A',
				quantity: 5,
				purchasePrice: 50,
				purchaseDate: '2024-01-01'
			});
			expect(lots.find((l) => l.assetId === 'B')).toEqual({
				assetId: 'B',
				quantity: 20,
				purchasePrice: 30,
				purchaseDate: '2024-01-01'
			});
		});

		it('ignores dividend transactions', () => {
			const txs = [
				makeTx({ type: 'buy', assetId: 'A', date: '2024-01-01', quantity: 10, price: 50 }),
				makeTx({ type: 'dividend', assetId: 'A', date: '2024-02-01', amount: 100 })
			];
			const lots = fifo.computeLots(txs);
			expect(lots).toHaveLength(1);
			expect(lots[0].quantity).toBe(10);
		});

		it('sorts transactions by date before processing', () => {
			const txs = [
				makeTx({ type: 'sell', assetId: 'A', date: '2024-03-01', quantity: 5, price: 100 }),
				makeTx({ type: 'buy', assetId: 'A', date: '2024-01-01', quantity: 10, price: 50 }),
				makeTx({ type: 'buy', assetId: 'A', date: '2024-02-01', quantity: 10, price: 80 })
			];
			const lots = fifo.computeLots(txs);
			// Should have sold from the first buy (oldest), not the second
			expect(lots).toHaveLength(2);
			expect(lots[0]).toEqual({
				assetId: 'A',
				quantity: 5,
				purchasePrice: 50,
				purchaseDate: '2024-01-01'
			});
			expect(lots[1]).toEqual({
				assetId: 'A',
				quantity: 10,
				purchasePrice: 80,
				purchaseDate: '2024-02-01'
			});
		});
	});

	describe('computeRealizedGains', () => {
		it('returns empty for no sells', () => {
			const txs = [
				makeTx({ type: 'buy', assetId: 'A', date: '2024-01-01', quantity: 10, price: 50 })
			];
			expect(fifo.computeRealizedGains(txs)).toEqual([]);
		});

		it('computes gain for a simple sell', () => {
			const txs = [
				makeTx({ type: 'buy', assetId: 'A', date: '2024-01-01', quantity: 10, price: 50 }),
				makeTx({ type: 'sell', assetId: 'A', date: '2024-06-01', quantity: 10, price: 100 })
			];
			const gains = fifo.computeRealizedGains(txs);
			expect(gains).toHaveLength(1);
			expect(gains[0]).toEqual({
				assetId: 'A',
				sellDate: '2024-06-01',
				quantity: 10,
				costBasis: 500,
				proceeds: 1000,
				gain: 500
			});
		});

		it('computes gain spanning multiple lots with different prices', () => {
			const txs = [
				makeTx({ type: 'buy', assetId: 'A', date: '2024-01-01', quantity: 5, price: 50 }),
				makeTx({ type: 'buy', assetId: 'A', date: '2024-02-01', quantity: 5, price: 80 }),
				makeTx({ type: 'sell', assetId: 'A', date: '2024-06-01', quantity: 7, price: 100 })
			];
			const gains = fifo.computeRealizedGains(txs);
			expect(gains).toHaveLength(1);
			// cost basis: 5*50 + 2*80 = 250 + 160 = 410
			// proceeds: 7*100 = 700
			// gain: 700 - 410 = 290
			expect(gains[0]).toEqual({
				assetId: 'A',
				sellDate: '2024-06-01',
				quantity: 7,
				costBasis: 410,
				proceeds: 700,
				gain: 290
			});
		});

		it('includes fees in cost basis and deducts from proceeds', () => {
			const txs = [
				makeTx({
					type: 'buy',
					assetId: 'A',
					date: '2024-01-01',
					quantity: 10,
					price: 50,
					fee: 10
				}),
				makeTx({
					type: 'sell',
					assetId: 'A',
					date: '2024-06-01',
					quantity: 10,
					price: 100,
					fee: 15
				})
			];
			const gains = fifo.computeRealizedGains(txs);
			expect(gains).toHaveLength(1);
			// cost basis: 10 * (50 + 10/10) = 10 * 51 = 510
			// proceeds: 10 * 100 - 15 = 985
			// gain: 985 - 510 = 475
			expect(gains[0]).toEqual({
				assetId: 'A',
				sellDate: '2024-06-01',
				quantity: 10,
				costBasis: 510,
				proceeds: 985,
				gain: 475
			});
		});
	});
});
