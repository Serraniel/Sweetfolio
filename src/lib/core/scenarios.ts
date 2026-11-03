/**
 * Crisis-type scenarios (CR-8): every asset kind gets an assumed behaviour per
 * crisis type, so any portfolio can be tested in every type, whatever its
 * price history. A scenario is a stylised weekly path per asset:
 *   1. decline phase: geometric move from 1 to 1 + change over `toTrough` months,
 *   2. recovery phase: assets that fell climb back to their pre-crisis level
 *      over `toRecover` months, assets that gained hold their level,
 *   3. afterwards: the kind's normal return.
 * Leverage applies daily-reset leverage to the path with financing costs and
 * volatility drag. The portfolio is evaluated like a historical crisis.
 */
import type { Exposure, ISODate } from '#lib/domain/types.ts';
import { CRISIS_TYPES, type Crisis, type CrisisMatrix, type CrisisType } from './crisis.ts';
import { addDays } from './dates.ts';

export const SCENARIO_KINDS = [
	'equity',
	'tech',
	'emerging',
	'govLong',
	'govMid',
	'govShort',
	'corpBond',
	'gold',
	'commodity',
	'crypto',
	'mixed',
	'cash'
] as const;
export type ScenarioKind = (typeof SCENARIO_KINDS)[number];

export const KIND_LABELS: Record<ScenarioKind, string> = {
	equity: 'Equities',
	tech: 'Tech equities',
	emerging: 'Emerging markets',
	govLong: 'Gov. bonds, long',
	govMid: 'Gov. bonds, intermediate',
	govShort: 'Gov. bonds, short',
	corpBond: 'Corporate bonds',
	gold: 'Gold',
	commodity: 'Commodities',
	crypto: 'Crypto',
	mixed: 'Mixed / multi-asset',
	cash: 'Cash / money market'
};

export interface ScenarioAssumptions {
	/** Change from the peak to the trough per crisis type and asset kind (fraction, e.g. −0.45). */
	change: Record<CrisisType, Record<ScenarioKind, number>>;
	/** Months from the peak to the trough per crisis type. */
	toTrough: Record<CrisisType, number>;
	/** Months from the trough until fallen assets are back at their pre-crisis level. */
	toRecover: Record<CrisisType, number>;
}

const row = (values: number[]): Record<ScenarioKind, number> =>
	Object.fromEntries(SCENARIO_KINDS.map((k, i) => [k, values[i]! / 100])) as Record<ScenarioKind, number>;

/**
 * Defaults from the historical episodes of each type (see the crisis
 * catalogue): rounded, typical peak-to-trough moves in the investor's currency.
 * Columns: equity, tech, emerging, govLong, govMid, govShort, corpBond, gold, commodity, crypto, mixed, cash.
 */
export const DEFAULT_ASSUMPTIONS: ScenarioAssumptions = {
	change: {
		deflationary: row([-50, -50, -60, 20, 10, 4, -10, 5, -50, -70, -25, 1]),
		stagflation: row([-45, -50, -45, -15, -8, -2, -15, 60, 40, -60, -30, 5]),
		rateShock: row([-25, -35, -30, -35, -15, -4, -18, -10, 20, -65, -28, 2]),
		bubble: row([-45, -80, -45, 20, 12, 5, 0, 15, -20, -75, -15, 3]),
		liquidity: row([-33, -30, -35, 10, 5, 1, -12, -5, -40, -50, -18, 0]),
		geopolitical: row([-20, -22, -25, 8, 4, 1, -5, 10, 25, -30, -8, 0]),
		sovereign: row([-20, -20, -35, 8, 4, 1, -8, 10, -15, -30, -8, 0])
	},
	toTrough: { deflationary: 18, stagflation: 21, rateShock: 10, bubble: 30, liquidity: 2, geopolitical: 4, sovereign: 6 },
	toRecover: { deflationary: 48, stagflation: 60, rateShock: 18, bubble: 54, liquidity: 5, geopolitical: 6, sovereign: 10 }
};

/** Long-run return p.a. per kind after the crisis (fixed, documented). */
export const NORMAL_RETURN: Record<ScenarioKind, number> = {
	equity: 0.06,
	tech: 0.08,
	emerging: 0.06,
	govLong: 0.035,
	govMid: 0.03,
	govShort: 0.025,
	corpBond: 0.04,
	gold: 0.03,
	commodity: 0.02,
	crypto: 0.1,
	mixed: 0.045,
	cash: 0.02
};

/** Annualised volatility in a crisis per kind, for the drag of daily leverage (fixed, documented). */
export const CRISIS_VOLATILITY: Record<ScenarioKind, number> = {
	equity: 0.35,
	tech: 0.45,
	emerging: 0.35,
	govLong: 0.18,
	govMid: 0.08,
	govShort: 0.02,
	corpBond: 0.1,
	gold: 0.22,
	commodity: 0.3,
	crypto: 0.8,
	mixed: 0.18,
	cash: 0
};

/** Financing rate assumed for leveraged products in scenarios. */
export const SCENARIO_FINANCING = 0.03;

export const SCENARIO_EXAMPLES: Record<CrisisType, string> = {
	deflationary: '1929–32, 2007–09',
	stagflation: '1973–74, 1980–82',
	rateShock: '1994, 2022',
	bubble: '2000–02',
	liquidity: '1987, 2020',
	geopolitical: '1962, 1990',
	sovereign: '1998, 2011'
};

