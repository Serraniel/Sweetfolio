import { describe, expect, it } from 'vitest';
import { series } from '#test/fixtures.ts';
import { annualizedReturn } from './metrics.ts';
import {
	bestIndex,
	dominatingIndices,
	efficientFrontier,
	estimateInputs,
	estimateSimulationBytes,
	generateSubsetWeights,
	generateWeights,
	planSubsets,
	portfolioStats,
	projectCapped,
	runSimulation,
	seededRng,
	seriesStats,
	solveMeanVariance,
	validateConstraints,
	weightsAt,
	type Estimates
} from './montecarlo.ts';

const sumOf = (w: ArrayLike<number>) => Array.from(w).reduce((s, v) => s + v, 0);
const est2 = (mu: [number, number], sd: [number, number], rho = 0): Estimates => ({
	mu,
	cov: [
		[sd[0] ** 2, rho * sd[0] * sd[1]],
		[rho * sd[0] * sd[1], sd[1] ** 2]
	],
	window: { start: '2020-01-01', end: '2024-01-01', observations: 1000 }
});

describe('MC-2 weight generation', () => {
	it('sums to 1 on a 0.5 % grid and drops weights below 3 %', () => {
		const rng = seededRng(1);
		for (let k = 0; k < 500; k++) {
			const w = generateWeights(6, rng, undefined, k % 2 ? 0.2 : 1);
			expect(sumOf(w)).toBeCloseTo(1, 9);
			for (const x of w) {
				expect(Math.abs(x * 200 - Math.round(x * 200))).toBeLessThan(1e-9);
				expect(x === 0 || x >= 0.03 - 1e-9).toBe(true);
			}
		}
	});
	it('low concentration produces concentrated portfolios', () => {
		const rng = seededRng(2);
		const maxWeight = (alpha: number) => {
			let s = 0;
			for (let k = 0; k < 400; k++) s += Math.max(...generateWeights(8, rng, undefined, alpha));
			return s / 400;
		};
		expect(maxWeight(0.15)).toBeGreaterThan(maxWeight(1) + 0.2);
	});
});

describe('MC-4 weight constraints', () => {
	it('validates constraints', () => {
		expect(
			validateConstraints([
				{ min: 0.6, max: 1 },
				{ min: 0.5, max: 1 }
			]).ok
		).toBe(false);
		expect(
			validateConstraints([
				{ min: 0, max: 0.3 },
				{ min: 0, max: 0.3 }
			]).ok
		).toBe(false);
		expect(validateConstraints([{ min: 0.5, max: 0.4 }]).ok).toBe(false);
		expect(validateConstraints([{ min: 0.4, max: 1 }, { min: 0, max: 0.15 }, undefined]).ok).toBe(true);
	});
	it('sampled weights always satisfy min/max', () => {
		const c = [
			{ min: 0.4, max: 1 },
			{ min: 0, max: 0.15 },
			{ min: 0.1, max: 0.2 },
			{ min: 0, max: 1 }
		];
		const rng = seededRng(42);
		for (let k = 0; k < 1000; k++) {
			const w = generateWeights(4, rng, c, k % 3 ? 1 : 0.2);
			expect(sumOf(w)).toBeCloseTo(1, 9);
			w.forEach((x, i) => {
				expect(x).toBeGreaterThanOrEqual(c[i]!.min - 1e-9);
				expect(x).toBeLessThanOrEqual(c[i]!.max + 1e-9);
			});
		}
	});
});

