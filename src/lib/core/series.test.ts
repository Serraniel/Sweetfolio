import { describe, expect, it } from 'vitest';
import { alignSeries, forwardFillBusinessDays, normalizeSeries, valueAt } from './series.ts';

describe('series', () => {
	it('normalizes: sorts, dedupes (last wins), drops NaN', () => {
		expect(
			normalizeSeries([
				{ date: '2024-01-03', close: 3 },
				{ date: '2024-01-01', close: 1 },
				{ date: '2024-01-03', close: 4 },
				{ date: '2024-01-02', close: NaN }
			])
		).toEqual([
			{ date: '2024-01-01', close: 1 },
			{ date: '2024-01-03', close: 4 }
		]);
	});
	it('forward-fills business days only', () => {
		const filled = forwardFillBusinessDays([
			{ date: '2024-05-31', close: 1 }, // Friday
			{ date: '2024-06-05', close: 2 } // Wednesday
		]);
		expect(filled.map((p) => p.date)).toEqual(['2024-05-31', '2024-06-03', '2024-06-04', '2024-06-05']);
		expect(filled.map((p) => p.close)).toEqual([1, 1, 1, 2]);
	});
	it('aligns series on the common range (AC-1)', () => {
		const a = [
			{ date: '2024-06-03', close: 1 },
			{ date: '2024-06-07', close: 2 }
		];
		const b = [
			{ date: '2024-06-01', close: 10 },
			{ date: '2024-06-05', close: 20 },
			{ date: '2024-06-10', close: 30 }
		];
		const { dates, values } = alignSeries([a, b]);
		expect(dates).toEqual(['2024-06-03', '2024-06-04', '2024-06-05', '2024-06-06', '2024-06-07']);
		expect(values[0]).toEqual([1, 1, 1, 1, 2]);
		expect(values[1]).toEqual([10, 10, 20, 20, 20]);
	});
	it('valueAt returns the last value on or before a date', () => {
		const p = [
			{ date: '2024-01-02', close: 1 },
			{ date: '2024-01-05', close: 2 }
		];
		expect(valueAt(p, '2024-01-01')).toBeNull();
		expect(valueAt(p, '2024-01-04')).toBe(1);
		expect(valueAt(p, '2024-02-01')).toBe(2);
	});
});
