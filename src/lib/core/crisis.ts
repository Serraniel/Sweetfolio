/**
 * Crisis tester (CR-2, CR-4): historical crisis catalogue and the evaluation
 * of weighted portfolios over each crisis window, compared with a benchmark.
 */
import type { ISODate, PricePoint, RebalanceFrequency } from '#lib/domain/types.ts';
import { addDays, daysBetween, fromDayNumber, isWeekend, toDayNumber } from './dates.ts';

export const CRISIS_TYPES = ['deflationary', 'stagflation', 'rateShock', 'bubble', 'liquidity', 'geopolitical', 'sovereign'] as const;
export type CrisisType = (typeof CRISIS_TYPES)[number];

export const CRISIS_TYPE_LABELS: Record<CrisisType, string> = {
	deflationary: 'Deflationary bust / banking crisis',
	stagflation: 'Stagflation / supply shock',
	rateShock: 'Inflation / rate shock',
	bubble: 'Bubble burst',
	liquidity: 'Liquidity crash',
	geopolitical: 'Geopolitical shock',
	sovereign: 'Currency / sovereign debt crisis'
};

export const CRISIS_TYPE_SHORT: Record<CrisisType, string> = {
	deflationary: 'Banking / deflation',
	stagflation: 'Stagflation',
	rateShock: 'Rate shock',
	bubble: 'Bubble burst',
	liquidity: 'Liquidity crash',
	geopolitical: 'Geopolitical',
	sovereign: 'Currency / debt'
};

export interface Crisis {
	id: string;
	name: string;
	type: CrisisType;
	/** Market peak (US equities) before the crisis. */
	start: ISODate;
	/** Market trough. */
	end: ISODate;
	description: string;
	/** Scenarios only: historical crises the assumptions are modelled on. */
	examples?: string;
	/** An assumed crisis type (CR-8) rather than a historical crisis. */
	scenario?: boolean;
}

/** Windows are peak → trough of the S&P 500 (for 1993–94: of long treasuries). */
export const CRISES: readonly Crisis[] = [
	{
		id: 'great-depression',
		name: 'Great Depression',
		type: 'deflationary',
		start: '1929-09-16',
		end: '1932-06-01',
		description: 'Crash and banking panics; prices fell for years. Treasuries held up, gold had a fixed price.'
	},
	{
		id: 'kennedy-slide',
		name: 'Kennedy slide',
		type: 'geopolitical',
		start: '1961-12-12',
		end: '1962-06-26',
		description: 'Sharp sell-off ahead of the Cuban missile crisis; long treasuries rose steadily.'
	},
	{
		id: 'oil-crisis',
		name: 'Oil crisis',
		type: 'stagflation',
		start: '1973-01-11',
		end: '1974-10-03',
		description: 'Oil embargo and double-digit inflation; equities and bonds fell, gold was the hedge.'
	},
	{
		id: 'volcker',
		name: 'Second oil crisis / Volcker',
		type: 'stagflation',
		start: '1980-11-28',
		end: '1982-08-12',
		description: 'Inflation fought with record rates; bonds fell hard as rates rose, then rallied.'
	},
	{
		id: 'black-monday',
		name: 'Black Monday',
		type: 'liquidity',
		start: '1987-08-25',
		end: '1987-12-04',
		description: 'Fastest crash in history (−20 % in one day) and a quick recovery.'
	},
	{
		id: 'gulf-war',
		name: 'Gulf War',
		type: 'geopolitical',
		start: '1990-07-16',
		end: '1990-10-11',
		description: 'Invasion of Kuwait and an oil price spike; gold and treasuries rose.'
	},
	{
		id: 'bond-massacre',
		name: 'Bond massacre',
		type: 'rateShock',
		start: '1993-10-15',
		end: '1994-11-07',
		description: 'Surprise Fed hikes; long bonds lost heavily while equities only dipped.'
	},
	{
		id: 'asia-ltcm',
		name: 'Asian crisis / LTCM',
		type: 'sovereign',
		start: '1998-07-17',
		end: '1998-10-08',
		description: 'Currency crises in Asia, Russian default and the LTCM collapse; flight to treasuries.'
	},
	{
		id: 'dotcom',
		name: 'Dot-com bust',
		type: 'bubble',
		start: '2000-03-24',
		end: '2002-10-09',
		description: 'Tech valuations collapsed (Nasdaq-100 about −80 %); bonds and gold rose.'
	},
	{
		id: 'gfc',
		name: 'Global financial crisis',
		type: 'deflationary',
		start: '2007-10-09',
		end: '2009-03-09',
		description: 'Banking crisis; long treasuries rallied, gold dipped in 2008 and then rose.'
	},
	{
		id: 'euro-debt',
		name: 'Euro debt crisis',
		type: 'sovereign',
		start: '2011-04-29',
		end: '2011-10-03',
		description: 'Sovereign debt fears in the euro area; European equities fell more than US ones.'
	},
	{
		id: 'covid',
		name: 'Covid crash',
		type: 'liquidity',
		start: '2020-02-19',
		end: '2020-03-23',
		description: 'Pandemic panic with a record-fast recovery; treasuries spiked, gold dipped briefly.'
	},
	{
		id: 'rate-shock-2022',
		name: 'Inflation & rate shock 2022',
		type: 'rateShock',
		start: '2022-01-03',
		end: '2022-10-12',
		description: 'Fast rate hikes; stocks and bonds fell together, long treasuries lost about 40 %.'
	}
];

