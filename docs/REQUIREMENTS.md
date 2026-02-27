# Sweetfolio — Requirements Document

## Project Overview

Sweetfolio is a client-side portfolio planning, backtesting, and Monte Carlo simulation web application for retail investors. All computation happens in the browser. Data persists in IndexedDB across sessions.

- **Target audience**: German/European retail investors (ISIN-based securities, EU date/number format priority)
- **Platform**: Desktop-optimized, mobile-friendly
- **Processing**: Client-side only, no server-side computation
- **Dependencies**: Lightweight, minimal
- **License**: EUPL-1.2

---

## Epic 1: Asset Management

### User Stories

**AM-1: CSV Upload**
As a user, I want to upload CSV files containing historical price data so that I can analyze my assets.

Acceptance Criteria:
- User can upload one or more CSV files via drag-and-drop or file picker
- Multiple uploads are supported; each upload creates or updates an asset
- CSV must contain at minimum a date column and a price/close column
- System displays a preview of parsed data before confirming the import

**AM-2: Locale-Aware Format Detection**
As a European investor, I want the system to auto-detect my CSV's date and number formats so that I do not have to manually configure parsing.

Acceptance Criteria:
- Date format detection supports at least: `dd-mm-yyyy`, `mm-dd-yyyy`, `dd.mm.yyyy`, `yyyy-mm-dd`, `dd/mm/yyyy`, `mm/dd/yyyy`
- Number format detection distinguishes decimal comma (`1.234,56`) from decimal point (`1,234.56`)
- Detection uses heuristics on the first N rows of data
- EU formats (dd.mm.yyyy, decimal comma) are prioritized in ambiguous cases

**AM-3: Format Correction**
As a user, I want to manually correct the detected date/number format if auto-detection is wrong.

Acceptance Criteria:
- After auto-detection, user sees the detected formats displayed clearly
- User can override date format and number format via dropdown selectors
- Changing the format re-parses and re-previews the data immediately

**AM-4: Asset Metadata**
As a user, I want to assign ISIN, WKN, name, and currency to each asset.

Acceptance Criteria:
- Each asset stores: name, ISIN (optional), WKN (optional), currency
- ISIN is validated as a 12-character alphanumeric code
- WKN is validated as a 6-character alphanumeric code
- Currency is selectable from a list of common currencies (EUR, USD, GBP, CHF, etc.)

**AM-5: Asset List and Management**
As a user, I want to view, edit, and delete my assets.

Acceptance Criteria:
- Asset list page shows all uploaded assets with name, ISIN, WKN, currency, date range, and data point count
- User can edit asset metadata (name, ISIN, WKN, currency)
- User can delete an asset (with confirmation dialog)
- Deleting an asset removes it from any portfolios that reference it

---

## Epic 2: Financial Metrics

### User Stories

**FM-1: Performance Calculation**
As a user, I want to see cumulative and annualized performance for each asset.

Acceptance Criteria:
- Cumulative performance: `(P_end / P_start) - 1` expressed as percentage
- Annualized performance: `(1 + cumulative)^(365.25/days) - 1`
- Calculated for time windows: 1, 3, 5, 10, 15 years and ALL available data
- Computed on daily price data
- Displayed in a summary table on the asset detail page

**FM-2: Volatility**
As a user, I want to see the annualized volatility for each asset.

Acceptance Criteria:
- Volatility is the annualized standard deviation of daily logarithmic returns
- Annualization factor: `sqrt(252)` (trading days)
- Calculated for the same time windows: 1, 3, 5, 10, 15, ALL years
- Displayed alongside performance metrics

**FM-3: Sharpe Ratio**
As a user, I want to see the Sharpe ratio to understand risk-adjusted returns.

Acceptance Criteria:
- Sharpe ratio: `(annualized return - risk-free rate) / annualized volatility`
- Risk-free rate defaults to 0 (user-configurable in settings is optional/future)
- Calculated for the same time windows: 1, 3, 5, 10, 15, ALL years

