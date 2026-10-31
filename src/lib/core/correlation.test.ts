import { describe, expect, it } from 'vitest';
import { series } from '#test/fixtures.ts';
import { benchmarkCorrelation, computeCorrelationMatrix } from './correlation.ts';

describe('AC-1 correlation matrix', () => {
	const wave = (i: number) => Math.sin(i / 3) * 0.01;
	const a = series('2023-01-02', 200, wave);
	const b = series('2023-01-02', 200, (i) => wave(i) * 2);
	const c = series('2023-01-02', 200, (i) => -wave(i));
	it('is symmetric with unit diagonal and detects (anti)correlation', () => {
		const { matrix, ids } = computeCorrelationMatrix([
			{ id: 'a', prices: a },
			{ id: 'b', prices: b },
			{ id: 'c', prices: c }
		]);
		expect(ids).toEqual(['a', 'b', 'c']);
		expect(matrix[0]![0]).toBe(1);
		expect(matrix[0]![1]).toBeCloseTo(matrix[1]![0]!);
		expect(matrix[0]![1]).toBeGreaterThan(0.99);
		expect(matrix[0]![2]).toBeLessThan(-0.99);
	});
	it('handles a single asset', () => {
		expect(computeCorrelationMatrix([{ id: 'a', prices: a }]).matrix).toEqual([[1]]);
	});
});

describe('FM correlation with the benchmark', () => {
	it('is 1 for the same series and only covers periods the portfolio has', () => {
		const p = series('2023-01-02', 600, (i) => Math.sin(i / 3) * 0.01);
		const bench = series('2015-01-01', 3000, (i) => Math.sin(i / 3) * 0.01);
		const c = benchmarkCorrelation(p, p);
		expect(c['1y']).toBeCloseTo(1, 9);
		expect(c.all).toBeCloseTo(1, 9);
		expect(c['5y']).toBeNull();
		const d = benchmarkCorrelation(p, bench);
		expect(d['1y']).not.toBeNull();
		expect(d['5y']).toBeNull();
	});
	it('is −1 for mirrored returns', () => {
		const a = series('2020-01-01', 400, (i) => Math.sin(i) * 0.01);
		const b = series('2020-01-01', 400, (i) => -Math.sin(i) * 0.01);
		expect(benchmarkCorrelation(a, b).all).toBeLessThan(-0.99);
	});
});