export const CRISIS_BY_ID = new Map(CRISES.map((c) => [c.id, c]));

/** A series covers a crisis when it starts at most this many days after the crisis start. */
export const START_TOLERANCE_DAYS = 7;
/** How long after the crisis start a recovery is searched for. */
export const RECOVERY_HORIZON_YEARS = 25;

export interface CrisisOutcome {
	/** Max drawdown inside the crisis window (≤ 0). */
	drawdown: number;
	peakDate: ISODate;
	troughDate: ISODate;
	/** First date back at the peak value, or null when not recovered by the end of the data. */
	recoveryDate: ISODate | null;
	/** Calendar days from the peak to the recovery, or null. */
	recoveryDays: number | null;
	/** Days spent below the peak: until the recovery, or until the end of the data. */
	openDays: number;
	/** Return from the crisis start to its end. */
	crisisReturn: number;
	/** Last date with data (recovery was searched up to here). */
	dataEnd: ISODate;
}

/**
 * Asset values over one crisis on a common business-day grid, from the crisis
 * start to the end of the recovery horizon (or the data). Row-major `T × N`.
 */
export interface CrisisMatrix {
	crisisId: string;
	dates: ISODate[];
	values: Float64Array;
	assets: number;
	/** Index of the last date inside the crisis window. */
	endIndex: number;
}

/** Common business-day grid of several series over [start, horizon], forward-filled; null when one does not cover the window. */
export function buildCrisisMatrix(
	series: ReadonlyArray<readonly PricePoint[]>,
	crisis: Crisis,
	horizonYears = RECOVERY_HORIZON_YEARS
): CrisisMatrix | null {
	if (series.length === 0) return null;
	const latestStart = addDays(crisis.start, START_TOLERANCE_DAYS);
	let lastDate = addDays(crisis.start, Math.round(horizonYears * 365.25));
	for (const s of series) {
		if (s.length === 0 || s[0]!.date > latestStart || s[s.length - 1]!.date < crisis.end) return null;
		if (s[s.length - 1]!.date < lastDate) lastDate = s[s.length - 1]!.date;
	}
	const dates: ISODate[] = [];
	for (let d = toDayNumber(crisis.start), end = toDayNumber(lastDate); d <= end; d++) if (!isWeekend(d)) dates.push(fromDayNumber(d));
	const n = series.length;
	const values = new Float64Array(dates.length * n);
	for (let i = 0; i < n; i++) {
		const s = series[i]!;
		let idx = 0;
		let last = s[0]!.close;
		for (let t = 0; t < dates.length; t++) {
			while (idx < s.length && s[idx]!.date <= dates[t]!) last = s[idx++]!.close;
			values[t * n + i] = last;
		}
	}
	let endIndex = 0;
	while (endIndex + 1 < dates.length && dates[endIndex + 1]! <= crisis.end) endIndex++;
	return { crisisId: crisis.id, dates, values, assets: n, endIndex };
}

function periodOf(date: ISODate, frequency: RebalanceFrequency): string {
	const m = Number(date.slice(5, 7));
	switch (frequency) {
		case 'monthly':
			return date.slice(0, 7);
		case 'quarterly':
			return `${date.slice(0, 4)}-${Math.floor((m - 1) / 3)}`;
		case 'annually':
			return date.slice(0, 4);
		default:
			return '';
	}
}

