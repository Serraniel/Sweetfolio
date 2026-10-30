/** Small, dependency-free statistics helpers. */

export function sum(values: ArrayLike<number>): number {
	let s = 0;
	for (let i = 0; i < values.length; i++) s += values[i]!;
	return s;
}

export function mean(values: ArrayLike<number>): number {
	return values.length === 0 ? 0 : sum(values) / values.length;
}

/** Sample variance (N−1) by default. */
export function variance(values: ArrayLike<number>, population = false): number {
	const n = values.length;
	if (n < 2) return 0;
	const m = mean(values);
	let s = 0;
	for (let i = 0; i < n; i++) {
		const d = values[i]! - m;
		s += d * d;
	}
	return s / (population ? n : n - 1);
}

export function stddev(values: ArrayLike<number>, population = false): number {
	return Math.sqrt(variance(values, population));
}

/** Sample covariance (N−1) over the common length of both arrays. */
export function covariance(x: ArrayLike<number>, y: ArrayLike<number>, population = false): number {
	const n = Math.min(x.length, y.length);
	if (n < 2) return 0;
	let mx = 0;
	let my = 0;
	for (let i = 0; i < n; i++) {
		mx += x[i]!;
		my += y[i]!;
	}
	mx /= n;
	my /= n;
	let s = 0;
	for (let i = 0; i < n; i++) s += (x[i]! - mx) * (y[i]! - my);
	return s / (population ? n : n - 1);
}

export function pearsonCorrelation(x: ArrayLike<number>, y: ArrayLike<number>): number {
	const n = Math.min(x.length, y.length);
	if (n < 2) return 0;
	const xs = Array.prototype.slice.call(x, 0, n) as number[];
	const ys = Array.prototype.slice.call(y, 0, n) as number[];
	const sx = stddev(xs);
	const sy = stddev(ys);
	if (sx === 0 || sy === 0) return 0;
	const r = covariance(xs, ys) / (sx * sy);
	return Math.max(-1, Math.min(1, r));
}

/** ln(P[i] / P[i−1]) for strictly positive consecutive values; other pairs are skipped. */
export function logReturns(values: ArrayLike<number>): number[] {
	const out: number[] = [];
	for (let i = 1; i < values.length; i++) {
		const a = values[i - 1]!;
		const b = values[i]!;
		if (a > 0 && b > 0) out.push(Math.log(b / a));
	}
	return out;
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/** Round to a number of decimals without floating noise (e.g. weights). */
export function roundTo(value: number, decimals: number): number {
	const f = 10 ** decimals;
	return Math.round(value * f) / f;
}
