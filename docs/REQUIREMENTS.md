# Sweetfolio — Requirements Document

## Project Overview

Sweetfolio is a client-side portfolio planning, backtesting, and Monte Carlo simulation web application for retail investors. All computation happens in the browser. Data persists in IndexedDB across sessions.

- **Target audience**: German/European retail investors (ISIN-based securities, EU date/number format priority)
- **Platform**: Desktop-optimized, mobile-friendly
- **Processing**: Client-side only, no server-side computation
- **Dependencies**: Lightweight, minimal
- **License**: EUPL-1.2

---

## Implementation Status Legend

Each user story is annotated with its current implementation status:

- **IMPLEMENTED** — Feature is complete and functional in the codebase
- **PARTIAL** — Core logic exists but UI integration or edge cases are incomplete
- **NOT STARTED** — Feature has not yet been implemented

---

## Epic 1: Asset Management

### User Stories

**AM-1: CSV Upload** `IMPLEMENTED`
As a user, I want to upload CSV files containing historical price data so that I can analyze my assets.

Acceptance Criteria:
- User can upload one or more CSV files via drag-and-drop or file picker
- Multiple uploads are supported; each upload creates or updates an asset
- CSV must contain at minimum a date column and a price/close column
- System displays a preview of parsed data before confirming the import
- Quoted fields and escaped quotes in CSV are handled correctly
- Empty rows are silently skipped during parsing

