# Sweetfolio — Design Document

## Overview

Sweetfolio is a client-side portfolio planning, backtesting, and Monte Carlo simulation web application. All data processing happens in the browser — no server-side computation. Data persists in IndexedDB across sessions.

**Target audience**: German/European retail investors
**Deployment**: Docker image, hosted at sweetfolio.app, self-hostable
**License**: EUPL-1.2

## Tech Stack

- **Framework**: SvelteKit (SSG/SPA mode, static adapter)
- **Language**: TypeScript
- **Styling**: CSS custom properties, no CSS framework (liquid glass aesthetic)
- **Charts**: uPlot (lightweight, high-performance financial charts)
- **Storage**: IndexedDB via thin wrapper
- **Computation**: Web Workers for heavy calculations (Monte Carlo, correlations)
- **Build**: Vite
- **Container**: Docker multi-stage (Node build → nginx)
- **CI/CD**: GitHub Actions, semantic-release

## Color Palette (Hatsune Miku inspired)

From the project color palette image:
- Dark charcoal: `#3C3F44` (dark backgrounds)
- Silver: `#B4B8BF` (muted text, borders)
- Miku Teal: `#8DD0C4` (primary/accent, used as "green" for positive)
- Deep Teal: `#1A8A8A` (secondary accent)
- Hot Pink: `#E8175D` (highlight, used as "red" for negative)

Light mode: light backgrounds with teal/pink accents
Dark mode: charcoal backgrounds with brighter teal/pink

## Architecture

### Data Flow

```
CSV Upload → Format Detection → Parse → IndexedDB
                                          ↓
                              Web Worker Pool
                                ↓         ↓
                          Calculations   Monte Carlo
                                ↓         ↓
                              Store Results
                                    ↓
                              Svelte Stores → UI Components → Charts
```

### Core Modules

1. **CSV Parser** — locale-aware date/number format detection, user-correctable
2. **Asset Store** — IndexedDB CRUD for assets, prices, portfolios
3. **Financial Engine** (Web Worker)
   - Performance (cumulative, annualized) per 1/3/5/10/15/ALL years
   - Volatility (annualized std dev of log returns)
   - Sharpe Ratio (excess return / volatility)
   - Max Drawdown
   - Pearson Correlation on log returns (with forward-fill for missing dates)
4. **Portfolio Builder** — weighted asset combinations, rebalancing
5. **Monte Carlo Simulator** (Web Worker pool)
   - Configurable simulation count
   - Random portfolio weight generation
   - Efficient frontier extraction (per risk level, keep highest return)
   - Results: volatility vs return scatter, Sharpe ratio view
6. **Currency Engine** — multi-currency support with uploaded conversion history
7. **Chart Components** — uPlot wrappers for price, performance, correlation matrix, efficient frontier
8. **Scraper** (best-effort) — client-side ISIN/WKN lookup via public APIs

### Pages/Routes

- `/` — Dashboard (overview of loaded assets + portfolios)
- `/assets` — Asset list, upload, manage
- `/assets/[id]` — Single asset detail + metrics
- `/portfolios` — Portfolio list, create, backtest
- `/portfolios/[id]` — Portfolio detail + metrics
- `/simulation` — Monte Carlo configuration + results
- `/settings` — Currency, preferences

### Browser Storage Schema (IndexedDB)

- `assets` — { id, name, isin, wkn, currency, prices: [{date, close}], formatConfig }
- `portfolios` — { id, name, allocations: [{assetId, weight}], isBenchmark }
- `currencies` — { pair, rates: [{date, rate}] }
- `settings` — { mainCurrency, theme, ... }
- `simulations` — { id, config, results }

## Correlation Calculation

Using Pearson correlation on logarithmic returns (standard in quantitative finance):

1. Calculate log returns: `r(t) = ln(P(t) / P(t-1))`
2. Align date ranges, forward-fill missing prices
3. Compute Pearson coefficient: `ρ = Cov(rX, rY) / (σX * σY)`

## Monte Carlo Simulation

1. Generate N random weight vectors (sum to 1.0, non-negative)
2. For each: calculate portfolio return and volatility from historical data
3. Plot all portfolios: X = volatility, Y = return
4. Extract efficient frontier: for each volatility bucket, keep max return
5. Overlay benchmark portfolio for comparison
6. Allow clicking points to inspect allocations

## Deployment

- Static SvelteKit build served by nginx in Docker
- GitHub Actions: build → test → semantic-release → Docker build + push to GHCR
- Rolling 5-min delay on release workflow to batch merged PRs
