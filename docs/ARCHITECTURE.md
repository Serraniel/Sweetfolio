# Sweetfolio Architecture

Sweetfolio is a fully client-side portfolio planning, backtesting, and Monte Carlo simulation application. All computation happens in the browser. Data persists in IndexedDB across sessions.

Tech stack: SvelteKit (static adapter, SPA mode), TypeScript, Svelte 5 (runes), uPlot, Web Workers, IndexedDB.

---

## 1. Project Structure

```
src/
  app.css                        # Global styles, CSS custom properties, light/dark theme
  app.html                       # HTML shell
  app.d.ts                       # SvelteKit type declarations
  routes/                        # SvelteKit pages
    +layout.svelte               # Root layout (imports Shell, initializes stores)
    +layout.ts                   # prerender=true, ssr=false (SPA mode)
    +page.svelte                 # / — Dashboard
    assets/
      +page.svelte               # /assets — Asset list, CSV upload, format preview
      [id]/
        +page.svelte             # /assets/:id — Asset detail + metrics + charts
        +page.ts                 # Load function for asset ID
    portfolios/
      +page.svelte               # /portfolios — Portfolio list, create
      [id]/
        +page.svelte             # /portfolios/:id — Portfolio detail + backtest
        +page.ts                 # Load function for portfolio ID
    simulation/
      +page.svelte               # /simulation — Monte Carlo config + results
    settings/
      +page.svelte               # /settings — Currency, preferences
  lib/
    types/
      index.ts                   # All TypeScript interfaces and type definitions
    components/
      layout/
        Shell.svelte             # App chrome (sidebar + main content area)
        Nav.svelte               # Sidebar navigation with collapsible state
        ThemeToggle.svelte       # Light/dark mode toggle
      shared/
        Button.svelte            # Reusable button component
        Card.svelte              # Glass-morphism card wrapper
        FileDropzone.svelte      # Drag-and-drop CSV file upload zone
        FormatConfigModal.svelte # CSV format review/correction modal
        MetricsTable.svelte      # Period metrics display table
        Modal.svelte             # Generic modal wrapper
    charts/                      # uPlot wrapper components
      utils.ts                   # Shared chart utilities (colors, axes, tooltip plugin, resize observer)
      PriceChart.svelte          # Multi-series price chart with zoom
      PerformanceChart.svelte    # Normalized performance comparison chart
      CorrelationMatrix.svelte   # N×N heatmap of Pearson correlations
      EfficientFrontier.svelte   # Scatter plot (volatility vs return) with frontier overlay
      DrawdownChart.svelte       # Peak-to-trough drawdown chart
      AllocationChart.svelte     # Portfolio allocation visualization
    stores/                      # Svelte writable stores
      init.ts                    # One-time hydration: loads assets, portfolios, settings
      assets.ts                  # Asset[] store with CRUD helpers
      portfolios.ts              # Portfolio[] store with CRUD helpers
      currencies.ts              # CurrencyRate[] store with CRUD helpers
      settings.ts                # Record<string, unknown> settings store
      simulation.ts              # SimulationState store (config, result, progress, running)
      metrics.ts                 # Map<string, MetricsResult> + CorrelationMatrix stores
      theme.ts                   # Theme store (localStorage-backed, not IndexedDB)
    engine/                      # Financial calculation modules (pure functions)
      returns.ts                 # Log returns, cumulative return, annualized return
      volatility.ts              # Annualized std dev of daily log returns
      sharpe.ts                  # Sharpe ratio
      drawdown.ts                # Max drawdown + drawdown series
      correlation.ts             # Pearson correlation matrix on aligned log returns
      portfolio.ts               # Weighted portfolio price series construction
      currency.ts                # Currency conversion with forward-filled rates
      metrics.ts                 # Orchestrator: computes all metrics for all periods
    workers/                     # Web Workers
      manager.ts                 # Worker factory functions + one-shot promise wrappers
      calc.worker.ts             # Metrics + correlation calculation worker
      montecarlo.worker.ts       # Monte Carlo simulation worker
    storage/                     # IndexedDB layer (thin wrappers over IDBDatabase)
      db.ts                      # Database init, version management, transaction helper
      assets.ts                  # Asset CRUD (getAll, getById, put, remove)
      portfolios.ts              # Portfolio CRUD
      currencies.ts              # Currency rate CRUD
      settings.ts                # Key-value settings CRUD
      simulations.ts             # Simulation result CRUD
    parsers/                     # CSV parsing pipeline
      csv.ts                     # Core CSV row parser (handles quoting, delimiters)
      format-detection.ts        # Auto-detect delimiter, date format, decimal separator, columns
      normalization.ts           # Orchestrator: detect + parse + normalize to PricePoint[]
    utils/                       # Shared utilities
      dates.ts                   # Forward-fill, align series, date arithmetic
      math.ts                    # mean, variance, stddev, covariance, pearsonCorrelation, logReturns
static/
  favicon.svg
```

