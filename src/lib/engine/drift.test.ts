import { describe, it, expect } from 'vitest';
import { computeDrift, computeRebalanceTrades } from './drift';
import type { Holding } from '$lib/types';

function makeHolding(overrides: Partial<Holding> & { assetId: string; weight: number }): Holding {
  return {
    quantity: 10,
    avgCostBasis: 100,
    totalCost: 1000,
    currentPrice: 100,
    currentValue: 1000,
    unrealizedGain: 0,
    unrealizedGainPercent: 0,
    ...overrides,
  };
}

describe('computeDrift', () => {
  it('returns empty array for empty inputs', () => {
    expect(computeDrift([], [])).toEqual([]);
  });

  it('returns zero drift when single asset is perfectly on target', () => {
    const allocations = [{ assetId: 'A', weight: 1 }];
    const holdings = [makeHolding({ assetId: 'A', weight: 1 })];
    const result = computeDrift(allocations, holdings);
    expect(result).toEqual([
      { assetId: 'A', modelWeight: 1, actualWeight: 1, drift: 0 },
    ]);
  });

  it('computes correct drift for two assets', () => {
    const allocations = [
      { assetId: 'A', weight: 0.6 },
      { assetId: 'B', weight: 0.4 },
    ];
    const holdings = [
      makeHolding({ assetId: 'A', weight: 0.7 }),
      makeHolding({ assetId: 'B', weight: 0.3 }),
    ];
    const result = computeDrift(allocations, holdings);
    expect(result).toHaveLength(2);

    const driftA = result.find((d) => d.assetId === 'A')!;
    expect(driftA.modelWeight).toBe(0.6);
    expect(driftA.actualWeight).toBe(0.7);
    expect(driftA.drift).toBeCloseTo(0.1);

    const driftB = result.find((d) => d.assetId === 'B')!;
    expect(driftB.modelWeight).toBe(0.4);
    expect(driftB.actualWeight).toBe(0.3);
    expect(driftB.drift).toBeCloseTo(-0.1);
  });

  it('includes asset held but not in model with modelWeight=0', () => {
    const allocations = [{ assetId: 'A', weight: 1 }];
    const holdings = [
      makeHolding({ assetId: 'A', weight: 0.8 }),
      makeHolding({ assetId: 'B', weight: 0.2 }),
    ];
    const result = computeDrift(allocations, holdings);
    expect(result).toHaveLength(2);

    const driftB = result.find((d) => d.assetId === 'B')!;
    expect(driftB.modelWeight).toBe(0);
    expect(driftB.actualWeight).toBe(0.2);
    expect(driftB.drift).toBeCloseTo(0.2);
  });

  it('includes asset in model but not held with actualWeight=0', () => {
    const allocations = [
      { assetId: 'A', weight: 0.5 },
      { assetId: 'B', weight: 0.5 },
    ];
    const holdings = [makeHolding({ assetId: 'A', weight: 1 })];
    const result = computeDrift(allocations, holdings);
    expect(result).toHaveLength(2);

    const driftB = result.find((d) => d.assetId === 'B')!;
    expect(driftB.modelWeight).toBe(0.5);
    expect(driftB.actualWeight).toBe(0);
    expect(driftB.drift).toBeCloseTo(-0.5);
  });

  it('sorts by absolute drift descending', () => {
    const allocations = [
      { assetId: 'A', weight: 0.5 },
      { assetId: 'B', weight: 0.3 },
      { assetId: 'C', weight: 0.2 },
    ];
    const holdings = [
      makeHolding({ assetId: 'A', weight: 0.5 }),   // drift 0
      makeHolding({ assetId: 'B', weight: 0.1 }),   // drift -0.2
      makeHolding({ assetId: 'C', weight: 0.4 }),   // drift +0.2
    ];
    const result = computeDrift(allocations, holdings);
    // B and C have |drift|=0.2, A has 0
    expect(Math.abs(result[0].drift)).toBeGreaterThanOrEqual(Math.abs(result[1].drift));
    expect(Math.abs(result[1].drift)).toBeGreaterThanOrEqual(Math.abs(result[2].drift));
    expect(result[2].assetId).toBe('A');
  });
});

describe('computeRebalanceTrades', () => {
  it('returns empty array for empty inputs', () => {
    expect(computeRebalanceTrades([], [], 0)).toEqual([]);
  });

  it('computes correct trades for simple 2-asset case', () => {
    const allocations = [
      { assetId: 'A', weight: 0.6 },
      { assetId: 'B', weight: 0.4 },
    ];
    const holdings = [
      makeHolding({ assetId: 'A', weight: 0.7, currentValue: 7000 }),
      makeHolding({ assetId: 'B', weight: 0.3, currentValue: 3000 }),
    ];
    const totalValue = 10000;
    const trades = computeRebalanceTrades(allocations, holdings, totalValue);

    const tradeA = trades.find((t) => t.assetId === 'A')!;
    expect(tradeA.action).toBe('sell');
    expect(tradeA.value).toBeCloseTo(1000); // 7000 - 6000
    expect(tradeA.currentWeight).toBe(0.7);
    expect(tradeA.targetWeight).toBe(0.6);

    const tradeB = trades.find((t) => t.assetId === 'B')!;
    expect(tradeB.action).toBe('buy');
    expect(tradeB.value).toBeCloseTo(1000); // 4000 - 3000
    expect(tradeB.currentWeight).toBe(0.3);
    expect(tradeB.targetWeight).toBe(0.4);
  });

  it('skips trivial differences (|diff| <= 0.01)', () => {
    const allocations = [{ assetId: 'A', weight: 1 }];
    const holdings = [makeHolding({ assetId: 'A', weight: 1, currentValue: 1000.005 })];
    const trades = computeRebalanceTrades(allocations, holdings, 1000);
    expect(trades).toEqual([]);
  });

  it('returns all buys when there are no holdings', () => {
    const allocations = [
      { assetId: 'A', weight: 0.6 },
      { assetId: 'B', weight: 0.4 },
    ];
    const totalValue = 10000;
    const trades = computeRebalanceTrades(allocations, [], totalValue);

    expect(trades).toHaveLength(2);
    expect(trades.every((t) => t.action === 'buy')).toBe(true);

    const tradeA = trades.find((t) => t.assetId === 'A')!;
    expect(tradeA.value).toBeCloseTo(6000);

    const tradeB = trades.find((t) => t.assetId === 'B')!;
    expect(tradeB.value).toBeCloseTo(4000);
  });

  it('sorts trades by absolute value descending', () => {
    const allocations = [
      { assetId: 'A', weight: 0.5 },
      { assetId: 'B', weight: 0.3 },
      { assetId: 'C', weight: 0.2 },
    ];
    const holdings = [
      makeHolding({ assetId: 'A', weight: 0.2, currentValue: 2000 }),
      makeHolding({ assetId: 'B', weight: 0.3, currentValue: 3000 }),
      makeHolding({ assetId: 'C', weight: 0.5, currentValue: 5000 }),
    ];
    const trades = computeRebalanceTrades(allocations, holdings, 10000);
    // B is on target (skip), A needs +3000, C needs -3000
    for (let i = 1; i < trades.length; i++) {
      expect(trades[i - 1].value).toBeGreaterThanOrEqual(trades[i].value);
    }
  });
});