/** 1 on the first business day of each new rebalancing period. */
export function rebalanceFlags(dates: readonly ISODate[], frequency: RebalanceFrequency): Uint8Array {
	const flags = new Uint8Array(dates.length);
	if (frequency === 'none') return flags;
	let current = periodOf(dates[0] ?? '', frequency);
	for (let t = 1; t < dates.length; t++) {
		const p = periodOf(dates[t]!, frequency);
		if (p !== current) {
			flags[t] = 1;
			current = p;
		}
	}
	return flags;
}

/**
 * Evaluates one weight vector (read from `weights` at `offset`, normalized
 * here) over a crisis matrix in a single pass that stops at the recovery.
 */
export function evaluateCrisis(
	m: CrisisMatrix,
	flags: Uint8Array,
	weights: ArrayLike<number>,
	offset = 0,
	units = new Float64Array(m.assets)
): CrisisOutcome {
	const n = m.assets;
	const v = m.values;
	let total = 0;
	for (let i = 0; i < n; i++) total += Math.max(0, weights[offset + i]!);
	const allocate = (t: number, value: number) => {
		for (let i = 0; i < n; i++) {
			const w = total > 0 ? Math.max(0, weights[offset + i]!) / total : 1 / n;
			const price = v[t * n + i]!;
			units[i] = price > 0 ? (value * w) / price : 0;
		}
	};
	allocate(0, 1);
	let peak = 1;
	let peakT = 0;
	let drawdown = 0;
	let ddPeak = 1;
	let ddPeakT = 0;
	let troughT = 0;
	let endValue = 1;
	let recoveryT = -1;
	for (let t = 1; t < m.dates.length; t++) {
		if (t > m.endIndex && (drawdown === 0 || recoveryT >= 0)) break;
		let value = 0;
		for (let i = 0; i < n; i++) value += units[i]! * v[t * n + i]!;
		if (flags[t]) allocate(t, value);
		if (t <= m.endIndex) {
			if (t === m.endIndex) endValue = value;
			if (value > peak) {
				peak = value;
				peakT = t;
			}
			const dd = value / peak - 1;
			if (dd < drawdown) {
				drawdown = dd;
				ddPeak = peak;
				ddPeakT = peakT;
				troughT = t;
				recoveryT = -1;
			} else if (recoveryT < 0 && drawdown < 0 && t > troughT && value >= ddPeak) recoveryT = t;
		} else if (value >= ddPeak) recoveryT = t;
	}
	const peakDate = m.dates[ddPeakT]!;
	const recoveryDate = drawdown === 0 ? peakDate : recoveryT >= 0 ? m.dates[recoveryT]! : null;
	return {
		drawdown,
		peakDate,
		troughDate: m.dates[troughT]!,
		recoveryDate,
		recoveryDays: recoveryDate ? daysBetween(peakDate, recoveryDate) : null,
		openDays: daysBetween(peakDate, recoveryDate ?? m.dates[m.dates.length - 1]!),
		crisisReturn: endValue - 1,
		dataEnd: m.dates[m.dates.length - 1]!
	};
}

/** Values of the portfolio over the matrix, starting at 1 (charts). */
export function crisisPath(
	m: CrisisMatrix,
	flags: Uint8Array,
	weights: ArrayLike<number>,
	offset = 0,
	upTo = m.dates.length - 1
): Float64Array {
	const n = m.assets;
	const v = m.values;
	const units = new Float64Array(n);
	let total = 0;
	for (let i = 0; i < n; i++) total += Math.max(0, weights[offset + i]!);
	const allocate = (t: number, value: number) => {
		for (let i = 0; i < n; i++) {
			const w = total > 0 ? Math.max(0, weights[offset + i]!) / total : 1 / n;
			const price = v[t * n + i]!;
			units[i] = price > 0 ? (value * w) / price : 0;
		}
	};
	allocate(0, 1);
	const out = new Float64Array(upTo + 1);
	out[0] = 1;
	for (let t = 1; t <= upTo; t++) {
		let value = 0;
		for (let i = 0; i < n; i++) value += units[i]! * v[t * n + i]!;
		if (flags[t]) allocate(t, value);
		out[t] = value;
	}
	return out;
}

/** Values per outcome in `evaluateCrisisBatch`: drawdown, recovery days (NaN = not recovered), crisis return, open days. */
export const OUTCOME_STRIDE = 4;

/**
 * Evaluates many weight vectors (row-major `count × assets`) over several
 * crisis matrices that share the asset order (simulation, CR-7).
 */
