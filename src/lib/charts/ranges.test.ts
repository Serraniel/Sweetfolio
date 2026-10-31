import { describe, expect, it } from 'vitest';
import { availableRanges, rangeStart } from './ranges.ts';

describe('chart ranges', () => {
	it('Max and All have no fixed start', () => {
		expect(rangeStart('max', '2026-10-29')).toBeNull();
		expect(rangeStart('all', '2026-10-29')).toBeNull();
		expect(rangeStart('1y', '2026-10-29')).toBe('2025-10-29');
	});
	it('presets must fit into the common history; All only when series start differently', () => {
		const r = availableRanges('2025-12-08', '2026-10-29', '2017-11-01');
		expect(r).toContain('6m');
		expect(r).not.toContain('1y');
		expect(r).toContain('max');
		expect(r).toContain('all');
		expect(availableRanges('2017-11-01', '2026-10-29')).not.toContain('all');
	});
});