---

## 2. Data Flow

```
CSV File
  │
  ▼
Format Detection (detect delimiter, date format, decimal separator, columns)
  │
  ▼
FormatConfigModal (user reviews/corrects detected format)
  │
  ▼
CSV Parser + Normalization (parse rows → PricePoint[])
  │
  ▼
IndexedDB (persist asset with price history)
  │
  ├──────────────────────────────────┐
  ▼                                  ▼
Svelte Store (assets, portfolios)    Web Worker (one-shot: calculate metrics)
  │                                  │
  │                                  ▼
  │                            Metrics Store (Map<assetId, MetricsResult>)
  │                                  │
  ▼                                  ▼
UI Components ◄──────────────── Reactive binding
  │
  ▼
uPlot Charts
```

### Reactive update chain

1. User uploads CSV or modifies portfolio allocations.
2. Format detection runs; user reviews the detected format in `FormatConfigModal`.
3. On confirm, data is parsed via `normalization.parseCSV()` and written to IndexedDB via the storage layer.
4. The relevant Svelte store is updated (written to IndexedDB first, then store updated in-memory).
5. Components subscribed to the store re-render via Svelte 5 runes (`$derived`, `$effect`).
6. For heavy computations (metrics, correlation, Monte Carlo), a one-shot Web Worker is created via `workers/manager.ts`.
7. The worker posts results back; a callback updates the metrics/simulation store, and the worker is terminated.
8. Chart components react to the updated store and re-render via uPlot.

---

## 3. Web Worker Protocol

Workers communicate via `postMessage` with typed message objects. Each message has a `type` discriminant. All types are defined in `src/lib/types/index.ts`.

### Worker instantiation

Workers are imported using Vite's `?worker` suffix in `workers/manager.ts`:

```typescript
import CalcWorkerModule from './calc.worker?worker';
import MonteCarloWorkerModule from './montecarlo.worker?worker';

export function createCalcWorker(): Worker {
  return new CalcWorkerModule();
}
```

The manager provides **one-shot promise wrappers** that create a worker, send a request, wait for the response, then terminate the worker:

```typescript
export function calculateMetrics(assetId, prices, riskFreeRate): Promise<MetricsResult>
export function calculateCorrelation(assets): Promise<CorrelationMatrix>
```

### Message types (main thread → calc worker)

```typescript
type CalcWorkerRequest =
  | {
      type: 'calculate-metrics';
      payload: { assetId: string; prices: PricePoint[]; riskFreeRate: number };
    }
  | {
      type: 'calculate-correlation';
      payload: { assets: Array<{ id: string; prices: PricePoint[] }> };
    };
```

### Message types (calc worker → main thread)

```typescript
type CalcWorkerResponse =
  | { type: 'metrics-result'; payload: { assetId: string; result: MetricsResult } }
  | { type: 'correlation-result'; payload: CorrelationMatrix }
  | { type: 'error'; payload: { message: string } };
```

