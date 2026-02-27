import { describe, it, expect } from 'vitest';
import {
  mean,
  variance,
  stddev,
  covariance,
  pearsonCorrelation,
  ln,
  logReturns,
} from './math';

describe('mean', () => {
  it('returns 0 for empty array', () => {
    expect(mean([])).toBe(0);
  });

  it('returns the single value for a single-element array', () => {
    expect(mean([5])).toBe(5);
  });

  it('computes arithmetic mean correctly', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });

  it('handles negative values', () => {
    expect(mean([-10, 10])).toBe(0);
  });

  it('handles decimal values', () => {
    expect(mean([1.5, 2.5])).toBe(2);
  });
});

describe('variance', () => {
  it('returns 0 for fewer than 2 elements', () => {
    expect(variance([])).toBe(0);
    expect(variance([42])).toBe(0);
  });

  it('computes sample variance by default', () => {
    // Values: [2, 4, 4, 4, 5, 5, 7, 9], mean = 5
    // sum of squared diffs = 9+1+1+1+0+0+4+16 = 32
    // sample variance = 32/7
    expect(variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(32 / 7, 10);
  });

  it('computes population variance when specified', () => {
    // population variance = 32/8 = 4
    expect(variance([2, 4, 4, 4, 5, 5, 7, 9], true)).toBe(4);
  });

  it('returns 0 for identical values', () => {
    expect(variance([5, 5, 5, 5])).toBe(0);
  });
});

describe('stddev', () => {
  it('returns 0 for fewer than 2 elements', () => {
    expect(stddev([])).toBe(0);
    expect(stddev([7])).toBe(0);
  });

  it('computes sample standard deviation by default', () => {
    // sample variance = 32/7, stddev = sqrt(32/7)
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7), 10);
  });

  it('computes population standard deviation when specified', () => {
    // population variance of [2,4,4,4,5,5,7,9] = 4, stddev = 2
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9], true)).toBe(2);
  });
});

describe('covariance', () => {
  it('returns 0 for fewer than 2 paired elements', () => {
    expect(covariance([], [])).toBe(0);
    expect(covariance([1], [2])).toBe(0);
  });

  it('computes sample covariance by default', () => {
    // x=[1,2,3], y=[2,4,6] -> x scaled by 2
    // meanX=2, meanY=4
    // sample cov = 4/2 = 2
    expect(covariance([1, 2, 3], [2, 4, 6])).toBeCloseTo(2, 10);
  });

  it('computes population covariance when specified', () => {
    // population cov = ((1-2)(2-4) + (2-2)(4-4) + (3-2)(6-4)) / 3 = 4/3
    expect(covariance([1, 2, 3], [2, 4, 6], true)).toBeCloseTo(4 / 3, 10);
  });

  it('returns 0 for uncorrelated data with zero covariance', () => {
    // x=[1,-1,1,-1], y=[1,1,-1,-1] -> covariance = 0
    expect(covariance([1, -1, 1, -1], [1, 1, -1, -1])).toBeCloseTo(0, 10);
  });
});

describe('pearsonCorrelation', () => {
  it('returns 0 for fewer than 2 elements', () => {
    expect(pearsonCorrelation([], [])).toBe(0);
    expect(pearsonCorrelation([1], [2])).toBe(0);
  });

  it('returns 1 for perfectly positively correlated data', () => {
    expect(pearsonCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBeCloseTo(1, 10);
  });

  it('returns -1 for perfectly negatively correlated data', () => {
    expect(pearsonCorrelation([1, 2, 3, 4, 5], [10, 8, 6, 4, 2])).toBeCloseTo(-1, 10);
  });

  it('returns 0 when one series has zero variance', () => {
    expect(pearsonCorrelation([5, 5, 5], [1, 2, 3])).toBe(0);
  });

  it('computes a known correlation value', () => {
    // x = [1, 2, 3, 4, 5], y = [2, 3, 5, 4, 6]
    // Sample-based Pearson: cov(x,y) / (stddev(x) * stddev(y))
    // meanX=3, meanY=4, cov=1.8, stddevX=sqrt(2), stddevY=sqrt(2)
    // r = 1.8 / (sqrt(2)*sqrt(2)) = 1.8/2 = 0.9
    const x = [1, 2, 3, 4, 5];
    const y = [2, 3, 5, 4, 6];
    const r = pearsonCorrelation(x, y);
    expect(r).toBeCloseTo(0.9, 10);
  });
});

describe('ln', () => {
  it('returns natural log', () => {
    expect(ln(1)).toBe(0);
    expect(ln(Math.E)).toBeCloseTo(1, 10);
  });
});

describe('logReturns', () => {
  it('returns empty array for fewer than 2 prices', () => {
    expect(logReturns([])).toEqual([]);
    expect(logReturns([100])).toEqual([]);
  });

  it('computes log returns correctly', () => {
    const prices = [100, 110, 105];
    const returns = logReturns(prices);
    expect(returns).toHaveLength(2);
    expect(returns[0]).toBeCloseTo(Math.log(110 / 100), 10);
    expect(returns[1]).toBeCloseTo(Math.log(105 / 110), 10);
  });

  it('skips data points when a price is zero or negative', () => {
    const prices = [100, 0, 50];
    const warnings: string[] = [];
    const returns = logReturns(prices, warnings);
    expect(returns).toHaveLength(0);
    expect(warnings).toHaveLength(2);
  });

  it('handles constant prices', () => {
    const prices = [50, 50, 50];
    const returns = logReturns(prices);
    expect(returns).toEqual([0, 0]);
  });
});