**FM-4: Maximum Drawdown**
As a user, I want to see the maximum drawdown to understand worst-case loss scenarios.

Acceptance Criteria:
- Max drawdown: largest peak-to-trough decline in price, expressed as percentage
- Calculated for each time window: 1, 3, 5, 10, 15, ALL years
- Drawdown chart available on asset detail page

**FM-5: Heavy Computation in Web Workers**
As a user, I want calculations to not freeze the UI.

Acceptance Criteria:
- All financial metric calculations run in Web Workers
- UI shows a loading/progress indicator during computation
- UI remains responsive while calculations are in progress

---

## Epic 3: Asset Correlation

### User Stories

**AC-1: Correlation Matrix**
As a user, I want to see how my assets correlate with each other so I can diversify my portfolio.

Acceptance Criteria:
- N-to-M correlation matrix computed using Pearson correlation coefficient
- Correlation is computed on logarithmic returns: `r(t) = ln(P(t) / P(t-1))`
- Pearson coefficient formula: `rho = Cov(rX, rY) / (sigma_X * sigma_Y)`
- Missing dates are forward-filled before computation (last known price carried forward)
- Date ranges are aligned across all selected assets (intersection of available dates)
- Matrix displayed as an interactive heatmap chart

**AC-2: Asset Selection for Correlation**
As a user, I want to select which assets to include in the correlation matrix.

Acceptance Criteria:
- User can select 2 or more assets to compare
- Default selection includes all assets
- Matrix updates when selection changes

---

## Epic 4: Portfolio Management

### User Stories

**PM-1: Portfolio Creation**
As a user, I want to build portfolios by combining assets with specific weight allocations.

Acceptance Criteria:
- User can create a named portfolio
- User selects assets and assigns percentage weights to each
- Weights must sum to 100%
- Validation prevents saving portfolios with invalid weights

**PM-2: Portfolio Backtesting**
As a user, I want to backtest my portfolio against historical data.

Acceptance Criteria:
- Portfolio value is computed from weighted historical prices of constituent assets
- Backtested performance is calculated from the latest common start date of all constituent assets
- All financial metrics (Epic 2) apply to portfolio time series identically to individual assets

**PM-3: Portfolio Metrics**
As a user, I want to see the same financial metrics for portfolios as for individual assets.

Acceptance Criteria:
- Cumulative performance, annualized performance, volatility, Sharpe ratio, max drawdown — all computed per time window (1, 3, 5, 10, 15, ALL years)
- Portfolio detail page mirrors asset detail page layout

**PM-4: Benchmark Designation**
As a user, I want to mark one asset or portfolio as a benchmark for comparison.

Acceptance Criteria:
- User can designate exactly one asset or one portfolio as the benchmark
- Benchmark is visually highlighted in all charts where it appears
- Benchmark appears as an overlay on comparison charts by default
- Changing the benchmark updates all relevant charts

**PM-5: Portfolio List and Management**
As a user, I want to view, edit, and delete my portfolios.

Acceptance Criteria:
- Portfolio list page shows all portfolios with name, number of assets, and key metrics
- User can edit portfolio name and allocations
- User can delete a portfolio (with confirmation)

---

## Epic 5: Monte Carlo Simulation

### User Stories

**MC-1: Simulation Configuration**
As a user, I want to configure and run Monte Carlo simulations to explore portfolio possibilities.

Acceptance Criteria:
- User can set the number of simulations (e.g., 1,000 to 100,000)
- User selects which assets to include in the simulation
- Simulation generates random weight vectors (non-negative, summing to 1.0) for each run
- Each simulated portfolio's return and volatility are computed from historical data

**MC-2: Efficient Frontier Visualization**
As a user, I want to see the efficient frontier to identify optimal portfolios.

