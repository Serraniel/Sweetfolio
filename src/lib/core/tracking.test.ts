import { describe, expect, it } from 'vitest';
import { tx } from '#test/fixtures.ts';
import { cashBalance, computeDrift, computeHoldings, fifo, positionAt, rebalanceTrades, twrIndex, valueHistory } from './tracking.ts';

describe('PT-4 FIFO cost basis', () => {
	const txs = [
		tx({ type: 'buy', date: '2024-01-01', quantity: 10, price: 10, fee: 1 }),
		tx({ type: 'buy', date: '2024-02-01', quantity: 10, price: 20, fee: 1 }),
		tx({ type: 'sell', date: '2024-03-01', quantity: 15, price: 30, fee: 2 })
	];
	it('consumes oldest lots first and capitalizes fees', () => {
		const r = fifo.compute(txs);
		expect(r.lots).toHaveLength(1);
		expect(r.lots[0]!.quantity).toBeCloseTo(5);
		expect(r.lots[0]!.unitCost).toBeCloseTo(20.1);
		const g = r.realized[0]!;
		expect(g.costBasis).toBeCloseTo(10 * 10.1 + 5 * 20.1);
		expect(g.proceeds).toBeCloseTo(15 * 30 - 2);
		expect(g.gain).toBeCloseTo(448 - 201.5);
	});
	it('clears floating point dust', () => {
		const r = fifo.compute([
			tx({ type: 'buy', date: '2024-01-01', quantity: 0.1, price: 1 }),
			tx({ type: 'buy', date: '2024-01-01', quantity: 0.2, price: 1 }),
			tx({ type: 'sell', date: '2024-01-02', quantity: 0.3, price: 1 })
		]);
		expect(r.lots).toHaveLength(0);
		expect(r.oversold).toHaveLength(0);
	});
	it('reports oversold quantities', () => {
		const r = fifo.compute([tx({ type: 'sell', date: '2024-01-02', quantity: 1, price: 1 })]);
		expect(r.oversold[0]!.quantity).toBe(1);
	});
	it('positionAt for sell validation', () => {
		expect(positionAt(txs, 'a1', '2024-02-15')).toBe(20);
		expect(positionAt(txs, 'a1', '2024-03-01')).toBe(5);
	});
});

describe('PT-5 holdings', () => {
	it('only counts the cost of remaining lots', () => {
		const s = computeHoldings(
			[
				tx({ type: 'buy', date: '2024-01-01', quantity: 10, price: 10, fee: 10 }),
				tx({ type: 'sell', date: '2024-01-02', quantity: 10, price: 12 }),
				tx({ type: 'buy', date: '2024-01-03', quantity: 5, price: 20 }),
				tx({ type: 'dividend', date: '2024-01-04', amount: 10, withholdingTax: 2 })
			],
			() => 30
		);
		expect(s.holdings).toHaveLength(1);
		expect(s.holdings[0]!.totalCost).toBeCloseTo(100);
		expect(s.holdings[0]!.currentValue).toBeCloseTo(150);
		expect(s.holdings[0]!.weight).toBeCloseTo(1);
		expect(s.realizedGain).toBeCloseTo(10);
		expect(s.dividends).toBeCloseTo(8);
		expect(s.totalReturn).toBeCloseTo(50 + 10 + 8);
	});
	it('values unknown prices at cost', () => {
		const s = computeHoldings([tx({ type: 'buy', date: '2024-01-01', quantity: 2, price: 5 })], () => null);
		expect(s.totalValue).toBe(10);
		expect(s.unrealizedGain).toBe(0);
	});
});

describe('PT-7 cash', () => {
	it('is computed in date order including deposits and withdrawals', () => {
		const txs = [
			tx({ type: 'sell', date: '2024-03-01', quantity: 1, price: 50, fee: 1 }),
			tx({ type: 'deposit', date: '2024-01-01', assetId: '', amount: 1000 }),
			tx({ type: 'buy', date: '2024-02-01', quantity: 2, price: 100, fee: 5 }),
			tx({ type: 'dividend', date: '2024-04-01', amount: 10, withholdingTax: 2.5 }),
			tx({ type: 'withdrawal', date: '2024-05-01', assetId: '', amount: 100 }),
			tx({ type: 'fee', date: '2024-05-02', assetId: '', amount: 3 })
		];
		expect(cashBalance(txs)).toBeCloseTo(1000 - 205 + 49 + 7.5 - 100 - 3);
		expect(cashBalance(txs, '2024-02-15')).toBeCloseTo(795);
		const s = computeHoldings(txs, () => 100, { trackCash: true });
		expect(s.cash).toBeCloseTo(748.5);
		expect(s.totalValue).toBeCloseTo(748.5 + 100);
	});
});

