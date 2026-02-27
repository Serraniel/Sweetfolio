/**
 * Statistical and mathematical helper functions.
 * All calculations use pure TypeScript — no external dependencies.
 */

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
  }
  return sum / values.length;
}

export function variance(values: number[], populationVariance = true): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  let sumSq = 0;
  for (let i = 0; i < values.length; i++) {
    const diff = values[i] - avg;
    sumSq += diff * diff;
  }
  return sumSq / (populationVariance ? values.length : values.length - 1);
}

export function stddev(values: number[], populationVariance = true): number {
  return Math.sqrt(variance(values, populationVariance));
}

export function covariance(
  x: number[],
  y: number[],
  populationCovariance = true,
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

export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const sx = stddev(x);
  const sy = stddev(y);
  if (sx === 0 || sy === 0) return 0;
  return covariance(x, y) / (sx * sy);
}

export function ln(x: number): number {
  return Math.log(x);
}

export function logReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    } else {
      returns.push(0);
    }
  }
  return returns;
}
