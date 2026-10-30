/**
 * Monte Carlo portfolio simulation (MC-1 … MC-7). Pure and deterministic for a
 * given RNG so it can be unit tested; the worker only adds messaging.
 */
import type { MonteCarloResult, PricePoint, WeightConstraint } from '#lib/domain/types.ts';
import { mean, stddev } from './math.ts';
import { TRADING_DAYS } from './metrics.ts';
import { alignSeries, ensureSorted } from './series.ts';

export const WEIGHT_STEP = 0.005;
export const MIN_UNCONSTRAINED_WEIGHT = 0.03;

export type Rng = () => number;

/** Small, fast seedable PRNG (mulberry32) for reproducible tests. */
export function seededRng(seed: number): Rng {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export interface ConstraintValidation {
	ok: boolean;
	errors: string[];
}

export function validateConstraints(constraints: ReadonlyArray<WeightConstraint | undefined>): ConstraintValidation {
	const errors: string[] = [];
	let minSum = 0;
	let maxSum = 0;
	constraints.forEach((c, i) => {
		const min = c?.min ?? 0;
		const max = c?.max ?? 1;
		if (min < 0 || max > 1) errors.push(`Asset ${i + 1}: limits must be between 0 % and 100 %.`);
		if (min > max) errors.push(`Asset ${i + 1}: minimum is greater than maximum.`);
		minSum += min;
		maxSum += max;
	});
	if (minSum > 1 + 1e-9) errors.push(`Minimums add up to ${(minSum * 100).toFixed(1)} % (more than 100 %).`);
	if (maxSum < 1 - 1e-9) errors.push(`Maximums add up to ${(maxSum * 100).toFixed(1)} % (less than 100 %).`);
	return { ok: errors.length === 0, errors };
}

/**
 * Random weights on a 0.5 % grid summing to 1.
 * Without constraints: Dirichlet(1) sample, weights below 3 % are dropped.
 * With constraints: minimums are allocated first, the remainder is spread by a
 * Dirichlet sample with water-filling against the maximums.
 * Callers must validate constraints first.
 */
/** Gamma(alpha, 1) sample (Marsaglia–Tsang; boosted for alpha < 1). */
export function gammaSample(alpha: number, rng: Rng): number {
	if (alpha < 1) return gammaSample(alpha + 1, rng) * Math.pow(rng() || 1e-12, 1 / alpha);
	const d = alpha - 1 / 3;
	const c = 1 / Math.sqrt(9 * d);
	for (;;) {
		let x: number;
		let v: number;
		do {
			const u1 = rng() || 1e-12;
			const u2 = rng();
			x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
			v = 1 + c * x;
		} while (v <= 0);
		v = v * v * v;
		const u = rng() || 1e-12;
		if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
	}
}

/**
 * Random weights on a 0.5 % grid summing to 1. `alpha` is the Dirichlet
 * concentration: 1 = uniform over all mixes, < 1 favours concentrated
 * portfolios, > 1 balanced ones.
 */
export function generateWeights(n: number, rng: Rng, constraints?: ReadonlyArray<WeightConstraint | undefined>, alpha = 1): number[] {
	const STEPS = Math.round(1 / WEIGHT_STEP);
	const hasConstraints = !!constraints && constraints.some((c) => c && (c.min > 0 || c.max < 1));
	const minSteps = new Array<number>(n);
	const maxSteps = new Array<number>(n);
	for (let i = 0; i < n; i++) {
		const c = constraints?.[i];
		minSteps[i] = Math.ceil((c?.min ?? 0) * STEPS - 1e-9);
		maxSteps[i] = Math.floor((c?.max ?? 1) * STEPS + 1e-9);
	}

	const raw = new Array<number>(n);
	for (let i = 0; i < n; i++) raw[i] = alpha === 1 ? -Math.log(rng() || 1e-12) : gammaSample(alpha, rng) + 1e-300;

	if (!hasConstraints) {
		const total = raw.reduce((s, v) => s + v, 0);
		const share = raw.map((v) => v / total);
		const keep = share.map((s) => s >= MIN_UNCONSTRAINED_WEIGHT);
		if (keep.filter(Boolean).length === 0) {
			const order = share.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0]);
			keep[order[0]![1]] = true;
			if (n > 1) keep[order[1]![1]] = true;
		}
		for (let i = 0; i < n; i++) {
			if (!keep[i]) {
				minSteps[i] = 0;
				maxSteps[i] = 0;
			} else {
				minSteps[i] = Math.round(MIN_UNCONSTRAINED_WEIGHT * STEPS);
			}
		}
		const keptMin = minSteps.reduce((s, v) => s + v, 0);
		if (keptMin > STEPS) for (let i = 0; i < n; i++) minSteps[i] = 0;
	}

	// Allocate minimum steps, then distribute the remainder proportionally to raw shares (water-filling).
	const steps = minSteps.slice();
	let remaining = STEPS - steps.reduce((s, v) => s + v, 0);
	const free = (i: number) => maxSteps[i]! - steps[i]!;
	for (let guard = 0; remaining > 0 && guard < 64; guard++) {
		const open: number[] = [];
		let rawSum = 0;
		for (let i = 0; i < n; i++)
			if (free(i) > 0 && raw[i]! > 0) {
				open.push(i);
				rawSum += raw[i]!;
			}
		if (open.length === 0) break;
		let distributed = 0;
		const fractional: Array<[number, number]> = [];
		for (const i of open) {
			const ideal = (remaining * raw[i]!) / rawSum;
			const add = Math.min(free(i), Math.floor(ideal));
			steps[i]! += add;
			distributed += add;
			if (free(i) > 0) fractional.push([ideal - Math.floor(ideal), i]);
		}
		remaining -= distributed;
		fractional.sort((a, b) => b[0] - a[0]);
		for (const [, i] of fractional) {
			if (remaining <= 0) break;
			if (free(i) > 0) {
				steps[i]! += 1;
				remaining--;
			}
		}
	}
	// Any residual (only possible with degenerate limits) goes to the asset with most headroom.
	if (remaining > 0) {
		let best = 0;
		for (let i = 1; i < n; i++) if (free(i) > free(best)) best = i;
		steps[best]! += remaining;
	}
	return steps.map((s) => s / STEPS);
}

