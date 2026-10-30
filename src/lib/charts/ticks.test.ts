import { describe, expect, it } from 'vitest';
import { logTicks } from './ticks.ts';

const pct = (t: number[]) => t.map((f) => Math.round((f - 1) * 1000) / 10);

describe('CH-7 log axis ticks', () => {
	it('short ranges get several nice returns including 0 %', () => {
		const t = pct(logTicks(0.96, 1.55, 6, true));
		expect(t).toContain(0);
		expect(t.length).toBeGreaterThanOrEqual(4);
		for (const v of t) expect(v % 5).toBe(0);
	});
	it('long ranges spread evenly in log space', () => {
		const t = logTicks(0.9, 10.8, 6, true);
		expect(pct(t)).toEqual(expect.arrayContaining([0, 100]));
		expect(t.length).toBeGreaterThanOrEqual(4);
		expect(t.length).toBeLessThanOrEqual(8);
		const gaps = t.slice(1).map((v, i) => Math.log(v / t[i]!));
		expect(Math.max(...gaps) / Math.min(...gaps)).toBeLessThan(3);
	});
	it('values mode uses 1-2-5 style numbers', () => {
		const t = logTicks(45, 1100, 6, false);
		expect(t).toEqual(expect.arrayContaining([100, 1000]));
		for (const v of t) expect(v).toBeGreaterThanOrEqual(45);
	});
	it('handles losses and empty input', () => {
		const t = pct(logTicks(0.4, 1.05, 5, true));
		expect(t).toContain(0);
		expect(Math.min(...t)).toBeLessThanOrEqual(-40);
		expect(logTicks(0, 1, 5, true)).toEqual([]);
	});
});
