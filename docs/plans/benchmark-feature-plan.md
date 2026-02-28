# Benchmark Feature — Technical Architecture Plan

## Problem Statement

Currently, only portfolios can serve as benchmarks (`Portfolio.isBenchmark`). Users need to compare individual assets (e.g., an MSCI World ETF) as benchmarks against their portfolios and other assets without creating a single-asset portfolio as a workaround.

## Design Goals

- An individual asset can be designated as a benchmark
- A portfolio can still be designated as a benchmark
- There is one global "active benchmark" at a time (either an asset or a portfolio)
- The active benchmark is overlaid on all relevant charts (price, performance, drawdown, efficient frontier)
- Benchmark metrics are shown side-by-side with asset/portfolio metrics
- The data model is backward-compatible (no IndexedDB migration needed)

## Data Model Changes

### No changes to `Asset` or `Portfolio` types

The `Portfolio.isBenchmark` field already exists but is underused. Rather than adding `isBenchmark` to `Asset` (which would duplicate the concept), the global benchmark reference is stored in settings.

### New setting: `benchmark`

```typescript
// Stored in IndexedDB settings store under key "benchmark"
interface BenchmarkRef {
  type: 'asset' | 'portfolio';
  id: string;  // asset ID or portfolio ID
}
```

Stored as: `{ key: 'benchmark', value: BenchmarkRef | null }`

This replaces the role of `Portfolio.isBenchmark`. The existing `isBenchmark` field on `Portfolio` is retained for backward compatibility but becomes a secondary indicator — the settings `benchmark` value is the source of truth.

### Migration path

On app startup, if `settings.benchmark` is not set but a portfolio with `isBenchmark: true` exists, automatically migrate by writing:
```typescript
setSetting('benchmark', { type: 'portfolio', id: portfolio.id });
```

This migration logic goes in `stores/init.ts` as part of the `initStores()` call.

## Store Changes

### New: `stores/benchmark.ts`

```typescript
import { derived } from 'svelte/store';
import { settings } from './settings';
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
  if (val && typeof val === 'object' && 'type' in val && 'id' in val) {
    return val as BenchmarkRef;
  }
  return null;
});

/**
 * The fully resolved benchmark with name and price series.
 * Automatically computes portfolio prices if the benchmark is a portfolio.
 * Returns null if the benchmark reference is invalid or the entity was deleted.
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
        .filter(Boolean);
      const prices = computePortfolioPrices(assetData);
      return { ref: $ref, name: portfolio.name, prices };
    }

    return null;
  }
);
```

### Helper functions

```typescript
export async function setBenchmark(ref: BenchmarkRef | null): Promise<void> {
  await setSetting('benchmark', ref);
}
```

### Updates to existing stores

- **`stores/settings.ts`**: No changes needed (already generic key-value).
- **`stores/init.ts`**: Add migration logic after `loadSettings()` completes.

## Chart Integration

All chart components already support a benchmark concept via `isBenchmark` on `SeriesData`. The changes wire the global benchmark into each page.

### PriceChart / PerformanceChart / DrawdownChart

These accept a `series: SeriesData[]` prop where each item has `isBenchmark?: boolean`. The resolved benchmark is appended as an additional series entry:

```typescript
// In any page that shows charts:
import { benchmark } from '$lib/stores/benchmark';

const chartSeries = $derived(() => {
  const series = [/* ... existing series ... */];
  if ($benchmark) {
    series.push({
      label: $benchmark.name,
      prices: $benchmark.prices,
      isBenchmark: true,
    });
  }
  return series;
});
```

Chart utils already render `isBenchmark` series in hot pink with a thicker stroke.

### EfficientFrontier

Already accepts a `benchmark?: SimulatedPortfolio | null` prop and renders it as a distinct dot. The simulation page needs to compute the benchmark's position on the scatter plot:

```typescript
// In /simulation page, after simulation completes:
function computeBenchmarkPoint(benchmark: ResolvedBenchmark): SimulatedPortfolio | null {
  // Calculate annualized return and volatility from benchmark prices
  // using the same engine functions as the worker
}
```

### MetricsTable

Add an optional `benchmarkMetrics` prop to show a comparison column. The table renders the benchmark's metrics alongside the primary entity's metrics with a delta indicator.

### CorrelationMatrix

No changes needed — the correlation matrix already operates on the assets within a portfolio. If the benchmark is an asset, it can optionally be included in the correlation calculation. This is a future enhancement, not part of the initial implementation.

## Page-Level Changes

### `/assets/[id]` — Asset Detail

- Add a "Set as Benchmark" button (mirrors the portfolio page pattern)
- If a global benchmark is active and differs from the current asset, overlay the benchmark on PriceChart and PerformanceChart
- Show benchmark metrics alongside asset metrics in MetricsTable

### `/portfolios/[id]` — Portfolio Detail

- "Set as Benchmark" button already exists; update to use `setBenchmark({ type: 'portfolio', id })`
- Overlay the global benchmark on PerformanceChart (already partially wired via `isBenchmark` on series)
- Show benchmark metrics in MetricsTable

### `/simulation` — Monte Carlo

- If a global benchmark is set, compute its (volatility, return) point and pass to `EfficientFrontier` as the `benchmark` prop
- No changes needed to the Monte Carlo worker itself

### `/` — Dashboard

- Show the current benchmark name in a summary card (optional, low priority)

### `/settings` — Settings

- Add a "Benchmark" section showing the current benchmark with a "Clear Benchmark" button
- Benchmark selection is primarily done from asset/portfolio detail pages

## Interaction Between Asset and Portfolio Benchmarks

There is only one active benchmark at a time. Setting a new benchmark replaces the old one.

When the user sets asset X as benchmark:
1. `setSetting('benchmark', { type: 'asset', id: X.id })`
2. If any portfolio had `isBenchmark: true`, set it to `false` (optional cleanup for consistency)

When the user sets portfolio P as benchmark:
1. `setSetting('benchmark', { type: 'portfolio', id: P.id })`
2. Also set `portfolio.isBenchmark = true` for backward compat
3. Clear `isBenchmark` on any other portfolio that had it

When the benchmarked entity is deleted:
- The `benchmark` derived store resolves to `null` (entity not found)
- No crash, no stale references — charts simply stop showing the benchmark overlay
- The stale setting remains in IndexedDB until explicitly cleared or a new benchmark is set

## Implementation Order

1. Create `stores/benchmark.ts` with `BenchmarkRef`, `benchmarkRef`, `benchmark`, `setBenchmark`
2. Add migration logic to `stores/init.ts`
3. Update `/assets/[id]` page: add "Set as Benchmark" button, overlay benchmark on charts
4. Update `/portfolios/[id]` page: update benchmark toggle to use `setBenchmark()`
5. Update `/simulation` page: compute benchmark scatter point
6. Update `MetricsTable` to accept optional benchmark metrics column
7. Update `/settings` page: show current benchmark with clear action

## Non-Goals (Future Enhancements)

- Multiple simultaneous benchmarks (e.g., comparing against both MSCI World and S&P 500)
- Benchmark-relative metrics (tracking error, information ratio, alpha, beta)
- Including benchmark in correlation matrix automatically
- Benchmark as a required field for Sharpe ratio (currently uses risk-free rate)
