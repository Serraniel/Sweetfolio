/**
 * Tick positions for a log axis (CH-7). `returns` mode works on growth factors
 * (1 + r) and places ticks at round returns (… −20 %, 0 %, 50 %, 100 %, 200 % …);
 * otherwise at round values (… 50, 100, 200, 500 …). Below a factor of 2 the
 * axis is nearly linear, so plain linear ticks are used.
 */
const TIERS = [[1], [1, 3], [1, 2, 5], [1, 1.5, 2, 3, 5, 7], [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9]];

function roundValues(lo: number, hi: number, mantissas: readonly number[]): number[] {
	const out: number[] = [];
	if (!(hi >= lo) || hi <= 0) return out;
	const from = Math.floor(Math.log10(Math.max(lo, 1e-9)));
	for (let e = from; e <= Math.ceil(Math.log10(hi)); e++)
		for (const m of mantissas) {
			const v = +(m * 10 ** e).toPrecision(12);
			if (v >= lo && v <= hi) out.push(v);
		}
	return out;
}

export function linearTicks(lo: number, hi: number, count: number): number[] {
	const raw = (hi - lo) / Math.max(1, count);
	const mag = 10 ** Math.floor(Math.log10(raw));
	const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
	const out: number[] = [];
	for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
	return out;
}

export function logTicks(min: number, max: number, count: number, returns: boolean): number[] {
	if (!(min > 0) || !(max > min)) return [];
	if (max / min < 2) return returns ? linearTicks(min - 1, max - 1, count).map((r) => 1 + r) : linearTicks(min, max, count);
	// Returns this close to 0 % would crowd the 0 % tick.
	const nearZero = Math.exp((Math.log(max / min) / Math.max(1, count)) * 0.6) - 1;
	const build = (ms: readonly number[]) =>
		returns
			? [
					...roundValues(nearZero, Math.min(0.99, 1 - min), ms).map((r) => 1 - r),
					...(min <= 1 && max >= 1 ? [1] : []),
					...roundValues(nearZero, max - 1, ms).map((r) => 1 + r)
				]
					.filter((f) => f >= min && f <= max)
					.sort((a, b) => a - b)
			: roundValues(min, max, ms);
	let best = build(TIERS[0]!);
	for (const ms of TIERS.slice(1)) {
		const t = build(ms);
		if (t.length > count) break;
		best = t;
	}
	return spaced(best, (Math.log(max / min) / Math.max(1, count)) * 0.5, returns && best.includes(1) ? 1 : best[0]);
}

/** Drop ticks closer than `gap` (log space) to their neighbour, working outwards from `anchor`. */
function spaced(ticks: readonly number[], gap: number, anchor: number | undefined): number[] {
	if (anchor === undefined) return [];
	const up = [anchor];
	for (const v of ticks) if (v > anchor && Math.log(v / up.at(-1)!) >= gap) up.push(v);
	const down: number[] = [];
	let last = anchor;
	for (const v of [...ticks].reverse())
		if (v < anchor && Math.log(last / v) >= gap) {
			down.unshift(v);
			last = v;
		}
	return [...down, ...up];
}