describe('MC-4 held minimums and asset counts', () => {
	const open = (n: number, floor?: number, max = 1) => Array.from({ length: n }, () => ({ min: 0, max, ...(floor ? { floor } : {}) }));
	const held = (w: readonly number[]) => w.filter((x) => x > 0).length;

	it('plain per-asset limits need no subset plan', () => {
		expect(planSubsets([{ min: 0.1, max: 0.5 }, undefined])).toBeNull();
		expect(planSubsets(open(4), { minAssets: 1, maxAssets: 4 })).toBeNull();
	});
	it('finds the feasible numbers of held assets', () => {
		// 0 or ≥ 30 %: at most 3 assets; max 40 %: at least 3 assets.
		expect(planSubsets(open(6, 0.3, 0.4))!.sizes).toEqual([3]);
		expect(planSubsets(open(6), { minAssets: 2, maxAssets: 4 })!.sizes).toEqual([2, 3, 4]);
	});
	it('rejects infeasible combinations with a message', () => {
		expect(validateConstraints(open(6, 0.3, 0.2)).errors.join()).toContain('above its maximum');
		expect(validateConstraints(open(6, 0.3), { minAssets: 4 }).errors.join()).toContain('No combination of 4–6 assets');
		expect(validateConstraints(open(3), { minAssets: 4 }).ok).toBe(false);
		expect(validateConstraints(open(5), { minAssets: 3, maxAssets: 2 }).ok).toBe(false);
		expect(validateConstraints(open(5), { minAssets: 1.5 }).ok).toBe(false);
		expect(
			validateConstraints(
				[
					{ min: 0.1, max: 1 },
					{ min: 0.1, max: 1 },
					{ min: 0, max: 1 }
				],
				{ maxAssets: 1 }
			).ok
		).toBe(false);
		expect(validateConstraints(open(8, 0.05, 0.25), { minAssets: 4, maxAssets: 6 }).ok).toBe(true);
	});
	it('sampled weights are 0 or within floor and cap, with an allowed count', () => {
		const c = [{ min: 0.1, max: 0.5 }, ...open(7, 0.05, 0.25)];
		const plan = planSubsets(c, { minAssets: 3, maxAssets: 5 })!;
		const rng = seededRng(3);
		const counts = new Set<number>();
		for (let k = 0; k < 2000; k++) {
			const w = generateSubsetWeights(plan, rng, k % 2 ? 1 : 0.2);
			expect(sumOf(w)).toBeCloseTo(1, 9);
			expect(w[0]).toBeGreaterThanOrEqual(0.1 - 1e-9);
			w.forEach((x, i) => {
				if (x > 0) expect(x).toBeGreaterThanOrEqual(Math.max(c[i]!.min, c[i]!.floor ?? 0) - 1e-9);
				expect(x).toBeLessThanOrEqual(c[i]!.max + 1e-9);
			});
			counts.add(held(w));
		}
		expect([...counts].sort()).toEqual([3, 4, 5]);
	});
});

describe('MC-5 optimizer reference values', () => {
	it('projects onto the capped simplex', () => {
		expect(projectCapped([0.5, 0.5], [0, 0], [1, 1])).toEqual([0.5, 0.5]);
		const p = projectCapped([2, 0, 0], [0, 0, 0], [0.5, 1, 1]);
		expect(p[0]).toBeCloseTo(0.5);
		expect(p[1]).toBeCloseTo(0.25);
		expect(sumOf(p)).toBeCloseTo(1);
	});
	it('finds the analytic minimum-variance mix of two uncorrelated assets', () => {
		// w1 = σ2² / (σ1² + σ2²) = 0.04 / (0.01 + 0.04) = 0.8
		const w = solveMeanVariance(est2([0.05, 0.08], [0.1, 0.2]), Infinity, [0, 0], [1, 1], 2000);
		expect(w[0]).toBeCloseTo(0.8, 3);
	});
	it('matches the analytic minimum variance with correlation', () => {
		// w1 = (σ2² − ρσ1σ2) / (σ1² + σ2² − 2ρσ1σ2)
		const s1 = 0.15;
		const s2 = 0.25;
		const rho = 0.3;
		const expected = (s2 ** 2 - rho * s1 * s2) / (s1 ** 2 + s2 ** 2 - 2 * rho * s1 * s2);
		const w = solveMeanVariance(est2([0.05, 0.08], [s1, s2], rho), Infinity, [0, 0], [1, 1], 3000);
		expect(w[0]).toBeCloseTo(expected, 3);
	});
	it('respects bounds and the frontier is efficient and constrained', () => {
		const est = est2([0.04, 0.1], [0.1, 0.25], 0.2);
		const f = efficientFrontier(est, [
			{ min: 0.2, max: 1 },
			{ min: 0, max: 0.6 }
		]);
		expect(f.length).toBeGreaterThan(5);
		let prevVol = -1;
		let prevRet = -Infinity;
		for (const w of f) {
			expect(w[0]).toBeGreaterThanOrEqual(0.2 - 1e-6);
			expect(w[1]).toBeLessThanOrEqual(0.6 + 1e-6);
			const s = portfolioStats(w, est, 0);
			expect(s.volatility).toBeGreaterThan(prevVol);
			expect(s.annualizedReturn).toBeGreaterThan(prevRet);
			prevVol = s.volatility;
			prevRet = s.annualizedReturn;
		}
	});
});

