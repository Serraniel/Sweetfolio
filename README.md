# Sweetfolio

Plan, backtest, track and simulate investment portfolios — entirely in your browser.

No account, no server, no tracking: all data lives in your browser's IndexedDB and all computation runs locally (Web Workers). Hosted at [sweetfolio.app](https://sweetfolio.app), self-hostable via Docker.

## Features

- **Assets** — look up ISIN / WKN / crypto tickers (Onvista, CoinGecko, Alpha Vantage) or import CSV price histories with automatic EU/US format detection; editable price data, automatic daily refresh with conflict review.
- **Metrics** — total & annualized return, volatility, Sharpe ratio and max drawdown for 1/3/5/10/15 years and all history; drawdown charts; correlation heatmap; side-by-side comparison.
- **Model portfolios** — weighted allocations, backtests with optional monthly/quarterly/annual rebalancing, benchmark overlay.
- **Strategies** — hierarchical allocation trees (sunburst & icicle), generate model portfolios ("sleeves") from them.
- **Portfolio tracking** — transactions (buy, sell, dividend, deposit, withdrawal, fees, taxes), FIFO cost basis, holdings & P&L, cash tracking, value history, drift analysis and rebalancing suggestions.
- **Monte Carlo** — up to 100 000 random portfolios, optional min/max weight constraints, efficient frontier, benchmark comparison, save any point as a portfolio.
- **Currencies** — everything converted to your main currency; ECB exchange rates fetched automatically, custom rate CSVs supported.
- **Import / export** — Sweetfolio backups, Portfolio Performance (XML import, CSV export), Parqet (CSV and Parqet Connect), Trade Republic / Scalable Capital / ING CSVs, AI export + local MCP server.
- **Sharing** — portfolios, strategies and asset lists as compact links.
- Mobile-first, light/dark theme, installable as a static site.

## Quick start

```bash
docker run -p 8080:8080 ghcr.io/serraniel/sweetfolio:latest   # latest release
docker run -p 8080:8080 ghcr.io/serraniel/sweetfolio:edge     # newest main build
```

Open <http://localhost:8080>. See [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md).

## Development

```bash
npm ci
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest)
npm run test:e2e     # end-to-end tests (Playwright)
npm run check        # type check
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Requirements are tracked in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

## License

[EUPL-1.2](LICENSE)
