# Sweetfolio

A client-side portfolio planning, backtesting, and Monte Carlo simulation tool for retail investors.

All data processing happens in the browser. No server, no tracking, no data leaves your device.

Hosted at [sweetfolio.app](https://sweetfolio.app) | Self-hostable via Docker

## Features

- **Portfolio Planning** -- Build portfolios with weighted asset allocations and backtest against historical data
- **Financial Metrics** -- Cumulative/annualized returns, volatility, Sharpe ratio, and max drawdown across multiple time windows (1/3/5/10/15/ALL years)
- **Monte Carlo Simulation** -- Generate thousands of random portfolios, visualize the efficient frontier, and find optimal allocations
- **Correlation Analysis** -- Pearson correlation matrix on log returns with interactive heatmap
- **Multi-Currency Support** -- Upload exchange rate histories and view everything in your preferred currency
- **CSV Import** -- Locale-aware format detection with automatic handling of European date/number formats
- **Client-Side Processing** -- All computation runs in Web Workers; your data never leaves the browser
- **Light/Dark Theme** -- Hatsune Miku-inspired teal and pink color palette with liquid glass aesthetic

<!-- TODO: screenshots -->

## Quick Start

### Docker

```bash
docker pull ghcr.io/serraniel/sweetfolio:latest
docker run -p 8080:80 ghcr.io/serraniel/sweetfolio:latest
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

### Development

```bash
git clone https://github.com/serraniel/sweetfolio.git
cd sweetfolio
npm install
npm run dev
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for detailed development setup.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | SvelteKit (static adapter) |
| Language | TypeScript |
| Charts | uPlot |
| Storage | IndexedDB |
| Computation | Web Workers |
| Build | Vite |
| Container | Docker (Node build + nginx) |
| CI/CD | GitHub Actions + semantic-release |

## Documentation

- [Development Guide](docs/DEVELOPMENT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Self-Hosting Guide](docs/SELF_HOSTING.md)
- [Contributing](CONTRIBUTING.md)
- [Requirements](docs/REQUIREMENTS.md)

## License

Licensed under the [European Union Public Licence v1.2 (EUPL-1.2)](LICENSE).
