/** Pearson correlation of aligned daily log returns (AC-1). */
import type { CorrelationMatrix, PricePoint } from '#lib/domain/types.ts';
import { logReturns, pearsonCorrelation } from './math.ts';
import { alignSeries } from './series.ts';

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
