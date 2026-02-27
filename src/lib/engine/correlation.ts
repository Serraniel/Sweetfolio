/**
 * Pearson correlation on logarithmic returns.
 * Forward-fills missing dates before computation.
 * Produces a full N x N correlation matrix.
 */

import type { PricePoint, CorrelationMatrix } from '$lib/types';
import { alignPriceSeries } from '$lib/utils/dates';
import { logReturns, pearsonCorrelation } from '$lib/utils/math';

/**
 * Compute the N x N correlation matrix for a set of assets.
 * Each asset's price series is forward-filled and aligned to common dates.
 * Correlation is computed on log returns.
 */
export function computeCorrelationMatrix(
  assets: Array<{ id: string; prices: PricePoint[] }>,
): CorrelationMatrix {
  const assetIds = assets.map((a) => a.id);
  const n = assets.length;

  if (n === 0) {
    return { assetIds: [], matrix: [] };
  }

  if (n === 1) {
    return { assetIds, matrix: [[1]] };
  }

  // Align all price series to common dates with forward-fill
  const { alignedSeries } = alignPriceSeries(assets.map((a) => a.prices));

  // Compute log returns for each aligned series
  const returns = alignedSeries.map((prices) => logReturns(prices));

  // Build correlation matrix
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1; // Self-correlation is always 1
    for (let j = i + 1; j < n; j++) {
      const corr = pearsonCorrelation(returns[i], returns[j]);
      matrix[i][j] = corr;
      matrix[j][i] = corr; // Symmetric
    }
  }

  return { assetIds, matrix };
}