export function evaluateCrisisBatch(
	matrices: ReadonlyArray<CrisisMatrix & { flags: Uint8Array }>,
	weights: ArrayLike<number>,
	count: number,
	onProgress?: (done: number, total: number) => void
): Float64Array {
	const c = matrices.length;
	const out = new Float64Array(count * c * OUTCOME_STRIDE);
	if (c === 0) return out;
	const n = matrices[0]!.assets;
	const units = new Float64Array(n);
	const step = Math.max(1, Math.floor(count / 100));
	for (let k = 0; k < count; k++) {
		for (let j = 0; j < c; j++) {
			const m = matrices[j]!;
			const o = evaluateCrisis(m, m.flags, weights, k * n, units);
			const at = (k * c + j) * OUTCOME_STRIDE;
			out[at] = o.drawdown;
			out[at + 1] = o.recoveryDays ?? NaN;
			out[at + 2] = o.crisisReturn;
			out[at + 3] = o.openDays;
		}
		if (onProgress && (k % step === 0 || k === count - 1)) onProgress(k + 1, count);
	}
	return out;
}

export interface CrisisTolerance {
	/** Drawdown may be this much deeper than the benchmark's (fraction, e.g. 0.05). */
	drawdown: number;
	/** Recovery may take this many days longer than the benchmark's. */
	recoveryDays: number;
}

export const DEFAULT_TOLERANCE: CrisisTolerance = { drawdown: 0.05, recoveryDays: 182 };

export type Verdict = 'better' | 'similar' | 'worse';

/** How a portfolio did in one crisis compared with the benchmark. */
export function compareOutcome(
	p: Pick<CrisisOutcome, 'drawdown' | 'recoveryDays'>,
	b: Pick<CrisisOutcome, 'drawdown' | 'recoveryDays'>,
	tol: CrisisTolerance = DEFAULT_TOLERANCE
): Verdict {
	const ddWorse = p.drawdown < b.drawdown - tol.drawdown;
	const ddBetter = p.drawdown > b.drawdown + tol.drawdown;
	let recWorse = false;
	let recBetter = false;
	if (p.recoveryDays === null && b.recoveryDays !== null) recWorse = true;
	else if (p.recoveryDays !== null && b.recoveryDays === null) recBetter = true;
	else if (p.recoveryDays !== null && b.recoveryDays !== null) {
		recWorse = p.recoveryDays > b.recoveryDays + tol.recoveryDays;
		recBetter = p.recoveryDays < b.recoveryDays - tol.recoveryDays;
	}
	if (ddWorse || recWorse) return 'worse';
	if (ddBetter || recBetter) return 'better';
	return 'similar';
}

export type CrisisScoreKind = 'worstDrawdown' | 'meanDrawdown' | 'longestRecovery';

export const SCORE_LABELS: Record<CrisisScoreKind, string> = {
	worstDrawdown: 'Worst drawdown',
	meanDrawdown: 'Average drawdown',
	longestRecovery: 'Longest recovery'
};

/**
 * Crisis score where higher is better: the worst or average drawdown (≤ 0),
 * or minus the longest recovery in years (unrecovered counts as the time
 * until the end of the data).
 */
export function crisisScore(outcomes: ReadonlyArray<Pick<CrisisOutcome, 'drawdown' | 'openDays'>>, kind: CrisisScoreKind): number {
	if (outcomes.length === 0) return NaN;
	switch (kind) {
		case 'worstDrawdown':
			return Math.min(...outcomes.map((o) => o.drawdown));
		case 'meanDrawdown':
			return outcomes.reduce((s, o) => s + o.drawdown, 0) / outcomes.length;
		case 'longestRecovery':
			return -Math.max(...outcomes.map((o) => o.openDays / 365.25));
	}
}

/** Indices of points not dominated in (return ↑, volatility ↓, score ↑). */
export function nonDominated3(
	returns: ArrayLike<number>,
	vols: ArrayLike<number>,
	scores: ArrayLike<number>,
	indices: readonly number[]
): number[] {
	const sorted = [...indices]
		.filter((i) => Number.isFinite(scores[i]!))
		.sort((a, b) => vols[a]! - vols[b]! || returns[b]! - returns[a]! || scores[b]! - scores[a]!);
	const kept: number[] = [];
	for (const i of sorted) {
		let dominated = false;
		for (const j of kept) {
			if (returns[j]! >= returns[i]! && scores[j]! >= scores[i]! && vols[j]! <= vols[i]!) {
				dominated = true;
				break;
			}
		}
		if (!dominated) kept.push(i);
	}
	return kept;
}
