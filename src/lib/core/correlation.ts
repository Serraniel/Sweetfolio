/** Pearson correlation of aligned daily log returns (AC-1). */
import type { CorrelationMatrix, PeriodKey, PricePoint } from '#lib/domain/types.ts';
import { logReturns, pearsonCorrelation } from './math.ts';
import { PERIOD_YEARS, periodSlice } from './metrics.ts';
import { alignSeries, ensureSorted } from './series.ts';

export function computeCorrelationMatrix(series: ReadonlyArray<{ id: string; prices: readonly PricePoint[] }>): CorrelationMatrix {
	const ids = series.map((s) => s.id);
	const n = series.length;
	const matrix: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
	if (n < 2) return { ids, matrix };
	const { values } = alignSeries(series.map((s) => s.prices));
	const returns = values.map(logReturns);
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			const r = pearsonCorrelation(returns[i]!, returns[j]!);
			matrix[i]![j] = r;
			matrix[j]![i] = r;
		}
	}
	return { ids, matrix };
}

/**
 * Correlation with a benchmark per metrics period (FM-1 periods of the series),
 * on the dates both have within the period. Null when the period is not covered.
 */
export function benchmarkCorrelation(prices: readonly PricePoint[], benchmark: readonly PricePoint[]): Record<PeriodKey, number | null> {
	const sorted = ensureSorted(prices);
	const bench = ensureSorted(benchmark);
	const out = {} as Record<PeriodKey, number | null>;
	for (const [key, years] of Object.entries(PERIOD_YEARS) as Array<[PeriodKey, number | null]>) {
		const slice = periodSlice(sorted, years);
		const start = slice?.[0]?.date ?? '';
		const end = slice?.at(-1)?.date ?? '';
		const b = bench.filter((p) => p.date >= start && p.date <= end);
		out[key] =
			slice && b.length > 2
				? computeCorrelationMatrix([
						{ id: 'p', prices: slice },
						{ id: 'b', prices: b }
					]).matrix[0]![1]!
				: null;
	}
	return out;
}