export interface SimulationInput {
	assets: ReadonlyArray<{ id: string; prices: readonly PricePoint[] }>;
	count: number;
	riskFreeRate: number;
	constraints?: ReadonlyArray<WeightConstraint | undefined>;
}

export interface Estimates {
	/** Annualized arithmetic mean of daily simple returns. */
	mu: number[];
	/** Annualized covariance of daily simple returns. */
	cov: number[][];
	window: { start: string; end: string; observations: number };
}

/**
 * Mean and covariance of daily simple returns on the assets' common history
 * (MC-3). Using one window for both keeps assets and portfolios comparable.
 */
export function estimateInputs(assets: SimulationInput['assets']): Estimates {
	const { dates, values } = alignSeries(assets.map((a) => a.prices));
	const n = assets.length;
	const returns = values.map((v) => {
		const r: number[] = [];
		for (let t = 1; t < v.length; t++) r.push(v[t - 1]! > 0 ? v[t]! / v[t - 1]! - 1 : 0);
		return r;
	});
	const len = returns[0]?.length ?? 0;
	const means = returns.map((r) => mean(r));
	const cov = Array.from({ length: n }, () => new Array<number>(n).fill(0));
	for (let i = 0; i < n; i++)
		for (let j = i; j < n; j++) {
			let sum = 0;
			for (let t = 0; t < len; t++) sum += (returns[i]![t]! - means[i]!) * (returns[j]![t]! - means[j]!);
			const c = len > 1 ? (sum / (len - 1)) * TRADING_DAYS : 0;
			cov[i]![j] = c;
			cov[j]![i] = c;
		}
	return {
		mu: means.map((m) => m * TRADING_DAYS),
		cov,
		window: { start: dates[0] ?? '', end: dates[dates.length - 1] ?? '', observations: len }
	};
}

