import { describe, it, expect } from 'vitest';
import { computeCorrelationMatrix } from './correlation';
import type { PricePoint } from '$lib/types';

describe('computeCorrelationMatrix', () => {
  it('returns empty matrix for no assets', () => {
    const result = computeCorrelationMatrix([]);
    expect(result.assetIds).toEqual([]);
    expect(result.matrix).toEqual([]);
  });

  it('returns [[1]] for a single asset', () => {
    const result = computeCorrelationMatrix([
      {
        id: 'a',
        prices: [
          { date: '2024-01-01', close: 100 },
          { date: '2024-01-02', close: 110 },
        ],
      },
    ]);
    expect(result.assetIds).toEqual(['a']);
    expect(result.matrix).toEqual([[1]]);
  });

  it('computes correlation of 1 for perfectly correlated assets', () => {
    const prices1: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 110 },
      { date: '2024-01-03', close: 120 },
      { date: '2024-01-04', close: 130 },
    ];
    // Prices that move in exact proportion (same returns)
    const prices2: PricePoint[] = [
      { date: '2024-01-01', close: 200 },
      { date: '2024-01-02', close: 220 },
      { date: '2024-01-03', close: 240 },
      { date: '2024-01-04', close: 260 },
    ];

    const result = computeCorrelationMatrix([
      { id: 'a', prices: prices1 },
      { id: 'b', prices: prices2 },
    ]);
    expect(result.matrix[0][0]).toBeCloseTo(1, 5);
    expect(result.matrix[1][1]).toBeCloseTo(1, 5);
    expect(result.matrix[0][1]).toBeCloseTo(1, 5);
    expect(result.matrix[1][0]).toBeCloseTo(1, 5);
  });

  it('computes correlation of -1 for inversely correlated assets', () => {
    const prices1: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 110 },
      { date: '2024-01-03', close: 120 },
      { date: '2024-01-04', close: 130 },
      { date: '2024-01-05', close: 140 },
    ];
    // Prices moving in opposite direction with same magnitude of log returns
    // If A goes 100->110 (10% up), B should go down proportionally
    // Using reciprocal relationship: B_i = B_0 * (A_0 / A_i)
    const prices2: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 100 * (100 / 110) },
      { date: '2024-01-03', close: 100 * (100 / 120) },
      { date: '2024-01-04', close: 100 * (100 / 130) },
      { date: '2024-01-05', close: 100 * (100 / 140) },
    ];

    const result = computeCorrelationMatrix([
      { id: 'a', prices: prices1 },
      { id: 'b', prices: prices2 },
    ]);
    expect(result.matrix[0][1]).toBeCloseTo(-1, 5);
  });

  it('produces a symmetric matrix', () => {
    const prices1: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 105 },
      { date: '2024-01-03', close: 102 },
      { date: '2024-01-04', close: 108 },
    ];
    const prices2: PricePoint[] = [
      { date: '2024-01-01', close: 200 },
      { date: '2024-01-02', close: 198 },
      { date: '2024-01-03', close: 205 },
      { date: '2024-01-04', close: 210 },
    ];
    const prices3: PricePoint[] = [
      { date: '2024-01-01', close: 50 },
      { date: '2024-01-02', close: 52 },
      { date: '2024-01-03', close: 48 },
      { date: '2024-01-04', close: 55 },
    ];

    const result = computeCorrelationMatrix([
      { id: 'a', prices: prices1 },
      { id: 'b', prices: prices2 },
      { id: 'c', prices: prices3 },
    ]);

    expect(result.matrix).toHaveLength(3);
    // Symmetric: matrix[i][j] === matrix[j][i]
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(result.matrix[i][j]).toBeCloseTo(result.matrix[j][i], 10);
      }
    }
    // Diagonal is 1
    for (let i = 0; i < 3; i++) {
      expect(result.matrix[i][i]).toBeCloseTo(1, 10);
    }
  });

  it('handles assets with different date ranges by aligning', () => {
    const prices1: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 105 },
      { date: '2024-01-03', close: 110 },
      { date: '2024-01-04', close: 115 },
    ];
    const prices2: PricePoint[] = [
      { date: '2024-01-02', close: 200 },
      { date: '2024-01-03', close: 210 },
      { date: '2024-01-04', close: 220 },
      { date: '2024-01-05', close: 230 },
    ];

    const result = computeCorrelationMatrix([
      { id: 'a', prices: prices1 },
      { id: 'b', prices: prices2 },
    ]);
    // Should not throw and should produce a 2x2 matrix
    expect(result.matrix).toHaveLength(2);
    expect(result.matrix[0]).toHaveLength(2);
  });
});