const SCENARIO_NAMES: Record<CrisisType, string> = {
	deflationary: 'Banking crisis / deflation',
	stagflation: 'Stagflation',
	rateShock: 'Inflation / rate shock',
	bubble: 'Bubble burst',
	liquidity: 'Liquidity crash',
	geopolitical: 'Geopolitical shock',
	sovereign: 'Currency / sovereign debt crisis'
};

/** Scenario kind of an exposure; null when nothing can be assumed (unknown). */
export function scenarioKind(e: Exposure): ScenarioKind | null {
	switch (e.assetClass) {
		case 'equity':
			return e.style === 'tech' ? 'tech' : e.region === 'emerging' ? 'emerging' : 'equity';
		case 'govBond':
			return e.maturity === 'long' ? 'govLong' : e.maturity === 'short' ? 'govShort' : 'govMid';
		case 'corpBond':
			return 'corpBond';
		case 'gold':
		case 'commodity':
		case 'crypto':
		case 'mixed':
		case 'cash':
			return e.assetClass;
		default:
			return null;
	}
}

/** A scenario as a crisis record (dates start today, so charts read "if it started now"). */
export function scenarioCrisis(type: CrisisType, a: ScenarioAssumptions, today: ISODate): Crisis {
	return {
		id: `scenario:${type}`,
		name: SCENARIO_NAMES[type],
		type,
		start: today,
		// The window ends on the weekly step that reaches the trough.
		end: addDays(today, troughSteps(type, a) * STEP_DAYS),
		description: `Assumed behaviour of each asset kind, modelled on ${SCENARIO_EXAMPLES[type]}.`,
		examples: SCENARIO_EXAMPLES[type],
		scenario: true
	};
}

export const SCENARIO_HORIZON_YEARS = 30;
const STEP_DAYS = 7;

function troughSteps(type: CrisisType, a: ScenarioAssumptions): number {
	return Math.max(1, Math.round((a.toTrough[type] * 30.44) / STEP_DAYS));
}

/** Weekly value path of one asset kind through a scenario (start = 1), with leverage. */
export function scenarioPath(type: CrisisType, kind: ScenarioKind, leverage: number, a: ScenarioAssumptions, steps: number): Float64Array {
	const dt = STEP_DAYS / 365.25;
	const down = troughSteps(type, a);
	const up = Math.max(1, Math.round((a.toRecover[type] * 30.44) / STEP_DAYS));
	const change = Math.max(-0.99, a.change[type][kind]);
	const trough = 1 + change;
	const fell = change < 0;
	const normal = Math.log(1 + NORMAL_RETURN[kind]) * dt;
	const out = new Float64Array(steps);
	out[0] = 1;
	let level = 1;
	let value = 1;
	const sigma2 = CRISIS_VOLATILITY[kind] ** 2;
	for (let t = 1; t < steps; t++) {
		let logStep: number;
		if (t <= down) logStep = Math.log(trough) / down;
		else if (fell && t <= down + up) logStep = -Math.log(trough) / up;
		else if (!fell && t <= down + up) logStep = 0;
		else logStep = normal;
		const r = Math.exp(logStep) - 1;
		level *= 1 + r;
		if (leverage === 1) value = level;
		else {
			const inCrisis = t <= down + up;
			const drag = inCrisis ? ((leverage * leverage - leverage) / 2) * sigma2 * dt : 0;
			const financing = (leverage - 1) * SCENARIO_FINANCING * dt;
			value = Math.max(1e-9, value * Math.exp(Math.log(Math.max(1e-9, 1 + leverage * r)) - drag - financing));
		}
		out[t] = value;
	}
	return out;
}

/**
 * Scenario matrix for assets described by kind and leverage, in the same
 * shape as a historical crisis matrix (weekly dates from `today`).
 */
export function buildScenarioMatrix(
	crisis: Crisis,
	assets: ReadonlyArray<{ kind: ScenarioKind; leverage: number }>,
	a: ScenarioAssumptions,
	years = SCENARIO_HORIZON_YEARS
): CrisisMatrix {
	const steps = Math.round((years * 365.25) / STEP_DAYS) + 1;
	const dates: ISODate[] = Array.from({ length: steps }, (_, t) => addDays(crisis.start, t * STEP_DAYS));
	const n = assets.length;
	const values = new Float64Array(steps * n);
	assets.forEach((x, i) => {
		const path = scenarioPath(crisis.type, x.kind, x.leverage, a, steps);
		for (let t = 0; t < steps; t++) values[t * n + i] = path[t]!;
	});
	let endIndex = 0;
	while (endIndex + 1 < steps && dates[endIndex + 1]! <= crisis.end) endIndex++;
	return { crisisId: crisis.id, dates, values, assets: n, endIndex };
}

export function scenarioCrises(a: ScenarioAssumptions, today: ISODate): Crisis[] {
	return CRISIS_TYPES.map((t) => scenarioCrisis(t, a, today));
}

/** Merge stored (possibly partial or outdated) assumptions with the defaults. */
export function normalizeAssumptions(raw: unknown): ScenarioAssumptions {
	const r = (raw ?? {}) as Partial<ScenarioAssumptions>;
	const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
	const out: ScenarioAssumptions = structuredClone(DEFAULT_ASSUMPTIONS);
	for (const t of CRISIS_TYPES) {
		for (const k of SCENARIO_KINDS) out.change[t][k] = Math.max(-0.99, num(r.change?.[t]?.[k], out.change[t][k]));
		out.toTrough[t] = Math.max(0.5, num(r.toTrough?.[t], out.toTrough[t]));
		out.toRecover[t] = Math.max(0.5, num(r.toRecover?.[t], out.toRecover[t]));
	}
	return out;
}
