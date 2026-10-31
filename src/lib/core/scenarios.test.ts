import { describe, expect, it } from 'vitest';
import { exposure } from './exposure.ts';
import { evaluateCrisis, rebalanceFlags } from './crisis.ts';
import {
	buildScenarioMatrix,
	DEFAULT_ASSUMPTIONS,
	normalizeAssumptions,
	scenarioCrisis,
	scenarioKind,
	scenarioPath,
	type ScenarioKind
} from './scenarios.ts';

const a = DEFAULT_ASSUMPTIONS;
const run = (
	type: Parameters<typeof scenarioCrisis>[0],
	assets: Array<{ kind: ScenarioKind; leverage: number }>,
	w: number[],
	freq = 'monthly' as const
) => {
	const c = scenarioCrisis(type, a, '2026-01-05');
	const m = buildScenarioMatrix(c, assets, a);
	return evaluateCrisis(m, rebalanceFlags(m.dates, freq), w);
};

describe('CR-8 scenario kinds', () => {
	it('maps exposures to kinds', () => {
		expect(scenarioKind(exposure('equity', { region: 'us' }))).toBe('equity');
		expect(scenarioKind(exposure('equity', { style: 'tech' }))).toBe('tech');
		expect(scenarioKind(exposure('equity', { region: 'emerging' }))).toBe('emerging');
		expect(scenarioKind(exposure('govBond', { maturity: 'long' }))).toBe('govLong');
		expect(scenarioKind(exposure('gold'))).toBe('gold');
		expect(scenarioKind(exposure('unknown'))).toBeNull();
	});
});

describe('CR-8 scenario paths', () => {
	it('reaches the assumed trough and recovers', () => {
		const p = scenarioPath('stagflation', 'equity', 1, a, 600);
		expect(Math.min(...p)).toBeCloseTo(0.55, 2);
		const o = run('stagflation', [{ kind: 'equity', leverage: 1 }], [1]);
		expect(o.drawdown).toBeCloseTo(-0.45, 2);
		// 21 months down + 60 months back up.
		expect(o.recoveryDays! / 30.44).toBeGreaterThan(78);
		expect(o.recoveryDays! / 30.44).toBeLessThan(84);
	});

	it('measures the full assumed fall for every type', () => {
		for (const type of ['deflationary', 'stagflation', 'rateShock', 'bubble', 'liquidity', 'geopolitical', 'sovereign'] as const)
			expect(run(type, [{ kind: 'equity', leverage: 1 }], [1]).drawdown).toBeCloseTo(a.change[type].equity, 3);
	});

	it('gainers soften a mixed portfolio', () => {
		const eq = run('stagflation', [{ kind: 'equity', leverage: 1 }], [1]);
		const mix = run(
			'stagflation',
			[
				{ kind: 'equity', leverage: 1 },
				{ kind: 'gold', leverage: 1 }
			],
			[0.7, 0.3]
		);
		expect(mix.drawdown).toBeGreaterThan(eq.drawdown + 0.15);
		const bonds = run(
			'rateShock',
			[
				{ kind: 'equity', leverage: 1 },
				{ kind: 'govLong', leverage: 1 }
			],
			[0.6, 0.4]
		);
		// Stocks and long bonds fall together in a rate shock.
		expect(bonds.drawdown).toBeLessThan(-0.25);
	});

	it('leverage deepens the fall more than proportionally', () => {
		const lev = run('bubble', [{ kind: 'equity', leverage: 2 }], [1]);
		expect(lev.drawdown).toBeLessThan(-0.75);
		const inverse = run('liquidity', [{ kind: 'equity', leverage: -1 }], [1]);
		expect(inverse.drawdown).toBeGreaterThan(-0.05);
	});

	it('normalizes stored assumptions', () => {
		const n = normalizeAssumptions({ change: { stagflation: { gold: 0.8 } }, toTrough: { liquidity: 'x' } });
		expect(n.change.stagflation.gold).toBe(0.8);
		expect(n.change.stagflation.equity).toBe(-0.45);
		expect(n.toTrough.liquidity).toBe(2);
		expect(normalizeAssumptions({ change: { bubble: { tech: -2 } } }).change.bubble.tech).toBe(-0.99);
	});
});
