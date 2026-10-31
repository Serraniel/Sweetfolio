# Architecture

Sweetfolio is a static single-page application (SvelteKit 3 with `adapter-static`, SSR off). There is no backend; data is stored in IndexedDB and all heavy work runs in Web Workers.

```
src/
  app.css              design tokens (palette, light/dark), base styles
  lib/
    domain/            types, defaults, factories, defensive normalization of stored/imported records
    core/              pure, tested business logic — no DOM, no Svelte
      dates            timezone-safe ISO date arithmetic (UTC day numbers)
      series           sorting, de-duplication, business-day alignment, forward fill
      metrics          returns, volatility, Sharpe, drawdown, period slicing
      correlation      Pearson on aligned log returns
      backtest         weighted portfolio series with rebalancing
      currency         conversion, ECB pair planning, cross rates, merging
      montecarlo       constrained weight sampling, hybrid estimation, frontier, dominance
      strategy         allocation trees, sleeves, partition layout
      tracking         FIFO cost basis, holdings, cash, value history, drift, rebalancing trades
      price-merge, data-quality
    parsers/           CSV tokenizer, locale-aware dates/numbers, identifiers, price CSV,
                       transaction CSV (Parqet/brokers), Portfolio Performance XML
    fetchers/          Onvista, CoinGecko, Alpha Vantage, ECB, source orchestration (fetch + timeout)
    integrations/      Parqet Connect (OAuth PKCE, client, mapper)
    storage/           IndexedDB schema/upgrades (v5) and typed repository
    io/                backup format + migrations, conflict detection, external import mapping,
                       Portfolio Performance CSV export, AI export, downloads
    sharing/           URL share codec (lz-string)
    workers/           calc worker (metrics, correlation) and Monte Carlo worker + clients
    state/             Svelte 5 rune stores: app data, jobs (refresh, ECB, migrations), toasts,
                       theme, simulation session, view models
    charts/            uPlot line chart, canvas frontier, SVG donut/heatmap/tree/drift
    ui/, layout/, components/   UI building blocks and feature components
  routes/              pages (see REQUIREMENTS UI-9)
e2e/                   Playwright tests (desktop + mobile)
tools/mcp-server/      MCP server for AI exports
```

## Data flow

1. `app.init()` opens IndexedDB (upgrading older schemas), loads all collections, normalizes them and exposes them as `$state.raw` arrays. Writes go to IndexedDB first, then replace the arrays immutably — values handed to IndexedDB are never Svelte proxies.
2. Derived data (slugs, conversions to the main currency, backtests, holdings) is computed on demand and memoized where it matters.
3. Metrics and correlations are requested from a long-lived calc worker; results are cached by input fingerprint. Monte Carlo runs in a dedicated worker with progress and cancel.
4. Background jobs run after start-up: data migrations, price refresh (24 h staleness), ECB rates.

## Storage

Database `sweetfolio`, version 5. Stores: `assets`, `portfolios`, `strategies`, `transactions` (indexes by portfolio, date, asset), `currencies` (key `pair`), `settings` (key/value), `simulations`. Upgrades from v1 (v0.5 initial), v2 (v0.5.x) and v4 (epic branch) are additive; records are normalized on every read.

Currency pairs are stored as `SRCDST` = units of DST per 1 SRC.

## Backup format

`{ format: 'sweetfolio', version: 5, exportedAt, scopes, data }`. Versions 1–4 are migrated on import. Raw CSVs, simulation scatter data and connection tokens are never exported.

## Design

Mobile first: bottom tab bar + "More" sheet below 900 px, collapsible sidebar above. Dialogs are native `<dialog>` elements rendered as bottom sheets on phones. Colours come from CSS custom properties; charts read them at draw time and redraw on theme change.
