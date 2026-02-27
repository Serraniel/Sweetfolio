# Development Guide

## Prerequisites

- Node.js 22+
- npm

## Setup

```bash
git clone https://github.com/serraniel/sweetfolio.git
cd sweetfolio
npm install
npm run dev
```

The dev server starts at `http://localhost:5173` with hot module replacement.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build (static output) |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run check` | Run svelte-check for type errors |

## Project Structure

```
src/
  routes/                    SvelteKit pages
    +layout.svelte           Root layout (theme provider, nav)
    +page.svelte             / -- Dashboard
    assets/
      +page.svelte           /assets -- Asset list, upload
      [id]/+page.svelte      /assets/:id -- Asset detail + metrics
    portfolios/
      +page.svelte           /portfolios -- Portfolio list, create
      [id]/+page.svelte      /portfolios/:id -- Portfolio detail + backtest
    simulation/
      +page.svelte           /simulation -- Monte Carlo config + results
    settings/
      +page.svelte           /settings -- Currency, preferences
  lib/
    components/              Reusable UI components
      layout/                Shell, Nav, ThemeToggle
      shared/                Buttons, modals, file dropzone, tables
      assets/                Asset-specific components
      portfolios/            Portfolio-specific components
      simulation/            Monte Carlo-specific components
    charts/                  uPlot wrapper components
    stores/                  Svelte stores (synced with IndexedDB)
    engine/                  Financial calculation modules
    workers/                 Web Workers for heavy computation
    storage/                 IndexedDB layer
    parsers/                 CSV parsing and format detection
    utils/                   Shared utilities (dates, math, formatting)
static/
  favicon.svg
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed data flow, worker protocol, and module interfaces.

## How to Add a New Page

1. Create a directory under `src/routes/` matching the desired URL path
2. Add a `+page.svelte` file in that directory
3. Add navigation entry in `src/lib/components/layout/Nav.svelte`

## How to Add a New Financial Metric

1. Create a calculation module in `src/lib/engine/` (e.g., `src/lib/engine/newmetric.ts`)
2. Export a pure function that takes price data and returns the computed metric
3. Add the metric type to `MetricsResult` in `src/lib/types/`
4. Register the calculation in the worker message handler in `src/lib/workers/calc.worker.ts`
5. Display the result in the relevant UI component (e.g., `MetricsTable.svelte`)

## How to Add a New Component

1. Place shared/reusable components in `src/lib/components/shared/`
2. Place feature-specific components in the appropriate subdirectory (e.g., `src/lib/components/assets/`)
3. Use CSS custom properties for all colors -- never hardcode color values
4. Components should work in both light and dark themes

## Building for Production

```bash
npm run build
```

Output is written to `build/`. This is a static SPA that can be served by any web server. The included Dockerfile packages it with nginx.

## Testing

Tests use Vitest:

```bash
npm test              # Run once
npm run test:watch    # Watch mode
```

Place test files next to the modules they test with a `.test.ts` suffix, or in a `__tests__` directory.
