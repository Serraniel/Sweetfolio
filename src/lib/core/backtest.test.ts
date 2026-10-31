import { describe, expect, it } from 'vitest';
import { series } from '#test/fixtures.ts';
import { backtestPortfolio, normalizeWeights } from './backtest.ts';

describe('PM-2 backtest', () => {
	const up = series('2022-01-03', 600, 0.001);
	const flat = series('2022-01-03', 600, 0);
	it('starts at 100 and weights are normalized', () => {
		const p = backtestPortfolio([
			{ id: 'a', prices: up, weight: 30 },
			{ id: 'b', prices: flat, weight: 70 }
		]);
		expect(p[0]!.close).toBeCloseTo(100);
		const end = p[p.length - 1]!.close;
		const upEnd = (up[up.length - 1]!.close / up[0]!.close) * 100;
		expect(end).toBeCloseTo((30 / 100) * upEnd + 70, 4);
	});
	it('rebalancing changes the outcome vs buy & hold', () => {
		const zig = series('2022-01-03', 600, (i) => (i % 40 < 20 ? 0.01 : -0.009));
		const bh = backtestPortfolio(
			[
				{ id: 'a', prices: zig, weight: 1 },
				{ id: 'b', prices: flat, weight: 1 }
			],
			'none'
		);
		const rb = backtestPortfolio(
			[
				{ id: 'a', prices: zig, weight: 1 },
				{ id: 'b', prices: flat, weight: 1 }
			],
			'monthly'
		);
		expect(bh.length).toBe(rb.length);
		expect(rb[rb.length - 1]!.close).not.toBeCloseTo(bh[bh.length - 1]!.close, 3);
	});
	it('ignores zero weights and empty input', () => {
		expect(backtestPortfolio([])).toEqual([]);
		expect(backtestPortfolio([{ id: 'a', prices: up, weight: 0 }])).toEqual([]);
	});
	it('normalizeWeights', () => {
		expect(normalizeWeights([1, 3])).toEqual([0.25, 0.75]);
		expect(normalizeWeights([0, 0])).toEqual([0.5, 0.5]);
	});
});