> **Note**: Multi-file drag-and-drop currently only processes the first file (known bug, see #13). Each file must be uploaded individually.

**AM-2: Locale-Aware Format Detection** `IMPLEMENTED`
As a European investor, I want the system to auto-detect my CSV's date and number formats so that I do not have to manually configure parsing.

Acceptance Criteria:
- Date format detection supports at least: `DD-MM-YYYY`, `MM-DD-YYYY`, `DD.MM.YYYY`, `YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`
- Number format detection distinguishes decimal comma (`1.234,56`) from decimal point (`1,234.56`)
- Delimiter detection supports comma (`,`), semicolon (`;`), and tab (`\t`)
- Detection uses heuristics on the first N rows of data
- EU formats (`DD.MM.YYYY`, decimal comma) are prioritized in ambiguous cases
- When date format is ambiguous (DD/MM vs MM/DD cannot be distinguished), the `ambiguous` flag is set on the detected format

**AM-3: Format Correction** `IMPLEMENTED`
As a user, I want to manually correct the detected date/number format if auto-detection is wrong.

Acceptance Criteria:
- After auto-detection, user sees the detected formats displayed clearly in a modal dialog
- User can override date format, decimal separator, delimiter, and column assignments via dropdown selectors
- User can set the asset name and currency during import
- Changing the format re-parses and re-previews the data immediately
- A tabular preview of the first 10 rows is shown for verification

**AM-4: Asset Metadata** `PARTIAL`
As a user, I want to assign ISIN, WKN, name, and currency to each asset.

Acceptance Criteria:
- Each asset stores: name, ISIN (optional), WKN (optional), currency
- ISIN is validated as a 12-character alphanumeric code
- WKN is validated as a 6-character alphanumeric code
- Currency is selectable from a list of common currencies (EUR, USD, GBP, CHF, JPY, CAD, AUD, SEK, NOK, DKK)

> **Gap**: Name and currency are set during import. ISIN and WKN fields exist in the data model but are not editable from the UI during or after import — they are stored as `null`. ISIN/WKN validation is defined in the acceptance criteria but not yet enforced in code.

**AM-5: Asset List and Management** `PARTIAL`
As a user, I want to view, edit, and delete my assets.

Acceptance Criteria:
- Asset list page shows all uploaded assets with name, ISIN, currency, date range, and data point count
- User can edit asset metadata (name, ISIN, WKN, currency)
- User can delete an asset (with confirmation dialog)
- Deleting an asset removes it from any portfolios that reference it

> **Gap**: Asset list displays correctly. Delete with confirmation works. Inline editing of asset metadata (name, ISIN, WKN, currency) is not yet implemented — there is no edit UI. Cascade-delete from portfolios is not yet implemented.

---

## Epic 2: Financial Metrics

### User Stories

**FM-1: Performance Calculation** `IMPLEMENTED`
As a user, I want to see cumulative and annualized performance for each asset.

Acceptance Criteria:
- Cumulative performance: `(P_end / P_start) - 1` expressed as percentage
- Annualized performance: `(1 + cumulative)^(365.25/days) - 1`
- Calculated for time windows: 1, 3, 5, 10, 15 years and ALL available data
- If the asset has fewer data points than a given window requires, that window is `null`
- Computed on daily price data
- Displayed in a summary table on the asset detail page

**FM-2: Volatility** `IMPLEMENTED`
As a user, I want to see the annualized volatility for each asset.

Acceptance Criteria:
- Volatility is the annualized standard deviation of daily logarithmic returns
- Standard deviation uses sample statistics (N-1 denominator)
- Annualization factor: `sqrt(252)` (trading days per year)
- Calculated for the same time windows: 1, 3, 5, 10, 15, ALL years
- Displayed alongside performance metrics in the metrics table

**FM-3: Sharpe Ratio** `IMPLEMENTED`
As a user, I want to see the Sharpe ratio to understand risk-adjusted returns.

Acceptance Criteria:
- Sharpe ratio: `(annualized return - risk-free rate) / annualized volatility`
- Risk-free rate defaults to 0% and is user-configurable in settings
- Calculated for the same time windows: 1, 3, 5, 10, 15, ALL years
- Returns 0 when volatility is 0 to avoid division by zero

**FM-4: Maximum Drawdown** `IMPLEMENTED`
As a user, I want to see the maximum drawdown to understand worst-case loss scenarios.

Acceptance Criteria:
- Max drawdown: largest peak-to-trough decline in price, expressed as negative percentage
- Calculated for each time window: 1, 3, 5, 10, 15, ALL years
- Drawdown chart (area chart) available on asset detail page
- Drawdown is always <= 0 (a 30% decline is shown as -30%)

**FM-5: Heavy Computation in Web Workers** `IMPLEMENTED`
As a user, I want calculations to not freeze the UI.

Acceptance Criteria:
- All financial metric calculations run in a dedicated Web Worker (`calc.worker.ts`)
- UI shows a "Calculating metrics..." loading indicator during computation
- UI remains responsive while calculations are in progress
- Worker handles both metrics and correlation calculations

---

## Epic 3: Asset Correlation

### User Stories

**AC-1: Correlation Matrix** `IMPLEMENTED`
As a user, I want to see how my assets correlate with each other so I can diversify my portfolio.

Acceptance Criteria:
- N-to-M correlation matrix computed using Pearson correlation coefficient
- Correlation is computed on logarithmic returns: `r(t) = ln(P(t) / P(t-1))`
- Pearson coefficient formula: `rho = Cov(rX, rY) / (sigma_X * sigma_Y)`
- Covariance uses sample statistics (N-1 denominator)
- Missing dates are forward-filled before computation (last known price carried forward, weekends skipped)
- Date ranges are aligned across all selected assets (intersection of available dates)
- Matrix displayed as a color-coded heatmap chart component

**AC-2: Asset Selection for Correlation** `PARTIAL`
As a user, I want to select which assets to include in the correlation matrix.

Acceptance Criteria:
- User can select 2 or more assets to compare
- Default selection includes all assets
- Matrix updates when selection changes

> **Gap**: The correlation matrix component (`CorrelationMatrix.svelte`) exists and renders. However, there is no dedicated page or UI widget for asset selection — the correlation matrix is not yet surfaced on any page route.

---

## Epic 4: Portfolio Management

### User Stories

**PM-1: Portfolio Creation** `IMPLEMENTED`
As a user, I want to build portfolios by combining assets with specific weight allocations.

Acceptance Criteria:
- User can create a named portfolio via a modal dialog
- User selects assets via checkboxes and assigns percentage weights via sliders
- Weights are auto-normalized to sum to 100% when saving
- At least one asset must be selected and a name must be provided
- User can mark the portfolio as a benchmark during creation

**PM-2: Portfolio Backtesting** `PARTIAL`
As a user, I want to backtest my portfolio against historical data.

Acceptance Criteria:
- Portfolio value is computed from weighted historical prices of constituent assets
- Backtested performance is calculated from the latest common start date of all constituent assets
- All financial metrics (Epic 2) apply to portfolio time series identically to individual assets

> **Gap**: The `portfolio.ts` engine module computes weighted portfolio price series. The portfolio detail page exists but may not yet fully compute and display backtested metrics and charts in the same way the asset detail page does.

**PM-3: Portfolio Metrics** `PARTIAL`
As a user, I want to see the same financial metrics for portfolios as for individual assets.

Acceptance Criteria:
- Cumulative performance, annualized performance, volatility, Sharpe ratio, max drawdown — all computed per time window (1, 3, 5, 10, 15, ALL years)
- Portfolio detail page mirrors asset detail page layout
- Metrics are displayed in the same tabular format as asset metrics

> **Gap**: Engine support exists. The portfolio detail page (`/portfolios/[id]`) needs verification that it fully wires metrics computation and display.

**PM-4: Benchmark Designation** `PARTIAL`
As a user, I want to mark one asset or portfolio as a benchmark for comparison.

Acceptance Criteria:
- User can designate a portfolio as the benchmark via a checkbox during creation
- `isBenchmark` flag is persisted in IndexedDB
- Benchmark is visually highlighted with a badge in the portfolio list
- Benchmark appears as an overlay on comparison charts by default
- Changing the benchmark updates all relevant charts

> **Gap**: Benchmark flag is stored and displayed as a badge on portfolio cards. Benchmark overlay on charts (price, performance, efficient frontier) is not yet implemented. Only portfolios can be benchmarks — assets cannot be designated as benchmarks.

**PM-5: Portfolio List and Management** `PARTIAL`
As a user, I want to view, edit, and delete my portfolios.

Acceptance Criteria:
- Portfolio list page shows all portfolios as cards with name, asset count, and benchmark badge
- User can edit portfolio name and allocations
- User can delete a portfolio (with confirmation dialog)

> **Gap**: Portfolio list with cards, delete with confirmation, and creation are implemented. Editing an existing portfolio's name and allocations is not yet implemented — there is no edit UI.

---

## Epic 5: Monte Carlo Simulation

### User Stories

**MC-1: Simulation Configuration** `IMPLEMENTED`
As a user, I want to configure and run Monte Carlo simulations to explore portfolio possibilities.

Acceptance Criteria:
- User can set the number of simulations (range: 100 to 100,000, step: 100)
- User selects which assets to include via checkboxes (minimum 2)
- Simulation generates random weight vectors using Dirichlet distribution (non-negative, summing to 1.0)
- Each simulated portfolio's return and volatility are computed from historical covariance matrix
- Risk-free rate from settings is used for Sharpe ratio calculation

**MC-2: Efficient Frontier Visualization** `IMPLEMENTED`
As a user, I want to see the efficient frontier to identify optimal portfolios.

Acceptance Criteria:
- Scatter plot with X-axis = annualized volatility, Y-axis = annualized return
- Each dot represents one simulated portfolio
- Efficient frontier line is extracted: for each of up to 100 volatility buckets, keep the portfolio with the highest return
- Toggle option to color/size dots by Sharpe ratio
- Benchmark portfolio is overlaid and highlighted on the chart

> **Note**: Benchmark overlay on the efficient frontier chart is defined but not yet wired to a real benchmark portfolio.

**MC-3: Portfolio Inspection** `IMPLEMENTED`
As a user, I want to click on simulated portfolios to see their allocations.

Acceptance Criteria:
- Clicking a dot on the scatter plot shows a side panel with the portfolio's asset allocations (weights)
- Panel displays the portfolio's annualized return, volatility, and Sharpe ratio
- Asset names are resolved from the asset store for display

**MC-4: Benchmark Comparison** `NOT STARTED`
As a user, I want to find simulated portfolios that beat my benchmark.

Acceptance Criteria:
- System identifies portfolios with higher return at the same or lower volatility as the benchmark
- System identifies portfolios with the same or higher return at lower volatility
- These portfolios are visually distinguishable on the chart (e.g., different color or marker)

**MC-5: Save Simulated Portfolios** `NOT STARTED`
As a user, I want to add promising simulated portfolios to my portfolio list.

Acceptance Criteria:
- User can select a simulated portfolio from the inspector panel and save it as a real portfolio
- Saved portfolio contains the same asset allocations as the simulation result
- Saved portfolio behaves like any manually created portfolio
- A "Save as Portfolio" button is available in the portfolio inspector panel

**MC-6: Simulation Performance** `IMPLEMENTED`
As a user, I want simulations to run efficiently without freezing the browser.

Acceptance Criteria:
- Monte Carlo simulations run in a dedicated Web Worker (`montecarlo.worker.ts`)
- Progress indicator (progress bar with percentage) shows simulation progress, updated every 500 simulations
- User can cancel a running simulation via a "Cancel" button
- Worker is terminated on cancel to free resources

---

## Epic 6: Currency Support

### User Stories

**CU-1: Main Currency Configuration** `IMPLEMENTED`
As a user, I want to set a main currency so all values are shown in a consistent unit.

Acceptance Criteria:
- User can configure a main/display currency in settings (default: EUR)
- Supported currencies: EUR, USD, GBP, CHF, JPY, CAD, AUD, SEK, NOK, DKK
- Setting is persisted in IndexedDB
- All monetary values, returns, and charts are displayed in the main currency

> **Note**: The setting is saved and persisted. Automatic conversion of displayed values based on the main currency setting is not yet wired throughout all views.

**CU-2: Currency Conversion History Upload** `PARTIAL`
As a user, I want to upload historical exchange rate data so cross-currency assets are converted correctly.

Acceptance Criteria:
- User can upload CSV files with currency pair conversion rates (e.g., USD/EUR)
- Same locale-aware format detection as asset CSV uploads (Epic 1)
- Currency data is stored in the `currencies` IndexedDB object store
- Currency pairs use concatenated format (e.g., "USDEUR")

> **Gap**: The IndexedDB store and data model for currencies exist (`currencies.ts` storage module, `CurrencyRate` type). The `convertPrices` engine function is implemented with forward-fill and inverse-pair support. However, there is no UI for uploading currency rate CSV files — the settings page does not include a currency upload section.

**CU-3: Currency Conversion in Calculations** `PARTIAL`
As a user, I want all financial calculations to use converted prices in my main currency.

Acceptance Criteria:
- Asset prices are converted to the main currency before any metric calculation
- If conversion data is missing for a date, nearest available rate is used (forward-fill via binary search)
- If no conversion data exists for a currency pair, user is warned
- Inverse pairs are automatically handled (e.g., EURUSD rate can be used for USD-to-EUR conversion)

> **Gap**: The `convertPrices()` function in `currency.ts` is fully implemented and tested. However, the conversion is not yet integrated into the metrics calculation pipeline — asset prices are currently used as-is without currency conversion.

---

## Epic 7: Data Persistence

### User Stories

**DP-1: IndexedDB Storage** `IMPLEMENTED`
As a user, I want my data to persist across page reloads and return visits.

Acceptance Criteria:
- All assets, portfolios, currency data, settings, and simulation results are stored in IndexedDB
- Data survives page reload, browser restart, and return visits
- No server-side storage; all data is local to the browser
- Database name: `sweetfolio`, version: 1
- User can clear all data from the settings page (with confirmation dialog)

**DP-2: Storage Schema** `IMPLEMENTED`
The IndexedDB schema includes the following object stores:
- `assets` — `{ id, name, isin, wkn, currency, prices: [{date, close}], formatConfig, createdAt, updatedAt }`
  - Indexes: `by-isin`, `by-name`
- `portfolios` — `{ id, name, allocations: [{assetId, weight}], isBenchmark, createdAt, updatedAt }`
  - Indexes: `by-name`
- `currencies` — `{ pair, rates: [{date, rate}] }`
- `settings` — `{ key, value }`
- `simulations` — `{ id, config, results, createdAt }`

**DP-3: Data Export/Import** `NOT STARTED`
As a user, I want to export and import my data for backup or migration purposes.

Acceptance Criteria:
- User can export all data (assets, portfolios, settings) as a single JSON file
- User can import a previously exported JSON file to restore data
- Import warns before overwriting existing data

---

## Epic 8: Theming

### User Stories

**TH-1: Light and Dark Mode** `IMPLEMENTED`
As a user, I want to switch between light and dark mode.

Acceptance Criteria:
- Application supports light mode and dark mode
- User can manually toggle between modes via a switch on the settings page
- Theme toggle is also accessible from the navigation bar
- System preference (`prefers-color-scheme`) is detected on first visit
- Default fallback is dark mode when no system preference is detected
- Theme preference is persisted in IndexedDB

**TH-2: Hatsune Miku Color Palette** `IMPLEMENTED`
As a user, I want a visually appealing and consistent color scheme.

Acceptance Criteria:
- Color palette based on Hatsune Miku theme:
  - Dark Charcoal: `#3C3F44` (dark backgrounds)
  - Silver: `#B4B8BF` (muted text, borders)
  - Miku Teal: `#8DD0C4` (primary accent, positive values)
  - Deep Teal: `#1A8A8A` (secondary accent)
  - Hot Pink: `#E8175D` (highlight accent, negative values)
- Light mode: light backgrounds with teal/pink accents
- Dark mode: charcoal backgrounds with brighter teal/pink accents
- Positive values (gains) use teal; negative values (losses) use pink

**TH-3: Liquid Glass Aesthetic** `IMPLEMENTED`
As a user, I want a modern visual design.

Acceptance Criteria:
- UI uses a modern "liquid glass" aesthetic with subtle transparency, blur effects, and soft borders
- Implemented via CSS custom properties; no CSS framework dependency
- Consistent look and feel across all pages
- Card components use `backdrop-filter: blur()` and semi-transparent backgrounds

---

## Epic 9: Charts

### User Stories

**CH-1: Price History Chart** `IMPLEMENTED`
As a user, I want to see a price history chart for each asset.

Acceptance Criteria:
- Line chart showing daily closing prices over time
- Supports zooming and panning
- Supports multiple overlaid series (e.g., asset + benchmark)
- Chart renders on the asset detail page
- Benchmark asset overlaid when designated

> **Note**: Multi-series support is implemented in the component. Benchmark overlay depends on Epic 4 PM-4 completion.

**CH-2: Performance Comparison Chart** `PARTIAL`
As a user, I want to compare the performance of multiple assets/portfolios.

Acceptance Criteria:
- Normalized performance chart (rebased to 100 at start)
- Multiple assets/portfolios selectable for overlay
- Benchmark always shown and visually highlighted

> **Gap**: The `PerformanceChart.svelte` component exists. It needs to be integrated into a comparison view that allows selecting multiple assets/portfolios.

**CH-3: Correlation Heatmap** `IMPLEMENTED`
As a user, I want a visual correlation matrix.

Acceptance Criteria:
- Color-coded heatmap showing Pearson correlation values
- Color scale from negative (pink) through neutral to positive (teal)
- Hover shows exact correlation value
- Rendered using the `CorrelationMatrix.svelte` component

> **Note**: Component exists but is not yet surfaced on any page route (see AC-2).

**CH-4: Efficient Frontier Scatter Chart** `IMPLEMENTED`
As a user, I want to visualize Monte Carlo simulation results.

Acceptance Criteria:
- Scatter plot: X = volatility, Y = return
- Dot color/size optionally mapped to Sharpe ratio
- Efficient frontier line overlaid
- Benchmark position marked and highlighted
- Clickable dots showing allocation details in the inspector panel

**CH-5: Portfolio Allocation Chart** `IMPLEMENTED`
As a user, I want to see the composition of a portfolio.

Acceptance Criteria:
- Pie or donut chart showing asset weight distribution
- Labels with asset names and percentages
- Rendered using the `AllocationChart.svelte` component

**CH-6: Drawdown Chart** `IMPLEMENTED`
As a user, I want to visualize drawdown over time.

Acceptance Criteria:
- Area chart showing drawdown percentage from peak over time
- Maximum drawdown point highlighted
- Rendered on the asset detail page using `DrawdownChart.svelte`

**CH-7: Chart Library** `IMPLEMENTED`
All charts use uPlot for lightweight, high-performance rendering.

Acceptance Criteria:
- Charts are interactive (zoom, pan, hover tooltips)
- Charts are responsive and render correctly on different screen sizes
- Charts respect the active theme (light/dark mode colors)
- Chart utility functions are shared via `charts/utils.ts`

---

## Epic 10: ISIN/WKN Scraping (Best-Effort)

### User Stories

**SC-1: Automatic Price Data Fetch** `NOT STARTED`
As a user, I want to optionally fetch price data by ISIN or WKN instead of uploading a CSV.

Acceptance Criteria:
- User can enter an ISIN or WKN and trigger a data fetch attempt
- System attempts client-side requests to public financial data sources
- This feature is best-effort: it may fail due to CORS, rate limits, or API changes
- On success, fetched data is imported as if uploaded via CSV
- On failure, user receives a clear error message and can fall back to CSV upload
- No server-side proxy; all requests are made from the browser
- Feature is clearly labeled as "experimental" or "best-effort" in the UI

---

## Epic 11: Deployment

### User Stories

**DE-1: Docker Image** `IMPLEMENTED`
As a self-hoster, I want a Docker image to run Sweetfolio on my own server.

Acceptance Criteria:
- Multi-stage Docker build: Node.js build stage, nginx serving stage
- Static SvelteKit build served by nginx
- Image published to GitHub Container Registry (GHCR)
- Image is small and production-ready

**DE-2: Public Hosting** `NOT STARTED`
The application is publicly hosted at `sweetfolio.app`.

Acceptance Criteria:
- Application accessible at `https://sweetfolio.app`
- Served as a static SPA; no server-side logic required at runtime

**DE-3: CI/CD Pipeline** `IMPLEMENTED`
As a developer, I want automated build, test, and release.

Acceptance Criteria:
- GitHub Actions workflow: build, test, semantic-release, Docker build + push to GHCR
- Rolling 5-minute delay on release workflow to batch merged PRs
- Semantic versioning with conventional commits

---

## Non-Functional Requirements

### Performance
- UI remains responsive during heavy calculations (Web Workers)
- Charts render smoothly with up to 10 years of daily data (~2,500 data points per asset)
- Monte Carlo simulations of up to 100,000 portfolios complete within reasonable time

### Compatibility
- Desktop-optimized layout, but usable on mobile devices
- Supports modern browsers (Chrome, Firefox, Safari, Edge — latest 2 versions)

### Privacy
- No data leaves the browser; all processing is client-side
- No analytics, tracking, or telemetry

### Accessibility
- All interactive elements are keyboard-navigable
- Form inputs have associated labels
- Color is not the sole indicator of information (values are also shown as text)

### Technology Constraints
- SvelteKit with static adapter (SSG/SPA)
- TypeScript throughout
- Minimal dependencies; lightweight bundle size
- No CSS framework; styling via CSS custom properties

---

## Pages / Routes

| Route | Description | Status |
|---|---|---|
| `/` | Dashboard — overview of loaded assets and portfolios | IMPLEMENTED |
| `/assets` | Asset list, upload, manage | IMPLEMENTED |
| `/assets/[id]` | Single asset detail with metrics and charts | IMPLEMENTED |
| `/portfolios` | Portfolio list, create, backtest | IMPLEMENTED |
| `/portfolios/[id]` | Portfolio detail with metrics and charts | IMPLEMENTED |
| `/simulation` | Monte Carlo configuration and results | IMPLEMENTED |
| `/settings` | Currency, theme, preferences | IMPLEMENTED |

---

## Implementation Summary

| Epic | Stories | Implemented | Partial | Not Started |
|---|---|---|---|---|
| 1. Asset Management | 5 | 3 | 2 | 0 |
| 2. Financial Metrics | 5 | 5 | 0 | 0 |
| 3. Asset Correlation | 2 | 1 | 1 | 0 |
| 4. Portfolio Management | 5 | 1 | 4 | 0 |
| 5. Monte Carlo Simulation | 6 | 4 | 0 | 2 |
| 6. Currency Support | 3 | 1 | 2 | 0 |
| 7. Data Persistence | 3 | 2 | 0 | 1 |
| 8. Theming | 3 | 3 | 0 | 0 |
| 9. Charts | 7 | 6 | 1 | 0 |
| 10. ISIN/WKN Scraping | 1 | 0 | 0 | 1 |
| 11. Deployment | 3 | 2 | 0 | 1 |
| **Total** | **43** | **28** | **10** | **5** |
