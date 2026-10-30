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
}

export type MonteCarloMessage =
	{ kind: 'progress'; done: number; total: number } | { kind: 'result'; result: MonteCarloResult } | { kind: 'error'; error: string };
