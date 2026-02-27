# Sweetfolio Architecture

Sweetfolio is a fully client-side portfolio planning, backtesting, and Monte Carlo simulation application. All computation happens in the browser. Data persists in IndexedDB across sessions.

Tech stack: SvelteKit (static adapter), TypeScript, uPlot, Web Workers, IndexedDB.

---

## 1. Project Structure

```
src/
  routes/                    # SvelteKit pages
    +layout.svelte           # Root layout (theme provider, nav)
    +page.svelte             # / — Dashboard
    assets/
      +page.svelte           # /assets — Asset list, upload
      [id]/+page.svelte      # /assets/:id — Asset detail + metrics
    portfolios/
      +page.svelte           # /portfolios — Portfolio list, create
      [id]/+page.svelte      # /portfolios/:id — Portfolio detail + backtest
    simulation/
      +page.svelte           # /simulation — Monte Carlo config + results
    settings/
      +page.svelte           # /settings — Currency, preferences
  lib/
    components/              # Reusable UI components
      layout/                # Shell, Nav, ThemeToggle
      shared/                # Buttons, modals, file dropzone, tables
      assets/                # Asset-specific components
      portfolios/            # Portfolio-specific components
      simulation/            # Monte Carlo-specific components
    charts/                  # uPlot wrapper components
      PriceChart.svelte
      PerformanceChart.svelte
      CorrelationMatrix.svelte
      EfficientFrontier.svelte
      DrawdownChart.svelte
    stores/                  # Svelte stores
      assets.ts
      portfolios.ts
      currencies.ts
      settings.ts
      simulation.ts
      metrics.ts
    engine/                  # Financial calculation modules
      returns.ts             # Log returns, cumulative/annualized returns
      volatility.ts          # Annualized std dev of log returns
      sharpe.ts              # Sharpe ratio
      drawdown.ts            # Max drawdown
      correlation.ts         # Pearson correlation on log returns
      montecarlo.ts          # Monte Carlo simulation logic
      portfolio.ts           # Weighted portfolio calculations, rebalancing
      currency.ts            # Currency conversion
    workers/                 # Web Workers
      calc.worker.ts         # Metrics calculation worker
      montecarlo.worker.ts   # Monte Carlo simulation worker
    storage/                 # IndexedDB layer
      db.ts                  # Database init, version management
      assets.ts              # Asset CRUD
      portfolios.ts          # Portfolio CRUD
      currencies.ts          # Currency rate CRUD
      settings.ts            # Settings CRUD
      simulations.ts         # Simulation result CRUD
    parsers/                 # CSV parsing
      csv.ts                 # Core CSV parser
      format-detection.ts    # Locale-aware date/number format detection
      normalization.ts       # Normalize parsed data to internal types
    utils/                   # Shared utilities
      dates.ts               # Date helpers, forward-fill
      math.ts                # Statistical helpers
      formatting.ts          # Number/date display formatting
static/
  favicon.svg
```

---

## 2. Data Flow

```
CSV File
  │
  ▼
Format Detection (detect date format, decimal separator, delimiter)
  │
  ▼
CSV Parser (parse rows into PricePoint[])
  │
  ▼
IndexedDB (persist asset with price history)
  │
  ├──────────────────────────────────┐
  ▼                                  ▼
Svelte Store (assets, portfolios)    Web Worker (calculate metrics)
  │                                  │
  │                                  ▼
  │                            Store (metrics results)
  │                                  │
  ▼                                  ▼
UI Components ◄──────────────── Reactive binding
  │
  ▼
uPlot Charts
```

### Reactive update chain

1. User uploads CSV or modifies portfolio allocations.
2. Data is written to IndexedDB via the storage layer.
3. The relevant Svelte store is updated (either by re-reading from IndexedDB or by direct assignment).
4. Components subscribed to the store re-render.
5. For heavy computations (metrics, correlation, Monte Carlo), the store dispatches a message to a Web Worker.
6. The worker posts results back; a callback updates the metrics/simulation store.
7. Chart components react to the updated store and re-render.

---

## 3. Web Worker Protocol

Workers communicate via `postMessage` with typed message objects. Each message has a `type` discriminant.

### Message types (main thread to worker)

```typescript
type CalcWorkerRequest =
  | {
      type: 'calculate-metrics';
      payload: {
        assetId: string;
        prices: PricePoint[];
        riskFreeRate: number;
      };
    }
  | {
      type: 'calculate-correlation';
      payload: {
        assets: Array<{ id: string; prices: PricePoint[] }>;
      };
    };

type MonteCarloWorkerRequest = {
  type: 'run-simulation';
  payload: {
    config: MonteCarloConfig;
    assets: Array<{ id: string; prices: PricePoint[] }>;
  };
};
```