Acceptance Criteria:
- Scatter plot with X-axis = annualized volatility, Y-axis = annualized return
- Each dot represents one simulated portfolio
- Efficient frontier line is extracted: for each volatility bucket, keep the portfolio with the highest return
- Toggle option to color/size dots by Sharpe ratio
- Benchmark portfolio is overlaid and highlighted on the chart

**MC-3: Portfolio Inspection**
As a user, I want to click on simulated portfolios to see their allocations.

Acceptance Criteria:
- Clicking a dot on the scatter plot shows a tooltip or panel with the portfolio's asset allocations (weights)
- Displays the portfolio's return, volatility, and Sharpe ratio

**MC-4: Benchmark Comparison**
As a user, I want to find simulated portfolios that beat my benchmark.

Acceptance Criteria:
- System identifies portfolios with higher return at the same or lower volatility as the benchmark
- System identifies portfolios with the same or higher return at lower volatility
- These portfolios are visually distinguishable on the chart

**MC-5: Save Simulated Portfolios**
As a user, I want to add promising simulated portfolios to my portfolio list.

Acceptance Criteria:
- User can select a simulated portfolio and add it to the portfolio list
- Saved portfolio contains the same asset allocations as the simulation result
- Saved portfolio behaves like any manually created portfolio

**MC-6: Simulation Performance**
As a user, I want simulations to run efficiently without freezing the browser.

Acceptance Criteria:
- Monte Carlo simulations run in a Web Worker pool
- Progress indicator shows simulation progress
- User can cancel a running simulation

---

## Epic 6: Currency Support

### User Stories

**CU-1: Main Currency Configuration**
As a user, I want to set a main currency so all values are shown in a consistent unit.

Acceptance Criteria:
- User can configure a main/display currency in settings (default: EUR)
- All monetary values, returns, and charts are displayed in the main currency

**CU-2: Currency Conversion History Upload**
As a user, I want to upload historical exchange rate data so cross-currency assets are converted correctly.

Acceptance Criteria:
- User can upload CSV files with currency pair conversion rates (e.g., USD/EUR)
- Same locale-aware format detection as asset CSV uploads (Epic 1)
- Currency data is stored and used to convert asset prices before calculations

**CU-3: Currency Conversion in Calculations**
As a user, I want all financial calculations to use converted prices in my main currency.

Acceptance Criteria:
- Asset prices are converted to the main currency before any metric calculation
- If conversion data is missing for a date, nearest available rate is used (forward-fill)
- If no conversion data exists for a currency pair, user is warned

---

## Epic 7: Data Persistence

### User Stories

**DP-1: IndexedDB Storage**
As a user, I want my data to persist across page reloads and return visits.

Acceptance Criteria:
- All assets, portfolios, currency data, settings, and simulation results are stored in IndexedDB
- Data survives page reload, browser restart, and return visits
- No server-side storage; all data is local to the browser

**DP-2: Storage Schema**
The IndexedDB schema includes the following object stores:
- `assets` — `{ id, name, isin, wkn, currency, prices: [{date, close}], formatConfig }`
- `portfolios` — `{ id, name, allocations: [{assetId, weight}], isBenchmark }`
- `currencies` — `{ pair, rates: [{date, rate}] }`
- `settings` — `{ mainCurrency, theme, ... }`
- `simulations` — `{ id, config, results }`

---

## Epic 8: Theming

### User Stories

**TH-1: Light and Dark Mode**
As a user, I want to switch between light and dark mode.

Acceptance Criteria:
- Application supports light mode and dark mode
- User can manually toggle between modes
- System preference (`prefers-color-scheme`) is detected on first visit
- Default fallback is dark mode when no system preference is detected

**TH-2: Hatsune Miku Color Palette**
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

**TH-3: Liquid Glass Aesthetic**
As a user, I want a modern visual design.

Acceptance Criteria:
- UI uses a modern "liquid glass" aesthetic with subtle transparency, blur effects, and soft borders
- Implemented via CSS custom properties; no CSS framework dependency
- Consistent look and feel across all pages

