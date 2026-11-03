import { describe, expect, it } from 'vitest';
import type { PricePoint } from '#lib/domain/types.ts';
import { fromDayNumber, isWeekend, toDayNumber } from './dates.ts';
import {
	buildCrisisMatrix,
	compareOutcome,
	CRISES,
	crisisScore,
	evaluateCrisis,
	nonDominated3,
	rebalanceFlags,
	type Crisis,
	type CrisisOutcome
} from './crisis.ts';

const crisis: Crisis = { id: 'x', name: 'X', type: 'liquidity', start: '2020-01-01', end: '2020-03-31', description: '' };

/** Business-day series following `f(dayIndex)` from `start` for `days` business days. */
function path(start: string, days: number, f: (i: number) => number): PricePoint[] {
	const out: PricePoint[] = [];
	for (let d = toDayNumber(start); out.length < days; d++) if (!isWeekend(d)) out.push({ date: fromDayNumber(d), close: f(out.length) });
	return out;
}

describe('CR-2 catalogue', () => {
	it('has valid, ordered windows', () => {
		for (const c of CRISES) expect(c.start < c.end).toBe(true);
		expect(new Set(CRISES.map((c) => c.id)).size).toBe(CRISES.length);
	});
});

describe('CR-4 crisis evaluation', () => {
	// Falls 50 % until day 40, back to the start by day 140, flat afterwards.
	const vShape = path('2019-12-02', 400, (i) => (i < 22 ? 100 : i < 62 ? 100 - (i - 22) * 1.25 : i < 162 ? 50 + (i - 62) * 0.5 : 100));
	const steady = path('2019-12-02', 400, () => 100);

	it('measures drawdown, recovery and crisis return', () => {
		const m = buildCrisisMatrix([vShape], crisis)!;
		const o = evaluateCrisis(m, rebalanceFlags(m.dates, 'none'), [1]);
		expect(o.drawdown).toBeCloseTo(-0.5, 2);
		expect(o.peakDate).toBe('2020-01-01');
		expect(o.recoveryDate).not.toBeNull();
		expect(o.recoveryDays).toBeGreaterThan(100);
		expect(o.crisisReturn).toBeLessThan(-0.3);
	});

	it('mixes assets with rebalancing', () => {
		const m = buildCrisisMatrix([vShape, steady], crisis)!;
		const hold = evaluateCrisis(m, rebalanceFlags(m.dates, 'none'), [0.5, 0.5]);
		const monthly = evaluateCrisis(m, rebalanceFlags(m.dates, 'monthly'), [0.5, 0.5]);
		expect(hold.drawdown).toBeCloseTo(-0.25, 2);
		// Rebalancing into the falling asset deepens the drawdown slightly but speeds up the recovery.
		expect(monthly.drawdown).toBeLessThan(hold.drawdown);
		expect(monthly.recoveryDays!).toBeLessThan(hold.recoveryDays!);
	});

	it('reports unrecovered crises and requires coverage', () => {
		const down = path('2019-12-02', 200, (i) => 100 - i * 0.2);
		const m = buildCrisisMatrix([down], crisis)!;
		const o = evaluateCrisis(m, rebalanceFlags(m.dates, 'none'), [1]);
		expect(o.recoveryDate).toBeNull();
		expect(o.recoveryDays).toBeNull();
		expect(buildCrisisMatrix([path('2020-02-01', 100, () => 1)], crisis)).toBeNull();
		expect(buildCrisisMatrix([path('2019-01-01', 50, () => 1)], crisis)).toBeNull();
	});

	it('counts a recovery inside the window', () => {
		const long = { ...crisis, end: '2020-12-31' };
		const m = buildCrisisMatrix([vShape], long)!;
		const o = evaluateCrisis(m, rebalanceFlags(m.dates, 'none'), [1]);
		expect(o.recoveryDate! < long.end).toBe(true);
	});
});

describe('CR-5 benchmark comparison and score', () => {
	const o = (drawdown: number, recoveryDays: number | null): CrisisOutcome => ({
		drawdown,
		recoveryDays,
		openDays: recoveryDays ?? 1827,
		peakDate: '2020-01-01',
		troughDate: '2020-02-01',
		recoveryDate: null,
		crisisReturn: 0,
		dataEnd: '2025-01-01'
	});

	it('applies tolerances', () => {
		const b = o(-0.3, 400);
		expect(compareOutcome(o(-0.34, 500), b)).toBe('similar');
		expect(compareOutcome(o(-0.36, 300), b)).toBe('worse');
		expect(compareOutcome(o(-0.3, 700), b)).toBe('worse');
		expect(compareOutcome(o(-0.2, 400), b)).toBe('better');
		expect(compareOutcome(o(-0.3, null), b)).toBe('worse');
		expect(compareOutcome(o(-0.3, 100), o(-0.3, null))).toBe('better');
	});

	it('scores worst, mean and recovery', () => {
		const list = [o(-0.2, 100), o(-0.4, null)];
		expect(crisisScore(list, 'worstDrawdown')).toBe(-0.4);
		expect(crisisScore(list, 'meanDrawdown')).toBeCloseTo(-0.3);
		expect(crisisScore(list, 'longestRecovery')).toBeLessThan(-4.9);
		expect(crisisScore([], 'worstDrawdown')).toBeNaN();
	});

	it('finds the three-way efficient set', () => {
		const ret = [0.05, 0.06, 0.07, 0.07];
		const vol = [0.1, 0.12, 0.15, 0.15];
		const score = [-0.3, -0.35, -0.2, -0.4];
		expect(nonDominated3(ret, vol, score, [0, 1, 2, 3]).sort()).toEqual([0, 1, 2]);
	});
});