### Message types (worker to main thread)

```typescript
type CalcWorkerResponse =
  | {
      type: 'metrics-result';
      payload: { assetId: string; result: MetricsResult };
    }
  | {
      type: 'correlation-result';
      payload: CorrelationMatrix;
    }
  | {
      type: 'error';
      payload: { message: string };
    };

type MonteCarloWorkerResponse =
  | {
      type: 'simulation-progress';
      payload: { completed: number; total: number };
    }
  | {
      type: 'simulation-result';
      payload: MonteCarloResult;
    }
  | {
      type: 'error';
      payload: { message: string };
    };
```

Workers are instantiated via `new Worker(new URL('$lib/workers/calc.worker.ts', import.meta.url))` so Vite handles bundling.

---

## 4. IndexedDB Schema

Database name: `sweetfolio`. Version management via the storage layer.

### Object Stores

#### `assets`

| Field          | Type                          | Notes                              |
| -------------- | ----------------------------- | ---------------------------------- |
| `id`           | `string` (UUID)               | Primary key                        |
| `name`         | `string`                      |                                    |
| `isin`         | `string \| null`              |                                    |
| `wkn`          | `string \| null`              |                                    |
| `currency`     | `string`                      | ISO 4217 code                      |
| `prices`       | `PricePoint[]`                | `{ date: string, close: number }`  |
| `formatConfig` | `DetectedFormat \| null`      | Stored so re-imports can reuse     |
| `createdAt`    | `string`                      | ISO date                           |
| `updatedAt`    | `string`                      | ISO date                           |

Indexes: `by-isin` on `isin`, `by-name` on `name`.

#### `portfolios`

| Field         | Type                                        | Notes             |
| ------------- | ------------------------------------------- | ----------------- |
| `id`          | `string` (UUID)                             | Primary key       |
| `name`        | `string`                                    |                   |
| `allocations` | `Array<{ assetId: string, weight: number }>` | Weights sum to 1  |
| `isBenchmark` | `boolean`                                   |                   |
| `createdAt`   | `string`                                    |                   |
| `updatedAt`   | `string`                                    |                   |

Indexes: `by-name` on `name`.

#### `currencies`

| Field   | Type                                    | Notes                     |
| ------- | --------------------------------------- | ------------------------- |
| `pair`  | `string`                                | Primary key, e.g. `USDEUR` |
| `rates` | `Array<{ date: string, rate: number }>` |                           |

#### `settings`

| Field          | Type     | Notes                     |
| -------------- | -------- | ------------------------- |
| `key`          | `string` | Primary key               |
| `value`        | `any`    |                           |

Known keys: `mainCurrency`, `theme`, `riskFreeRate`.

#### `simulations`

| Field       | Type               | Notes       |
| ----------- | ------------------ | ----------- |
| `id`        | `string` (UUID)    | Primary key |
| `config`    | `MonteCarloConfig` |             |
| `results`   | `MonteCarloResult` |             |
| `createdAt` | `string`           |             |

---

## 5. Svelte Store Architecture

All stores are writable Svelte stores. They are hydrated from IndexedDB on app startup and kept in sync with writes.

| Store          | Contents                                   | Populated from        |
| -------------- | ------------------------------------------ | --------------------- |
| `assets`       | `Asset[]`                                  | `assets` object store |
| `portfolios`   | `Portfolio[]`                               | `portfolios` store    |
| `currencies`   | `CurrencyRate[]`                            | `currencies` store    |
| `settings`     | `Record<string, any>`                      | `settings` store      |
| `simulation`   | `{ config: MonteCarloConfig, result: MonteCarloResult \| null }` | `simulations` store |
| `metrics`      | `Map<string, MetricsResult>`               | Computed via worker   |

### Sync pattern

```typescript
// Example: assets store
import { writable } from 'svelte/store';
import * as db from '$lib/storage/assets';

export const assets = writable<Asset[]>([]);

export async function loadAssets() {
  assets.set(await db.getAll());
}

export async function addAsset(asset: Asset) {
  await db.put(asset);
  assets.update((list) => [...list, asset]);
}
```

When an asset or portfolio changes, the relevant store update triggers a metrics recalculation via the worker (debounced).

---

## 6. Module Interfaces

