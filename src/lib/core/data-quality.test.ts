import { describe, expect, it } from 'vitest';
import { series } from '#test/fixtures.ts';
import { computeAssetHealth } from './data-quality.ts';

describe('AM-5 data quality', () => {
	it('flags few points and short history', () => {
		const h = computeAssetHealth(series('2024-01-01', 20, 0.001));
		expect(h.warnings.map((w) => w.type)).toEqual(expect.arrayContaining(['few_data_points', 'short_history']));
	});
	it('flags large single-day moves', () => {
		const h = computeAssetHealth(series('2020-01-01', 400, (i) => (i === 100 ? 0.5 : 0.0005)));
		expect(h.warnings.some((w) => w.type === 'large_daily_move')).toBe(true);
	});
	it('handles insufficient data', () => {
		expect(computeAssetHealth([]).dataPoints).toBe(0);
	});
});
