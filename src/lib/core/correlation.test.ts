import { describe, expect, it } from 'vitest';
import { series } from '#test/fixtures.ts';
import { computeCorrelationMatrix } from './correlation.ts';

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
