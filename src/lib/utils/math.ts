/**
 * Statistical and mathematical helper functions.
 * All calculations use pure TypeScript — no external dependencies.
 */

/** Arithmetic mean of an array of numbers. Returns 0 for empty arrays. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
  }
  return sum / values.length;
}

/** Variance of an array. Uses sample variance (N-1) by default; pass `true` for population variance. */
export function variance(values: number[], populationVariance = false): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  let sumSq = 0;
  for (let i = 0; i < values.length; i++) {
    const diff = values[i] - avg;
    sumSq += diff * diff;
  }
  return sumSq / (populationVariance ? values.length : values.length - 1);
}

/** Standard deviation. Uses sample variance (N-1) by default; pass `true` for population. */
export function stddev(values: number[], populationVariance = false): number {
  return Math.sqrt(variance(values, populationVariance));
}

/** Covariance between two arrays. Uses sample covariance (N-1) by default. */
export function covariance(
  x: number[],
  y: number[],
  populationCovariance = false,
): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const meanX = mean(x);
  const meanY = mean(y);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (x[i] - meanX) * (y[i] - meanY);
  }
  return sum / (populationCovariance ? n : n - 1);
}

/** Pearson correlation coefficient between two arrays. Returns 0 if either has zero variance. */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const sx = stddev(x);
  const sy = stddev(y);
  if (sx === 0 || sy === 0) return 0;
  return covariance(x, y) / (sx * sy);
}

/** Natural logarithm. Alias for `Math.log`. */
export function ln(x: number): number {
  return Math.log(x);
}

/** Compute logarithmic returns from a price series: `ln(P[i] / P[i-1])`.
 * Non-positive prices are skipped and a warning is added if a warnings array is provided.
 */
export function logReturns(prices: number[], warnings?: string[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    } else {
      warnings?.push(
        `Non-positive price at index ${prices[i - 1] <= 0 ? i - 1 : i}, skipping data point`,
      );
    }
  }
  return returns;
}
