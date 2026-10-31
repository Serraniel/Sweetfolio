import { describe, expect, it } from 'vitest';
import { series } from '#test/fixtures.ts';
import {
	annualizedReturn,
	annualizedVolatility,
	availablePeriods,
	computeMetrics,
	cumulativeReturn,
	drawdownSeries,
	maxDrawdown,
	sharpeRatio
} from './metrics.ts';

describe('FM-1 returns', () => {
	it('cumulative return', () => {
		expect(
			cumulativeReturn([
				{ date: '2020-01-01', close: 100 },
				{ date: '2021-01-01', close: 150 }
			])
		).toBeCloseTo(0.5);
	});
	it('annualized return over calendar days', () => {
		const p = [
			{ date: '2020-01-01', close: 100 },
			{ date: '2022-01-01', close: 121 }
		];
		expect(annualizedReturn(p)).toBeCloseTo(0.1, 2);
	});
	it('total loss returns -1', () => {
		expect(
			annualizedReturn([
				{ date: '2020-01-01', close: 100 },
				{ date: '2021-01-01', close: 0 }
			])
		).toBe(-1);
	});
});

describe('FM-2/3 volatility and sharpe', () => {
	it('constant growth has zero volatility', () => {
		expect(annualizedVolatility(series('2020-01-01', 100, 0.001))).toBeCloseTo(0, 10);
	});
	it('alternating returns give the expected annualized volatility', () => {
		const p = series('2020-01-01', 501, (i) => (i % 2 ? -0.01 : 0.01));
		const v = annualizedVolatility(p);
		expect(v).toBeGreaterThan(0.15);
		expect(v).toBeLessThan(0.17);
	});
	it('sharpe is 0 with zero volatility', () => {
		expect(sharpeRatio(0.1, 0, 0.02)).toBe(0);
		expect(sharpeRatio(0.1, 0.2, 0.02)).toBeCloseTo(0.4);
	});
});

describe('FM-4 drawdown', () => {
	const p = [100, 120, 90, 130, 65].map((close, i) => ({ date: `2020-01-0${i + 1}`, close }));
	it('max drawdown is the worst peak-to-trough decline', () => {
		expect(maxDrawdown(p)).toBeCloseTo(-0.5);
	});
	it('drawdown series is never positive', () => {
		expect(drawdownSeries(p).every((d) => d.close <= 0)).toBe(true);
		expect(drawdownSeries(p)[2]!.close).toBeCloseTo(-0.25);
	});
});

describe('FM-5 periods', () => {
	it('marks uncovered periods as null instead of truncating', () => {
		const p = series('2020-01-01', 260 * 2, 0.0005);
		const m = computeMetrics(p);
		expect(m['1y']).not.toBeNull();
		expect(m['3y']).toBeNull();
		expect(m['15y']).toBeNull();
		expect(m.all).not.toBeNull();
		expect([...availablePeriods(p)].sort()).toEqual(['1y', 'all']);
	});
	it('applies the risk-free rate', () => {
		const p = series('2020-01-01', 600, (i) => (i % 2 ? -0.004 : 0.006));
		const a = computeMetrics(p, 0).all!;
		const b = computeMetrics(p, 0.02).all!;
		expect(b.sharpeRatio).toBeLessThan(a.sharpeRatio);
	});
	it('handles empty input', () => {
		expect(computeMetrics([]).all).toBeNull();
	});
});
