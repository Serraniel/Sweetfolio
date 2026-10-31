/**
 * Reference values computed by hand (independent of the implementation),
 * so these tests catch wrong formulas rather than only broken invariants.
 */
import { describe, expect, it } from 'vitest';
import { backtestPortfolio } from './backtest.ts';
import { computeMetrics, maxDrawdown, periodMetrics } from './metrics.ts';

describe('FM-1 … FM-4 reference values', () => {
	// 2020-01-01 → 2021-01-01 is 366 calendar days.
	const prices = [
		{ date: '2020-01-01', close: 100 },
		{ date: '2020-05-01', close: 110 },
		{ date: '2020-09-01', close: 99 },
		{ date: '2021-01-01', close: 120 }
	];
	const m = periodMetrics(prices, 0.01);
	const logs = [Math.log(110 / 100), Math.log(99 / 110), Math.log(120 / 99)];
	const avg = (logs[0]! + logs[1]! + logs[2]!) / 3;
	const sampleSd = Math.sqrt(logs.reduce((s, x) => s + (x - avg) ** 2, 0) / 2);

	it('total and annualized return', () => {
		expect(m.cumulativeReturn).toBeCloseTo(0.2, 12);
		expect(m.annualizedReturn).toBeCloseTo(Math.pow(1.2, 365.25 / 366) - 1, 12);
	});
	it('volatility is the sample std of log returns × √252', () => {
		expect(m.volatility).toBeCloseTo(sampleSd * Math.sqrt(252), 12);
	});
	it('sharpe uses the risk-free rate', () => {
		expect(m.sharpeRatio).toBeCloseTo((Math.pow(1.2, 365.25 / 366) - 1 - 0.01) / (sampleSd * Math.sqrt(252)), 12);
	});
	it('max drawdown 110 → 99 is −10 %', () => {
		expect(maxDrawdown(prices)).toBeCloseTo(-0.1, 12);
	});
	it('all-period metrics equal the full series', () => {
		expect(computeMetrics(prices).all!.cumulativeReturn).toBeCloseTo(0.2, 12);
		expect(computeMetrics(prices)['1y']!.cumulativeReturn).toBeCloseTo(0.2, 12);
	});
});

describe('PM-2 rebalancing reference values', () => {
	// Fri 29 Mar (Q1) → Mon 1 Apr (new quarter, rebalance) → Tue 2 Apr.
	const a = [
		{ date: '2024-03-29', close: 100 },
		{ date: '2024-04-01', close: 200 },
		{ date: '2024-04-02', close: 100 }
	];
	const b = [
		{ date: '2024-03-29', close: 100 },
		{ date: '2024-04-02', close: 100 }
	];
	const assets = [
		{ id: 'a', prices: a, weight: 0.5 },
		{ id: 'b', prices: b, weight: 0.5 }
	];
	it('buy & hold: 0.5 units each → 100, 150, 100', () => {
		expect(backtestPortfolio(assets, 'none').map((p) => p.close)).toEqual([100, 150, 100]);
	});
	it('quarterly: rebalanced to 50/50 at 150 on 1 Apr → 0.375 A + 0.75 B → 112.5', () => {
		const r = backtestPortfolio(assets, 'quarterly').map((p) => p.close);
		expect(r[0]).toBeCloseTo(100);
		expect(r[1]).toBeCloseTo(150);
		expect(r[2]).toBeCloseTo(112.5);
	});
	it('annual rebalancing does not trigger within the year', () => {
		expect(backtestPortfolio(assets, 'annually').map((p) => p.close)).toEqual([100, 150, 100]);
	});
});