### Message types (main thread → Monte Carlo worker)

```typescript
type MonteCarloWorkerRequest = {
  type: 'run-simulation';
  payload: {
    config: MonteCarloConfig;
    assets: Array<{ id: string; prices: PricePoint[] }>;
  };
};
```

### Message types (Monte Carlo worker → main thread)

```typescript
type MonteCarloWorkerResponse =
  | { type: 'simulation-progress'; payload: { completed: number; total: number } }
  | { type: 'simulation-result'; payload: MonteCarloResult }
  | { type: 'error'; payload: { message: string } };
```

Progress is reported every 500 simulations. The simulation page manages the worker lifecycle directly (create, listen, terminate on complete or cancel).

---

## 4. IndexedDB Schema

Database name: `sweetfolio`, version: `1`. Managed by `storage/db.ts` with a singleton `IDBDatabase` instance.

### Object Stores

#### `assets`

| Field          | Type                     | Notes                             |
| -------------- | ------------------------ | --------------------------------- |
| `id`           | `string` (UUID)          | Primary key                       |
| `name`         | `string`                 |                                   |
| `isin`         | `string \| null`         |                                   |
| `wkn`          | `string \| null`         |                                   |
| `currency`     | `string`                 | ISO 4217 code                     |
| `prices`       | `PricePoint[]`           | `{ date: string, close: number }` |
| `formatConfig` | `DetectedFormat \| null` | Stored so re-imports can reuse    |
| `createdAt`    | `string`                 | ISO date                          |
| `updatedAt`    | `string`                 | ISO date                          |

Indexes: `by-isin` on `isin`, `by-name` on `name`.

#### `portfolios`

| Field         | Type                                         | Notes            |
| ------------- | -------------------------------------------- | ---------------- |
| `id`          | `string` (UUID)                              | Primary key      |
| `name`        | `string`                                     |                  |
| `allocations` | `Array<{ assetId: string, weight: number }>` | Weights sum to 1 |
| `isBenchmark` | `boolean`                                    |                  |
| `createdAt`   | `string`                                     |                  |
| `updatedAt`   | `string`                                     |                  |

Indexes: `by-name` on `name`.

#### `currencies`

| Field   | Type                                    | Notes                      |
| ------- | --------------------------------------- | -------------------------- |
| `pair`  | `string`                                | Primary key, e.g. `USDEUR` |
| `rates` | `Array<{ date: string, rate: number }>` |                            |

No indexes.

#### `settings`

| Field   | Type      | Notes       |
| ------- | --------- | ----------- |
| `key`   | `string`  | Primary key |
| `value` | `unknown` |             |

Known keys: `mainCurrency`, `riskFreeRate`.

#### `simulations`

| Field       | Type               | Notes       |
| ----------- | ------------------ | ----------- |
| `id`        | `string` (UUID)    | Primary key |
| `config`    | `MonteCarloConfig` |             |
| `results`   | `MonteCarloResult` |             |
| `createdAt` | `string`           |             |

No indexes.

---

## 5. Svelte Store Architecture

All stores are writable Svelte stores (Svelte 5). They are hydrated from IndexedDB on app startup via `stores/init.ts` and kept in sync with writes.

### Store initialization

`initStores()` is called once from `+layout.svelte` on mount. It loads assets, portfolios, and settings in parallel. Currencies are loaded separately when needed. The theme store is independent (uses `localStorage`).

```typescript
// stores/init.ts
export async function initStores(): Promise<void> {
  if (initialized) return;
  initialized = true;
  await Promise.all([loadAssets(), loadPortfolios(), loadSettings()]);
}
```

### Store inventory