describe('PT-6 value history', () => {
	it('tracks market value and invested capital', () => {
		const prices = [
			{ date: '2024-01-01', close: 10 },
			{ date: '2024-01-03', close: 12 }
		];
		const h = valueHistory(
			[tx({ type: 'buy', date: '2024-01-01', quantity: 10, price: 10 }), tx({ type: 'sell', date: '2024-01-03', quantity: 5, price: 12 })],
			() => prices,
			'2024-01-04'
		);
		expect(h.map((p) => p.value)).toEqual([100, 100, 60, 60]);
		expect(h.at(-1)!.invested).toBeCloseTo(50);
	});
});

describe('PT-8 drift and rebalancing', () => {
	const holdings = computeHoldings(
		[
			tx({ type: 'buy', date: '2024-01-01', assetId: 'a', quantity: 7, price: 10 }),
			tx({ type: 'buy', date: '2024-01-01', assetId: 'b', quantity: 2, price: 10 }),
			tx({ type: 'buy', date: '2024-01-01', assetId: 'x', quantity: 1, price: 10 })
		],
		() => 10
	).holdings;
	const model = [
		{ assetId: 'a', weight: 0.5 },
		{ assetId: 'b', weight: 0.5 }
	];
	it('computes drift including off-model holdings', () => {
		const d = computeDrift(model, holdings);
		expect(d.find((x) => x.assetId === 'a')!.drift).toBeCloseTo(0.2);
		expect(d.find((x) => x.assetId === 'x')!.modelWeight).toBe(0);
	});
	it('suggests trades restoring the model', () => {
		const t = rebalanceTrades(model, holdings);
		expect(t.find((x) => x.assetId === 'b')).toMatchObject({ action: 'buy', value: 30, quantity: 3 });
		expect(t.find((x) => x.assetId === 'a')).toMatchObject({ action: 'sell', value: 20 });
		expect(t.find((x) => x.assetId === 'x')).toMatchObject({ action: 'sell', value: 10 });
	});
	it('cash-only mode buys underweight assets with available cash', () => {
		const t = rebalanceTrades(model, holdings, { availableCash: 20, cashOnly: true });
		expect(t.every((x) => x.action === 'buy')).toBe(true);
		expect(t.reduce((s, x) => s + x.value, 0)).toBeCloseTo(20);
	});
});

describe('CP-5 time-weighted performance of tracked portfolios', () => {
	// Price 100 until Jan 10, 110 until Jan 20, then 121: +10 % twice = +21 %.
	const prices = [
		{ date: '2024-01-01', close: 100 },
		{ date: '2024-01-10', close: 110 },
		{ date: '2024-01-20', close: 121 }
	];
	const last = (txs: Parameters<typeof valueHistory>[0], trackCash = false) =>
		twrIndex(valueHistory(txs, () => prices, '2024-01-25', { trackCash })).at(-1)!.close;

	it('ignores additional buys (money in is not a gain)', () => {
		expect(
			last([
				tx({ type: 'buy', date: '2024-01-01', quantity: 10, price: 100 }),
				tx({ type: 'buy', date: '2024-01-10', quantity: 10, price: 110 })
			])
		).toBeCloseTo(121, 6);
	});
	it('ignores deposits when tracking cash, idle cash dilutes the return', () => {
		// 1 000 deposited and fully invested; another 1 100 deposited and kept as cash after +10 %.
		const v = last(
			[
				tx({ type: 'deposit', date: '2024-01-01', amount: 1000 }),
				tx({ type: 'buy', date: '2024-01-01', quantity: 10, price: 100 }),
				tx({ type: 'deposit', date: '2024-01-10', amount: 1100 })
			],
			true
		);
		// +10 % on 1 000, then +10 % on 1 100 invested of 2 200 total = +5 %: 110 × 1.05.
		expect(v).toBeCloseTo(115.5, 6);
	});
	it('counts dividends and sell proceeds without cash tracking as returned to the investor', () => {
		const v = last([
			tx({ type: 'buy', date: '2024-01-01', quantity: 10, price: 100 }),
			tx({ type: 'dividend', date: '2024-01-10', amount: 100 }),
			tx({ type: 'sell', date: '2024-01-20', quantity: 10, price: 121 })
		]);
		// Jan 10: (1 100 + 100 paid out) ÷ 1 000 = +20 %; Jan 20: 1 210 ÷ 1 100 = +10 %.
		expect(v).toBeCloseTo(132, 6);
	});
	it('starts at the first position and stays flat while nothing is held', () => {
		const idx = twrIndex(
			valueHistory(
				[
					tx({ type: 'buy', date: '2024-01-10', quantity: 1, price: 110 }),
					tx({ type: 'sell', date: '2024-01-15', quantity: 1, price: 110 })
				],
				() => prices,
				'2024-01-25'
			)
		);
		expect(idx[0]!.date).toBe('2024-01-10');
		expect(idx.at(-1)!.close).toBeCloseTo(100, 6);
	});
});