---

## Epic 9: Charts

### User Stories

**CH-1: Price History Chart**
As a user, I want to see a price history chart for each asset.

Acceptance Criteria:
- Line chart showing daily closing prices over time
- Supports zooming and panning
- Benchmark asset overlaid when designated

**CH-2: Performance Comparison Chart**
As a user, I want to compare the performance of multiple assets/portfolios.

Acceptance Criteria:
- Normalized performance chart (rebased to 100 at start)
- Multiple assets/portfolios selectable for overlay
- Benchmark always shown and visually highlighted

**CH-3: Correlation Heatmap**
As a user, I want a visual correlation matrix.

Acceptance Criteria:
- Color-coded heatmap showing Pearson correlation values
- Color scale from negative (pink) through neutral to positive (teal)
- Hover shows exact correlation value

**CH-4: Efficient Frontier Scatter Chart**
As a user, I want to visualize Monte Carlo simulation results.

Acceptance Criteria:
- Scatter plot: X = volatility, Y = return
- Dot color/size optionally mapped to Sharpe ratio
- Efficient frontier line overlaid
- Benchmark position marked and highlighted
- Clickable dots showing allocation details

**CH-5: Portfolio Allocation Chart**
As a user, I want to see the composition of a portfolio.

Acceptance Criteria:
- Pie or donut chart showing asset weight distribution
- Labels with asset names and percentages

**CH-6: Drawdown Chart**
As a user, I want to visualize drawdown over time.

Acceptance Criteria:
- Area chart showing drawdown percentage from peak over time
- Maximum drawdown point highlighted

**CH-7: Chart Library**
All charts use uPlot for lightweight, high-performance rendering.

Acceptance Criteria:
- Charts are interactive (zoom, pan, hover tooltips)
- Charts are responsive and render correctly on different screen sizes
- Charts respect the active theme (light/dark mode colors)

---

## Epic 10: ISIN/WKN Scraping (Best-Effort)

### User Stories

**SC-1: Automatic Price Data Fetch**
As a user, I want to optionally fetch price data by ISIN or WKN instead of uploading a CSV.

Acceptance Criteria:
- User can enter an ISIN or WKN and trigger a data fetch attempt
- System attempts client-side requests to public financial data sources
- This feature is best-effort: it may fail due to CORS, rate limits, or API changes
- On success, fetched data is imported as if uploaded via CSV
- On failure, user receives a clear error message and can fall back to CSV upload
- No server-side proxy; all requests are made from the browser

---

## Epic 11: Deployment

### User Stories

**DE-1: Docker Image**
As a self-hoster, I want a Docker image to run Sweetfolio on my own server.

Acceptance Criteria:
- Multi-stage Docker build: Node.js build stage, nginx serving stage
- Static SvelteKit build served by nginx
- Image published to GitHub Container Registry (GHCR)
- Image is small and production-ready

**DE-2: Public Hosting**
The application is publicly hosted at `sweetfolio.app`.

Acceptance Criteria:
- Application accessible at `https://sweetfolio.app`
- Served as a static SPA; no server-side logic required at runtime

**DE-3: CI/CD Pipeline**
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

### Technology Constraints
- SvelteKit with static adapter (SSG/SPA)
- TypeScript throughout
- Minimal dependencies; lightweight bundle size
- No CSS framework; styling via CSS custom properties

---

## Pages / Routes

| Route | Description |
|---|---|
| `/` | Dashboard — overview of loaded assets and portfolios |
| `/assets` | Asset list, upload, manage |
| `/assets/[id]` | Single asset detail with metrics and charts |
| `/portfolios` | Portfolio list, create, backtest |
| `/portfolios/[id]` | Portfolio detail with metrics and charts |
| `/simulation` | Monte Carlo configuration and results |
| `/settings` | Currency, theme, preferences |