| Store              | Type                              | Populated from        | Notes                              |
| ------------------ | --------------------------------- | --------------------- | ---------------------------------- |
| `assets`           | `Asset[]`                         | `assets` object store | CRUD via `addAsset`, `updateAsset`, `removeAsset` |
| `portfolios`       | `Portfolio[]`                     | `portfolios` store    | CRUD via `addPortfolio`, `updatePortfolio`, `removePortfolio` |
| `currencies`       | `CurrencyRate[]`                  | `currencies` store    | CRUD via `addCurrencyRate`, `removeCurrencyRate` |
| `settings`         | `Record<string, unknown>`         | `settings` store      | Key-value via `setSetting`, `removeSetting` |
| `simulation`       | `SimulationState`                 | In-memory only        | `{ config, result, progress, running }` |
| `metrics`          | `Map<string, MetricsResult>`      | Computed via worker   | `setMetrics`, `clearMetrics` |
| `correlationMatrix`| `CorrelationMatrix \| null`       | Computed via worker   | `setCorrelationMatrix` |
| `theme`            | `'light' \| 'dark'`              | `localStorage`        | Not IndexedDB; uses `data-theme` attribute |

### Sync pattern

Each store follows the same pattern: write to IndexedDB first, then update the in-memory store.

```typescript
// Example: assets store
export async function addAsset(asset: Asset): Promise<void> {
  await db.put(asset);
  assets.update((list) => [...list, asset]);
}
```

---

## 6. Module Interfaces

All types are centralized in `src/lib/types/index.ts`.

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

interface SettingEntry {
  key: string;
  value: unknown;
}

interface StoredSimulation {
  id: string;
  config: MonteCarloConfig;
  results: MonteCarloResult;
  createdAt: string;
}

// --- Metrics ---

type PeriodKey = '1y' | '3y' | '5y' | '10y' | '15y' | 'all';