```typescript
// --- Core data types ---

interface PricePoint {
  date: string;   // ISO 8601 date (YYYY-MM-DD)
  close: number;
}

interface Asset {
  id: string;
  name: string;
  isin: string | null;
  wkn: string | null;
  currency: string;
  prices: PricePoint[];
  formatConfig: DetectedFormat | null;
  createdAt: string;
  updatedAt: string;
}

interface Portfolio {
  id: string;
  name: string;
  allocations: Array<{ assetId: string; weight: number }>;
  isBenchmark: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CurrencyRate {
  pair: string;           // e.g. "USDEUR"
  rates: Array<{ date: string; rate: number }>;
}

// --- Metrics ---

interface PeriodMetrics {
  cumulativeReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

interface MetricsResult {
  assetId: string;
  periods: Record<'1y' | '3y' | '5y' | '10y' | '15y' | 'all', PeriodMetrics | null>;
}

interface CorrelationMatrix {
  assetIds: string[];
  matrix: number[][];     // assetIds.length x assetIds.length
}

// --- Monte Carlo ---

interface MonteCarloConfig {
  simulationCount: number;
  assetIds: string[];
  riskFreeRate: number;
  benchmarkPortfolioId: string | null;
}

interface SimulatedPortfolio {
  weights: Record<string, number>;   // assetId -> weight
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
}

interface MonteCarloResult {
  portfolios: SimulatedPortfolio[];
  efficientFrontier: SimulatedPortfolio[];
}

// --- CSV Parsing ---

interface DetectedFormat {
  delimiter: string;          // ',' | ';' | '\t'
  decimalSeparator: string;   // '.' | ','
  dateFormat: string;         // e.g. 'DD.MM.YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'
  hasHeader: boolean;
  dateColumn: number;
  closeColumn: number;
}

interface ParseResult {
  prices: PricePoint[];
  detectedFormat: DetectedFormat;
  warnings: string[];
  rowCount: number;
}

// --- Worker Messages ---
// See section 3 for full worker message types.
```

---

## 7. Component Hierarchy

```
+layout.svelte
├── Shell.svelte (app chrome)
│   ├── Nav.svelte (sidebar navigation)
│   └── ThemeToggle.svelte
│
├── / (Dashboard)
│   ├── AssetSummaryCard.svelte
│   └── PortfolioSummaryCard.svelte
│
├── /assets
│   ├── AssetList.svelte
│   ├── FileDropzone.svelte
│   └── FormatConfigModal.svelte
│
├── /assets/[id]
│   ├── AssetHeader.svelte
│   ├── MetricsTable.svelte
│   ├── PriceChart.svelte
│   └── DrawdownChart.svelte
│
├── /portfolios
│   ├── PortfolioList.svelte
│   └── PortfolioCreateModal.svelte
│
├── /portfolios/[id]
│   ├── AllocationEditor.svelte
│   ├── MetricsTable.svelte
│   ├── PerformanceChart.svelte
│   └── CorrelationMatrix.svelte
│
├── /simulation
│   ├── SimulationConfig.svelte
│   ├── ProgressBar.svelte
│   ├── EfficientFrontier.svelte
│   └── PortfolioInspector.svelte
│
└── /settings
    └── SettingsForm.svelte
```

### Theming

CSS custom properties defined on `:root` control the palette. A `data-theme` attribute on `<html>` toggles between `light` and `dark`.

```css
:root {
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f5f5f5;
  --color-text-primary: #3c3f44;
  --color-text-muted: #b4b8bf;
  --color-accent: #8dd0c4;
  --color-accent-deep: #1a8a8a;
  --color-negative: #e8175d;
  --color-border: #b4b8bf;
}

[data-theme='dark'] {
  --color-bg-primary: #3c3f44;
  --color-bg-secondary: #2e3035;
  --color-text-primary: #f0f0f0;
  --color-text-muted: #b4b8bf;
  --color-accent: #8dd0c4;
  --color-accent-deep: #1a8a8a;
  --color-negative: #e8175d;
  --color-border: #555860;
}
```

The theme preference is persisted in IndexedDB settings and applied on load.

---

## 8. Performance Considerations

### Web Worker pooling

Monte Carlo simulations with large `simulationCount` values are split across multiple workers. The pool size matches `navigator.hardwareConcurrency` (capped at 8). Each worker processes a chunk of `simulationCount / poolSize` simulations. Results are merged on the main thread.

### Chunked processing for large datasets

When parsing large CSV files (100k+ rows), parsing is done in chunks of 10,000 rows using `requestIdleCallback` or `setTimeout(0)` to avoid blocking the main thread. A progress indicator is shown during parsing.

### Debounced recalculations

Portfolio allocation changes trigger metrics recalculation. These are debounced (300ms) so rapid slider adjustments do not flood the worker with requests. Only the most recent configuration is computed.

### Chart performance

uPlot is chosen specifically for its performance with large datasets (handles millions of points). Chart data is passed by reference where possible rather than copying arrays.

### Memory management

Simulation results can be large. Only the most recent simulation result per configuration is kept in memory. Older results are available in IndexedDB but not loaded into stores until requested. Workers are terminated when idle to free memory.