/**
 * Portfolio statistics. The shown return is the expected compound (geometric)
 * return ≈ arithmetic mean − σ²/2, which matches an asset's historical growth
 * rate and includes the diversification benefit of mixing assets.
 */
export function portfolioStats(weights: ArrayLike<number>, est: Estimates, riskFreeRate: number) {
	const n = est.mu.length;
	let arith = 0;
	let variance = 0;
	for (let i = 0; i < n; i++) {
		const wi = weights[i]!;
		if (wi === 0) continue;
		arith += wi * est.mu[i]!;
		for (let j = 0; j < n; j++) variance += wi * weights[j]! * est.cov[i]![j]!;
	}
	variance = Math.max(0, variance);
	const volatility = Math.sqrt(variance);
	const annualizedReturn = arith - variance / 2;
	return {
		annualizedReturn,
		volatility,
		sharpeRatio: volatility > 0 ? (annualizedReturn - riskFreeRate) / volatility : 0,
		arithmeticReturn: arith
	};
}

/** Same statistics for a price series (e.g. the benchmark) restricted to a window. */
export function seriesStats(prices: readonly PricePoint[], window: { start: string; end: string }, riskFreeRate: number) {
	const p = ensureSorted(prices).filter((x) => x.date >= window.start && x.date <= window.end);
	const r: number[] = [];
	for (let t = 1; t < p.length; t++) if (p[t - 1]!.close > 0) r.push(p[t]!.close / p[t - 1]!.close - 1);
	if (r.length < 2) return null;
	const arith = mean(r) * TRADING_DAYS;
	const variance = stddev(r) ** 2 * TRADING_DAYS;
	const volatility = Math.sqrt(variance);
	const annualizedReturn = arith - variance / 2;
	return { annualizedReturn, volatility, sharpeRatio: volatility > 0 ? (annualizedReturn - riskFreeRate) / volatility : 0 };
}

/** Euclidean projection onto { w : Σw = 1, lo ≤ w ≤ hi } (bisection on the shift). */
export function projectCapped(v: readonly number[], lo: readonly number[], hi: readonly number[]): number[] {
	const n = v.length;
	const at = (tau: number) => v.map((x, i) => Math.min(hi[i]!, Math.max(lo[i]!, x - tau)));
	const total = (tau: number) => at(tau).reduce((s, x) => s + x, 0);
	let a = Math.min(...v.map((x, i) => x - hi[i]!)) - 1;
	let b = Math.max(...v.map((x, i) => x - lo[i]!)) + 1;
	for (let k = 0; k < 60; k++) {
		const m = (a + b) / 2;
		if (total(m) > 1) a = m;
		else b = m;
	}
	const w = at((a + b) / 2);
	const s = w.reduce((x, y) => x + y, 0);
	return n && s > 0 ? w.map((x) => x / s) : w;
}

function spectralNorm(m: number[][]): number {
	const n = m.length;
	let v = new Array<number>(n).fill(1 / Math.sqrt(n || 1));
	let lambda = 0;
	for (let k = 0; k < 60; k++) {
		const next = m.map((row) => row.reduce((s, x, j) => s + x * v[j]!, 0));
		const norm = Math.sqrt(next.reduce((s, x) => s + x * x, 0));
		if (norm === 0) return 0;
		lambda = norm;
		v = next.map((x) => x / norm);
	}
	return lambda;
}

/**
 * Maximize w·μ − (λ/2)·w'Σw over the constrained simplex with accelerated
 * projected gradient (FISTA). λ = ∞ gives the minimum-variance portfolio.
 */