describe('MC-3 estimation and return definition', () => {
	it('estimates zero risk and the drift for constant growth', () => {
		const e = estimateInputs([{ id: 'a', prices: series('2020-01-01', 300, 0.0004) }]);
		expect(e.mu[0]).toBeCloseTo(0.0004 * 252, 6);
		expect(e.cov[0]![0]).toBeCloseTo(0, 10);
	});
	it("a single asset's expected return matches its historical growth rate", () => {
		const prices = series('2015-01-01', 2000, (i) => 0.0003 + Math.sin(i * 1.7) * 0.012);
		const e = estimateInputs([{ id: 'a', prices }]);
		const s = portfolioStats([1], e, 0);
		expect(Math.abs(s.annualizedReturn - annualizedReturn(prices))).toBeLessThan(0.01);
	});
	it('includes the diversification benefit', () => {
		// Two uncorrelated assets with the same return and risk: 50/50 has the same arithmetic
		// mean but half the variance, hence a higher compound return.
		const e = est2([0.08, 0.08], [0.3, 0.3]);
		expect(portfolioStats([0.5, 0.5], e, 0).annualizedReturn).toBeGreaterThan(portfolioStats([1, 0], e, 0).annualizedReturn + 0.01);
	});
	it('uses the common window for all assets', () => {
		const e = estimateInputs([
			{ id: 'a', prices: series('2015-01-01', 2000, 0.0005) },
			{ id: 'b', prices: series('2022-01-03', 300, 0.0001) }
		]);
		expect(e.window.start).toBe('2022-01-03');
		expect(e.mu[0]).toBeCloseTo(0.0005 * 252, 4);
	});
	it('series stats agree with portfolio stats for the same series', () => {
		const prices = series('2018-01-01', 900, (i) => 0.0004 + Math.cos(i * 0.9) * 0.01);
		const e = estimateInputs([{ id: 'a', prices }]);
		const s = seriesStats(prices, e.window, 0)!;
		const p = portfolioStats([1], e, 0);
		expect(s.annualizedReturn).toBeCloseTo(p.annualizedReturn, 6);
		expect(s.volatility).toBeCloseTo(p.volatility, 6);
	});
});

