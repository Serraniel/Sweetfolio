import type { SimulationPhase } from '#lib/core/montecarlo.ts';
import type { CorrelationMatrix, MetricsResult, MonteCarloResult, PricePoint, WeightConstraint } from '#lib/domain/types.ts';

export type CalcRequest =
	| { id: number; kind: 'metrics'; prices: PricePoint[]; riskFreeRate: number }
	| { id: number; kind: 'correlation'; series: Array<{ id: string; prices: PricePoint[] }> };

export type CalcResponse = { id: number; ok: true; result: MetricsResult | CorrelationMatrix } | { id: number; ok: false; error: string };

export interface MonteCarloRequest {
	assets: Array<{ id: string; prices: PricePoint[] }>;
	count: number;
	riskFreeRate: number;
	constraints?: Array<WeightConstraint | undefined>;
	minAssets?: number;
	maxAssets?: number;
}

export type MonteCarloMessage =
	| { kind: 'progress'; done: number; total: number; phase: SimulationPhase }
	| { kind: 'result'; result: MonteCarloResult }
	| { kind: 'error'; error: string };

export interface CrisisTestRequest {
	matrices: Array<{ crisisId: string; dates: string[]; values: Float64Array; assets: number; endIndex: number; flags: Uint8Array }>;
	/** Row-major `count × assets` weights of the portfolios to test. */
	weights: Float32Array;
	count: number;
}

export type CrisisTestMessage =
	| { kind: 'progress'; done: number; total: number }
	/** Per portfolio and crisis (`OUTCOME_STRIDE` values each): drawdown, recovery days (NaN = not recovered), crisis return, open days. */
	| { kind: 'result'; outcomes: Float64Array }
	| { kind: 'error'; error: string };