export function solveMeanVariance(
	est: Estimates,
	lambda: number,
	lo: readonly number[],
	hi: readonly number[],
	iterations = 600
): number[] {
	const n = est.mu.length;
	const minVar = !Number.isFinite(lambda);
	const L = Math.max(1e-12, (minVar ? 1 : lambda) * spectralNorm(est.cov));
	const grad = (w: number[]) =>
		est.cov.map((row, i) => (minVar ? 0 : -est.mu[i]!) + (minVar ? 1 : lambda) * row.reduce((s, x, j) => s + x * w[j]!, 0));
	let w = projectCapped(new Array<number>(n).fill(1 / n), lo, hi);
	let y = w;
	let t = 1;
	for (let k = 0; k < iterations; k++) {
		const g = grad(y);
		const next = projectCapped(
			y.map((x, i) => x - g[i]! / L),
			lo,
			hi
		);
		const tn = (1 + Math.sqrt(1 + 4 * t * t)) / 2;
		let delta = 0;
		for (let i = 0; i < n; i++) delta = Math.max(delta, Math.abs(next[i]! - w[i]!));
		y = next.map((x, i) => x + ((t - 1) / tn) * (x - w[i]!));
		w = next;
		t = tn;
		if (delta < 1e-9 && k > 20) break;
	}
	return w;
}

/** Highest-return portfolio within the bounds (fill the best assets first). */
export function maxReturnWeights(est: Estimates, lo: readonly number[], hi: readonly number[]): number[] {
	const w = [...lo];
	let left = 1 - w.reduce((s, x) => s + x, 0);
	for (const i of est.mu
		.map((m, i) => [m, i] as const)
		.sort((a, b) => b[0] - a[0])
		.map(([, i]) => i)) {
		const add = Math.min(left, hi[i]! - w[i]!);
		w[i]! += add;
		left -= add;
	}
	return w;
}

/**
 * Exact efficient frontier (MC-5): solutions for a log-spaced range of risk
 * aversion plus the minimum-variance and maximum-return corners, sorted by
 * volatility and filtered to be efficient.
 */
export function efficientFrontier(
	est: Estimates,
	constraints: ReadonlyArray<WeightConstraint | undefined> | undefined,
	points = 24
): number[][] {
	const n = est.mu.length;
	const lo = Array.from({ length: n }, (_, i) => constraints?.[i]?.min ?? 0);
	const hi = Array.from({ length: n }, (_, i) => constraints?.[i]?.max ?? 1);
	const scale = spectralNorm(est.cov) || 1;
	type Point = { lambda: number; w: number[]; volatility: number; annualizedReturn: number };
	const solve = (lambda: number): Point => {
		const w = Number.isFinite(lambda) ? solveMeanVariance(est, lambda, lo, hi, 1000) : solveMeanVariance(est, Infinity, lo, hi, 1500);
		return { lambda, w, ...portfolioStats(w, est, 0) };
	};
	// λ = 1 maximizes the compound return (top end of the shown frontier); larger λ trade
	// return for lower risk, up to the minimum-variance corner.
	const lambdaMax = Math.max(10, 1e3 / scale);
	let pts: Point[] = [];
	for (let k = 0; k < points; k++) pts.push(solve(Math.pow(lambdaMax, k / (points - 1))));
	const minVar = solve(Infinity);
	// Adaptive refinement: bisect λ where neighbouring points are far apart.
	const span = () =>
		Math.max(
			1e-9,
			pts[0]!.volatility - minVar.volatility,
			Math.hypot(pts[0]!.volatility - minVar.volatility, pts[0]!.annualizedReturn - minVar.annualizedReturn)
		);
	for (let round = 0; round < 6 && pts.length < 80; round++) {
		const target = span() / 30;
		const next: Point[] = [pts[0]!];
		let added = 0;
		for (let k = 1; k < pts.length; k++) {
			const a = pts[k - 1]!;
			const b = pts[k]!;
			if (Math.hypot(a.volatility - b.volatility, a.annualizedReturn - b.annualizedReturn) > target && pts.length + added < 80) {
				next.push(solve(Math.sqrt(a.lambda * b.lambda)));
				added++;
			}
			next.push(b);
		}
		pts = next;
		if (!added) break;
	}
	const sorted = [...pts, minVar].sort((a, b) => a.volatility - b.volatility);
	const out: Point[] = [];
	let best = -Infinity;
	for (const p of sorted) {
		// Efficient with respect to the shown (compound) return: drop points with more risk and less return.
		if (p.annualizedReturn > best + 1e-10) {
			if (!out.some((o) => Math.abs(o.volatility - p.volatility) < 1e-7)) out.push(p);
			best = p.annualizedReturn;
		}
	}
	return out.map((p) => p.w);
}

