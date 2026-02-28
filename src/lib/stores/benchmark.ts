import { derived } from 'svelte/store';
import { settings, setSetting } from './settings';
import { assets } from './assets';
import { portfolios } from './portfolios';
import { computePortfolioPrices } from '$lib/engine/portfolio';
import type { PricePoint } from '$lib/types';

export interface BenchmarkRef {
  type: 'asset' | 'portfolio';
  id: string;
}

export interface ResolvedBenchmark {
  ref: BenchmarkRef;
  name: string;
  prices: PricePoint[];
}

/**
 * The current benchmark reference from settings. Null if no benchmark is set.
 */
export const benchmarkRef = derived(settings, ($settings) => {
  const val = $settings.benchmark;
  if (
    val &&
    typeof val === 'object' &&
    'type' in (val as object) &&
    'id' in (val as object)
  ) {
    return val as BenchmarkRef;
  }
  return null;
});

/**
 * The fully resolved benchmark with name and price series.
 * Returns null if no benchmark is set or the referenced entity was deleted.
 */
export const benchmark = derived(
  [benchmarkRef, assets, portfolios],
  ([$ref, $assets, $portfolios]): ResolvedBenchmark | null => {
    if (!$ref) return null;

    if ($ref.type === 'asset') {
      const asset = $assets.find((a) => a.id === $ref.id);
      if (!asset) return null;
      return { ref: $ref, name: asset.name, prices: asset.prices };
    }

    if ($ref.type === 'portfolio') {
      const portfolio = $portfolios.find((p) => p.id === $ref.id);
      if (!portfolio) return null;
      const assetData = portfolio.allocations
        .map((alloc) => {
          const asset = $assets.find((a) => a.id === alloc.assetId);
          if (!asset) return null;
          return { id: asset.id, prices: asset.prices, weight: alloc.weight };
        })
        .filter((a): a is NonNullable<typeof a> => a !== null);
      if (assetData.length === 0) return null;
      const prices = computePortfolioPrices(assetData);
      return { ref: $ref, name: portfolio.name, prices };
    }

    return null;
  },
);

/**
 * Set the global benchmark. Pass null to clear.
 */
export async function setBenchmark(ref: BenchmarkRef | null): Promise<void> {
  await setSetting('benchmark', ref);
}
