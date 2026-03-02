/**
 * Drift analysis engine.
 * Computes portfolio drift from model allocations and suggests rebalancing trades.
 */

import type { DriftItem, Holding } from '$lib/types';

/**
 * Compute drift between model allocations and actual holdings.
 *
 * For each asset in model allocations, finds the matching holding and computes
 * the difference between actual and model weights. Assets held but not in the
 * model are included with modelWeight=0. Results are sorted by absolute drift
 * descending.
 */
export function computeDrift(
  modelAllocations: Array<{ assetId: string; weight: number }>,
  holdings: Holding[],
): DriftItem[] {
  if (modelAllocations.length === 0 && holdings.length === 0) return [];

  const holdingMap = new Map(holdings.map((h) => [h.assetId, h]));
  const seen = new Set<string>();
  const items: DriftItem[] = [];

  // Process model allocations
  for (const alloc of modelAllocations) {
    seen.add(alloc.assetId);
    const holding = holdingMap.get(alloc.assetId);
    const actualWeight = holding?.weight ?? 0;
    items.push({
      assetId: alloc.assetId,
      modelWeight: alloc.weight,
      actualWeight,
      drift: actualWeight - alloc.weight,
    });
  }

  // Process holdings not in model
  for (const holding of holdings) {
    if (!seen.has(holding.assetId)) {
      items.push({
        assetId: holding.assetId,
        modelWeight: 0,
        actualWeight: holding.weight,
        drift: holding.weight,
      });
    }
  }

  // Sort by absolute drift descending
  items.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));

  return items;
}

export interface RebalanceTrade {
  assetId: string;
  action: 'buy' | 'sell';
  value: number;
  currentWeight: number;
  targetWeight: number;
}

/**
 * Compute rebalancing trades to bring holdings in line with model allocations.
 *
 * For each asset, computes the target value (modelWeight * totalValue) and
 * the current value from holdings. The difference determines buy/sell action
 * and trade amount. Trivial trades (|difference| <= 0.01) are skipped.
 * Results are sorted by absolute trade value descending.
 */
export function computeRebalanceTrades(
  modelAllocations: Array<{ assetId: string; weight: number }>,
  holdings: Holding[],
  totalValue: number,
): RebalanceTrade[] {
  if (modelAllocations.length === 0 && holdings.length === 0) return [];

  const holdingMap = new Map(holdings.map((h) => [h.assetId, h]));
  const seen = new Set<string>();
  const trades: RebalanceTrade[] = [];

  // Process model allocations
  for (const alloc of modelAllocations) {
    seen.add(alloc.assetId);
    const holding = holdingMap.get(alloc.assetId);
    const currentValue = holding?.currentValue ?? 0;
    const currentWeight = holding?.weight ?? 0;
    const targetValue = alloc.weight * totalValue;
    const diff = targetValue - currentValue;

    if (Math.abs(diff) <= 0.01) continue;

    trades.push({
      assetId: alloc.assetId,
      action: diff > 0 ? 'buy' : 'sell',
      value: Math.abs(diff),
      currentWeight,
      targetWeight: alloc.weight,
    });
  }

  // Process holdings not in model (need to sell all)
  for (const holding of holdings) {
    if (!seen.has(holding.assetId) && holding.currentValue > 0.01) {
      trades.push({
        assetId: holding.assetId,
        action: 'sell',
        value: holding.currentValue,
        currentWeight: holding.weight,
        targetWeight: 0,
      });
    }
  }

  // Sort by absolute value descending
  trades.sort((a, b) => b.value - a.value);

  return trades;
}