interface PeriodMetrics {
  cumulativeReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

interface MetricsResult {
  assetId: string;
  periods: Record<PeriodKey, PeriodMetrics | null>;
}

interface CorrelationMatrix {
  assetIds: string[];
  matrix: number[][];     // assetIds.length × assetIds.length
}

// --- Monte Carlo ---

interface MonteCarloConfig {
  simulationCount: number;
  assetIds: string[];
  riskFreeRate: number;
  benchmarkPortfolioId: string | null;
}

interface SimulatedPortfolio {
  weights: Record<string, number>;   // assetId → weight
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
  ambiguous?: boolean;        // true when DD/MM vs MM/DD cannot be distinguished
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

The app uses Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`, `$bindable`) throughout.

```
+layout.svelte (imports app.css, calls initStores on mount)
├── Shell.svelte (flex layout: sidebar + main)
│   ├── Nav.svelte (fixed sidebar, collapsible, active route highlighting)
│   │   └── ThemeToggle.svelte (light/dark toggle)
│   └── <main> slot → routes
│
├── / (Dashboard — +page.svelte)
│   ├── Card.svelte (summary: asset count, portfolio count, simulation count)
│   └── Card.svelte (quick actions: Upload, Create Portfolio, Run Simulation)
│
├── /assets (+page.svelte)
│   ├── FileDropzone.svelte (drag-and-drop CSV upload)
│   ├── FormatConfigModal.svelte (format review: delimiter, date, decimal, columns)
│   ├── Card.svelte (asset table: name, ISIN, currency, data points, date range)
│   └── Button.svelte (delete asset)
│
├── /assets/[id] (+page.svelte)
│   ├── MetricsTable.svelte (period metrics: 1y/3y/5y/10y/15y/all)
│   ├── PriceChart.svelte (uPlot price history)
│   └── DrawdownChart.svelte (uPlot drawdown chart)
│
├── /portfolios (+page.svelte)
│   ├── Card.svelte (portfolio list)
│   └── Modal.svelte (create portfolio)
│
├── /portfolios/[id] (+page.svelte)
│   ├── MetricsTable.svelte (portfolio metrics)
│   ├── PerformanceChart.svelte (normalized comparison)
│   ├── CorrelationMatrix.svelte (heatmap)
│   └── AllocationChart.svelte (allocation visualization)
│
├── /simulation (+page.svelte)
│   ├── Config panel (simulation count input, asset checkboxes)
│   ├── Progress bar (inline, reactive to simulation.progress)
│   ├── EfficientFrontier.svelte (scatter plot with frontier overlay)
│   └── Portfolio Inspector (metrics + allocation breakdown)
│
└── /settings (+page.svelte)
    └── Settings form (main currency, risk-free rate)
```

### Theming

CSS custom properties are defined on `:root` (light, default) and `[data-theme='dark']` in `app.css`. The `theme` store (in `stores/theme.ts`) uses `localStorage` for persistence and sets the `data-theme` attribute on `<html>`.

The theme store also checks `prefers-color-scheme` media query as fallback when no stored preference exists.

Key palette colors:

| Variable             | Light               | Dark                |
| -------------------- | ------------------- | ------------------- |
| `--color-bg-primary` | `#f8f9fa`           | `#1e2025`           |
| `--color-bg-secondary` | `#ffffff`         | `#2a2c31`           |
| `--color-text-primary` | `#2e3035`         | `#eaebed`           |
| `--color-accent`     | `#1a8a8a` (deep teal) | `#8dd0c4` (miku teal) |
| `--color-negative`   | `#e8175d` (hot pink)  | `#f04e7f`           |

Glass-morphism effects use `backdrop-filter: blur()` with semi-transparent backgrounds for cards and the sidebar.

---

## 8. Engine Module Details

### CSV Parser (`parsers/`)

The parsing pipeline has three stages:

1. **`csv.ts`** — Row-level parser. Splits text into lines, handles quoted fields and escaped quotes. Returns `string[][]`.
2. **`format-detection.ts`** — Auto-detects format from a sample of up to 20 rows:
   - Delimiter: semicolon prioritized for EU CSVs
   - Decimal separator: comma prioritized when ambiguous (EU)
   - Date format: supports `DD.MM.YYYY`, `DD-MM-YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, `MM/DD/YYYY`, `MM-DD-YYYY`
   - Header detection: compares numeric density of first vs second row
   - Close column: matches header keywords (`close`, `schluss`, `kurs`, `price`, etc.) or picks last numeric column
   - Sets `ambiguous: true` when DD/MM and MM/DD formats match equally well
3. **`normalization.ts`** — Orchestrates: auto-detect, apply optional format overrides, parse all rows into `PricePoint[]`, sort by date ascending.

### Financial Engine (`engine/`)

All engine modules operate on `PricePoint[]` arrays and are pure functions with no side effects.

- **`returns.ts`** — `computeLogReturns(prices)`: `ln(P[t]/P[t-1])`, skips non-positive prices. `cumulativeReturn(prices)`: `(P_end/P_start) - 1`. `annualizedReturn(prices)`: uses calendar-to-trading-day conversion (252/365.25 ratio).
- **`volatility.ts`** — `annualizedVolatility(prices)`: sample stddev (N-1) of daily log returns times `sqrt(252)`.
- **`sharpe.ts`** — `sharpeRatio(prices, riskFreeRate)`: `(annualizedReturn - riskFreeRate) / annualizedVolatility`. Returns 0 if volatility is 0.
- **`drawdown.ts`** — `maxDrawdown(prices)`: largest peak-to-trough decline as negative fraction. `drawdownSeries(prices)`: full drawdown series for charting.
- **`correlation.ts`** — `computeCorrelationMatrix(assets)`: aligns price series via forward-fill, computes log returns, builds N×N Pearson correlation matrix. Delegates math to `utils/math.ts`.
- **`portfolio.ts`** — `computePortfolioPrices(assets)`: aligns constituent price series, rebases each to 100, combines using normalized weights.
- **`currency.ts`** — `convertPrices(prices, currencyRate, source, target)`: handles direct and inverse currency pairs, uses binary search for forward-fill of missing rate dates.
- **`metrics.ts`** — `computeAllMetrics(assetId, prices, riskFreeRate)`: computes `PeriodMetrics` for each of 1y/3y/5y/10y/15y/all periods. Returns null for periods with insufficient data (<2 points).

### Math Utilities (`utils/math.ts`)

All statistical functions are pure TypeScript with no external dependencies:

- `mean(values)` — Arithmetic mean
- `variance(values, population?)` — Sample variance (N-1) by default
- `stddev(values, population?)` — Square root of variance
- `covariance(x, y, population?)` — Sample covariance (N-1) by default
- `pearsonCorrelation(x, y)` — `covariance / (stddev_x * stddev_y)`
- `logReturns(prices)` — `ln(P[i] / P[i-1])` on numeric arrays

### Date Utilities (`utils/dates.ts`)

- `forwardFillPrices(prices)` — Fills gaps in price series, **skipping weekends** (Saturday/Sunday)
- `alignPriceSeries(seriesArray)` — Forward-fills each series, then intersects dates across all series. Returns aligned numeric arrays for correlated calculations.
- `subtractYears(dateStr, years)` — Date arithmetic for period filtering
- `filterByDateRange(prices, start, end)` — Inclusive date range filter
- `daysBetween(start, end)` — Calendar days between two ISO dates

### Monte Carlo Worker (`workers/montecarlo.worker.ts`)

Single-worker architecture (not pooled). Process:

1. Aligns all asset price series and computes log returns
2. Pre-computes annualized mean returns and covariance matrix
3. For each of N simulations:
   - Generates random weights via Dirichlet distribution (`-ln(U)` for exponential variates, normalized)
   - Computes portfolio return: `sum(w_i * mean_return_i)`
   - Computes portfolio variance: `w' * Cov * w`, then `volatility = sqrt(variance * 252)`
   - Computes Sharpe ratio: `(return - riskFreeRate) / volatility`
4. Reports progress every 500 simulations via `simulation-progress` messages
5. Extracts efficient frontier: buckets portfolios by volatility (up to 100 buckets), keeps max return per bucket

---

## 9. Chart Components (`charts/`)

All chart components use uPlot for rendering. Shared configuration is in `charts/utils.ts`:

- **Color palette**: Miku teal series colors, hot pink for benchmarks
- **`baseAxes()`**: Theme-aware axis configuration
- **`tooltipPlugin()`**: Custom tooltip with glass-morphism styling, formatted for `de-DE` locale
- **`createResizeObserver()`**: Responsive width tracking, height = `max(250, width * 0.5)`
- **`observeThemeChanges()`**: MutationObserver on `data-theme` attribute to re-render charts on theme switch

Charts follow a common pattern: build uPlot data + options, create chart, observe resize/theme, destroy on cleanup. All use Svelte 5 `$effect` for lifecycle management.

---

## 10. Performance Considerations

### One-shot worker pattern

Rather than maintaining a worker pool, the current implementation creates a fresh worker for each computation and terminates it upon completion. This simplifies lifecycle management at the cost of worker startup overhead. For metrics calculations (via `workers/manager.ts`), the one-shot promise wrapper handles the full lifecycle.

For Monte Carlo simulations, the simulation page manages the worker directly, allowing real-time progress updates and user-initiated cancellation.

### Chart performance

uPlot is chosen for its performance with large datasets. Charts use `Float64Array` for timestamp data. Resize is handled via `ResizeObserver` to avoid unnecessary redraws. Theme changes trigger a full chart rebuild.

### Forward-fill with weekend skipping

The `forwardFillPrices` function skips Saturday and Sunday when filling gaps, avoiding artificial data inflation from non-trading days. This ensures aligned series have consistent trading-day spacing.