export function runSimulation(
	input: SimulationInput,
	rng: Rng = Math.random,
	onProgress?: (done: number, total: number) => void,
	progressEvery = 500
): MonteCarloResult {
	const n = input.assets.length;
	const ids = input.assets.map((a) => a.id);
	const est = estimateInputs(input.assets);
	const frontierWeights = efficientFrontier(est, input.constraints);
	const total = Math.max(0, Math.floor(input.count));
	const capacity = total + frontierWeights.length;
	const volatilities = new Float64Array(capacity);
	const returns = new Float64Array(capacity);
	const sharpes = new Float64Array(capacity);
	const weights = new Float32Array(capacity * n);
	const seen = new Set<string>();
	let count = 0;
	const push = (w: ArrayLike<number>) => {
		const s = portfolioStats(w, est, input.riskFreeRate);
		volatilities[count] = s.volatility;
		returns[count] = s.annualizedReturn;
		sharpes[count] = s.sharpeRatio;
		weights.set(w, count * n);
		count++;
	};
	for (let sim = 0; sim < total; sim++) {
		// Vary the concentration so both diversified and concentrated portfolios appear.
		const alpha = Math.exp(Math.log(0.15) + rng() * (Math.log(1.5) - Math.log(0.15)));
		const w = generateWeights(n, rng, input.constraints, alpha);
		const key = w.map((x) => Math.round(x * 1000)).join(',');
		if (!seen.has(key)) {
			seen.add(key);
			push(w);
		}
		if (onProgress && ((sim + 1) % progressEvery === 0 || sim === total - 1)) onProgress(sim + 1, total);
	}
	const frontier: number[] = [];
	for (const w of frontierWeights) {
		frontier.push(count);
		push(w);
	}
	return {
		assetIds: ids,
		volatilities: volatilities.slice(0, count),
		returns: returns.slice(0, count),
		sharpes: sharpes.slice(0, count),
		weights: weights.slice(0, count * n),
		count,
		frontier,
		window: est.window,
		assetStats: ids.map((id, i) => {
			const unit = ids.map((_, j) => (j === i ? 1 : 0));
			const s = portfolioStats(unit, est, input.riskFreeRate);
			return { id, annualizedReturn: s.annualizedReturn, volatility: s.volatility };
		})
	};
}

export function weightsAt(result: MonteCarloResult, index: number): Record<string, number> {
	const n = result.assetIds.length;
	const out: Record<string, number> = {};
	for (let i = 0; i < n; i++) out[result.assetIds[i]!] = result.weights[index * n + i]!;
	return out;
}

/** Portfolios that dominate a reference point (higher return at ≤ vol, or lower vol at ≥ return). */
export function dominatingIndices(result: MonteCarloResult, ref: { volatility: number; annualizedReturn: number }): number[] {
	const out: number[] = [];
	for (let i = 0; i < result.count; i++) {
		const v = result.volatilities[i]!;
		const r = result.returns[i]!;
		if ((v <= ref.volatility && r > ref.annualizedReturn) || (v < ref.volatility && r >= ref.annualizedReturn)) out.push(i);
	}
	return out;
}

export function bestIndex(result: MonteCarloResult, by: 'sharpe' | 'minVol' | 'maxReturn'): number {
	let best = -1;
	for (let i = 0; i < result.count; i++) {
		if (best < 0) best = i;
		else if (by === 'sharpe' && result.sharpes[i]! > result.sharpes[best]!) best = i;
		else if (by === 'minVol' && result.volatilities[i]! < result.volatilities[best]!) best = i;
		else if (by === 'maxReturn' && result.returns[i]! > result.returns[best]!) best = i;
	}
	return best;
}