describe('MC-6/MC-7 simulation', () => {
	const a = series('2015-01-01', 1500, (i) => 0.0006 + Math.sin(i / 5) * 0.01);
	const b = series('2015-01-01', 1500, (i) => 0.0002 + Math.cos(i / 7) * 0.004);
	const c = series('2015-01-01', 1500, (i) => 0.0004 + Math.sin(i / 3 + 1) * 0.008);
	const assets = [
		{ id: 'a', prices: a },
		{ id: 'b', prices: b },
		{ id: 'c', prices: c }
	];
	const r = runSimulation({ assets, count: 3000, riskFreeRate: 0.01 }, seededRng(7));

	it('no random portfolio beats the exact frontier', () => {
		const fv = r.frontier.map((i) => r.volatilities[i]!);
		const fr = r.frontier.map((i) => r.returns[i]!);
		// Linear interpolation between frontier points is a lower bound of the concave frontier.
		const frontierAt = (v: number) => {
			if (v >= fv[fv.length - 1]!) return fr[fr.length - 1]!;
			const k = fv.findIndex((x) => x >= v);
			if (k <= 0) return fr[0]!;
			const t = (v - fv[k - 1]!) / (fv[k]! - fv[k - 1]!);
			return fr[k - 1]! + t * (fr[k]! - fr[k - 1]!);
		};
		for (let i = 0; i < r.count; i++) {
			if (r.volatilities[i]! < fv[0]!) throw new Error('sample has lower volatility than the minimum-variance portfolio');
			expect(r.returns[i]!).toBeLessThanOrEqual(frontierAt(r.volatilities[i]!) + 1e-4);
		}
	});
	it('quick picks return frontier portfolios with valid weights', () => {
		const best = bestIndex(r, 'sharpe');
		for (let i = 0; i < r.count; i++) expect(r.sharpes[i]!).toBeLessThanOrEqual(r.sharpes[best]! + 1e-12);
		expect(sumOf(Object.values(weightsAt(r, best)))).toBeCloseTo(1, 5);
		expect(r.frontier).toContain(bestIndex(r, 'minVol'));
	});
	it('asset markers lie on the same scale as portfolios', () => {
		const single = r.assetStats.find((s) => s.id === 'a')!;
		const est = estimateInputs(assets);
		expect(single.annualizedReturn).toBeCloseTo(portfolioStats([1, 0, 0], est, 0).annualizedReturn, 9);
	});
	it('frontier under held minimums and counts is feasible and not beaten by any sample', () => {
		const prices = Array.from({ length: 21 }, (_, k) =>
			series('2015-01-01', 1200, (i) => 0.0002 + (k % 7) * 0.0001 + Math.sin(i / (3 + k) + k) * (0.004 + (k % 5) * 0.002))
		);
		const many = prices.map((p, k) => ({ id: `x${k}`, prices: p }));
		const constraints = many.map(() => ({ min: 0, max: 0.3, floor: 0.05 }));
		const started = performance.now();
		const s = runSimulation({ assets: many, count: 5000, riskFreeRate: 0, constraints, minAssets: 4, maxAssets: 8 }, seededRng(9));
		expect(performance.now() - started).toBeLessThan(15_000);
		expect(s.frontierApproximate).toBe(true);
		const n = many.length;
		for (let i = 0; i < s.count; i++) {
			const w = Array.from(s.weights.subarray(i * n, (i + 1) * n));
			const k = w.filter((x) => x > 1e-6).length;
			expect(k).toBeGreaterThanOrEqual(4);
			expect(k).toBeLessThanOrEqual(8);
			for (const x of w) expect(x <= 1e-6 || (x >= 0.05 - 1e-4 && x <= 0.3 + 1e-4)).toBe(true);
		}
		const fv = s.frontier.map((i) => s.volatilities[i]!);
		for (let k = 1; k < fv.length; k++) expect(fv[k]!).toBeGreaterThan(fv[k - 1]!);
		for (let i = 0; i < s.count; i++) {
			// No point has at most the risk and more return than the best frontier point at that risk.
			const best = Math.max(...s.frontier.filter((f) => s.volatilities[f]! <= s.volatilities[i]! + 1e-12).map((f) => s.returns[f]!));
			expect(s.returns[i]!).toBeLessThanOrEqual(best + 1e-9);
		}
	});
	it('keeps every distinct portfolio and estimates memory per portfolio', () => {
		const big = runSimulation({ assets, count: 20_000, riskFreeRate: 0 }, seededRng(5));
		const keys = new Set<string>();
		for (let i = 0; i < big.count; i++) keys.add(Array.from(big.weights.subarray(i * 3, i * 3 + 3), (x) => Math.round(x * 200)).join());
		// Only the frontier points (off the 0.5 % grid) may coincide after rounding.
		expect(keys.size).toBeGreaterThanOrEqual(big.count - big.frontier.length);
		expect(estimateSimulationBytes(1_000_000, 21)).toBe(1_000_000 * (21 * 4 + 72));
	});
	it('reports progress for the random portfolios first, then the frontier', () => {
		const seen: string[] = [];
		let last: [number, number] = [0, 0];
		runSimulation({ assets, count: 1000, riskFreeRate: 0 }, seededRng(1), (done, total, phase) => {
			if (seen.at(-1) !== phase) seen.push(phase);
			last = [done, total];
		});
		expect(seen).toEqual(['portfolios', 'frontier']);
		expect(last[0]).toBe(last[1]);
	});
	it('finds portfolios dominating a reference', () => {
		const worst = { volatility: Math.max(...r.volatilities), annualizedReturn: Math.min(...r.returns) };
		expect(dominatingIndices(r, worst).length).toBeGreaterThan(0);
		expect(dominatingIndices(r, { volatility: 0, annualizedReturn: 10 })).toEqual([]);
	});
});
