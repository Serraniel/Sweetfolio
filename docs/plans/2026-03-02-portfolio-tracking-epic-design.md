# Portfolio Tracking Epic — Design Document

**Date:** 2026-03-02
**Status:** Approved

## Overview

Epic to add full portfolio tracking to Sweetfolio. Currently, "Portfolios" are static allocation models (fixed weights for backtesting). This epic adds real transaction tracking, holdings computation, drift analysis, and external imports — turning Sweetfolio into a complete portfolio management tool.

## Naming & Concept Model

Three distinct concepts coexist:

| Concept | Name | Purpose |
|---------|------|---------|
| Hierarchical allocation tree | **Strategy** | Planning: "Why do I hold what I hold?" Multi-level allocation (existing feature branch) |
| Flat weighted asset basket | **Portfolio (model mode)** | Backtesting: Target allocations, Monte Carlo optimization |
| Real ownership tracking | **Portfolio (tracked mode)** | Reality: Actual positions, transactions, cost basis, P&L |

A single Portfolio can operate in three modes:

- **`model`** — target allocations only (current behavior)
- **`tracked`** — transactions and computed holdings only
- **`both`** — model allocations AND tracked transactions, enabling drift analysis and rebalancing

The Strategy feature (existing branch) generates model portfolios via "sleeves". A model portfolio can later be activated into tracked mode when the user starts buying.

### Flow

```
Strategy (plan) → Model Portfolio (target) → Tracked Portfolio (reality) → Drift Analysis → Rebalancing
```

## Data Model

### Portfolio (extended)

```typescript
interface Portfolio {
  id: string;
  name: string;
  mode: 'model' | 'tracked' | 'both';

  // Model side (active when mode is 'model' or 'both')
  allocations: Array<{ assetId: string; weight: number }>;
  isBenchmark: boolean;

  // Tracked side (active when mode is 'tracked' or 'both')
  trackCash: boolean;
  cashBalance: number;        // derived from transactions, cached
  cashCurrency: string;       // e.g. "EUR"

  // Links
  sourceStrategyId: string | null;

  createdAt: string;
  updatedAt: string;
}
```

### Transaction

```typescript
type TransactionType = 'buy' | 'sell' | 'dividend';

interface Transaction {
  id: string;
  portfolioId: string;
  type: TransactionType;
  assetId: string;
  date: string;               // ISO 8601

  // Buy/Sell
  quantity: number | null;
  price: number | null;       // per unit
  fee: number;

  // Dividend
  amount: number | null;      // gross dividend
  withholdingTax: number;

  currency: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}
```

### Holding (computed, never stored)

```typescript
interface Holding {
  assetId: string;
  quantity: number;
  avgCostBasis: number;       // per unit, via FIFO
  totalCost: number;
  currentPrice: number;
  currentValue: number;
  unrealizedGain: number;
  unrealizedGainPercent: number;
  weight: number;             // % of total portfolio value
}
```

### Cost Basis Engine (FIFO, pluggable)

```typescript
interface CostBasisMethod {
  name: string;
  computeHoldings(transactions: Transaction[]): HoldingLot[];
  computeRealizedGains(transactions: Transaction[]): RealizedGain[];
}

interface HoldingLot {
  assetId: string;
  quantity: number;
  purchasePrice: number;
  purchaseDate: string;
}
```

FIFO is the initial (and only) implementation. The `CostBasisMethod` interface ensures average cost can be added later without restructuring.

**Future extensibility note:** The cost basis engine should be designed so that adding a user-selectable method (average cost) per portfolio is straightforward — likely a `costBasisMethod` field on Portfolio and a registry of implementations.

## Storage Layer

**IndexedDB version:** Bump `DB_VERSION` to 3.

**New object store:**

- `transactions` — keyPath: `id`, indices: `by-portfolioId` (on `portfolioId`), `by-date` (on `date`)

**Portfolio store migration (v2 → v3):**

- Add `mode: 'model'` to all existing portfolios
- Add `trackCash: false`, `cashBalance: 0`, `cashCurrency: 'EUR'`

**Holdings are NOT stored** — always computed from transactions to avoid sync issues.

## Engine

### Transaction Engine (`src/lib/engine/transactions.ts`)

- `computeHoldings(transactions, prices)` → `Holding[]`
- `computeRealizedGains(transactions)` → `RealizedGain[]`
- `computeCashBalance(transactions)` → `number`
- `computePortfolioTimeSeries(transactions, priceHistory)` → `PricePoint[]`

### FIFO Module (`src/lib/engine/cost-basis/fifo.ts`)

- Implements `CostBasisMethod`
- Tracks lot queue per asset
- Sells consume oldest lots first
- Directory `cost-basis/` leaves room for `average.ts` later

### Drift Engine (`src/lib/engine/drift.ts`)

- `computeDrift(model, holdings)` → `DriftItem[]` — per-asset over/underweight
- `suggestRebalanceTrades(drift, totalValue)` → `Trade[]` — minimal trades to restore model

## UI

### Transaction List & Entry (portfolio detail, new tab)

- Table: date, type, asset, qty, price, fee, total
- "Add Transaction" button → form/modal
- Inline edit, delete with confirmation
- Sort by date (newest first default)

### Holdings View (portfolio detail, new tab/section)

- Table: asset, qty, avg cost, current price, value, gain/loss, weight
- Summary row: total value, total gain/loss
- Pie chart of actual allocation weights

### Drift View (when mode is `both`)

- Side-by-side: model weight vs actual weight
- Bar chart showing drift per position
- Rebalancing suggestions as trade list

### Cash Section (when `trackCash` enabled)

- Current balance display
- Cash in allocation chart
- Transaction list shows cash impact per transaction

## Import/Export

- Bump `CURRENT_VERSION` to 3 in `schema.ts`
- New scope: `transactions`
- Migration v2→v3: default fields on existing portfolios
- E2E round-trip test updated with transaction seed data

## External Imports

Each as a parser module in `src/lib/parsers/`:

- **Portfolio Performance:** Parse XML export → `Transaction[]`
- **Parqet:** Parse export format → `Transaction[]`
- **Broker CSVs:** Auto-detect format (Trade Republic, Scalable Capital, ING) → `Transaction[]`

All parsers output a common format. Import wizard gets "Import from external tool" option.

## Epic Feature Breakdown

| # | Feature | Branch | Dependencies |
|---|---------|--------|-------------|
| 1 | Strategy (merge existing) | `feat/strategy-feature` → `epic/portfolio-tracking` | — |
| 2 | Portfolio data model + FIFO engine | `feat/portfolio-data-model` | — |
| 3 | Transaction UI | `feat/transaction-ui` | 2 |
| 4 | Holdings & performance view | `feat/holdings-view` | 2, 3 |
| 5 | Cash tracking | `feat/cash-tracking` | 2, 3 |
| 6 | Drift & rebalancing | `feat/drift-rebalancing` | 1, 4 |
| 7 | Import: Portfolio Performance | `feat/import-portfolio-performance` | 2 |
| 8 | Import: Parqet | `feat/import-parqet` | 2 |
| 9 | Import: Broker CSVs | `feat/import-broker-csv` | 2 |

## Branch Strategy

```
main (releases)
  └── epic/portfolio-tracking (integration branch)
        ├── feat/strategy-feature (merge existing)
        ├── feat/portfolio-data-model
        ├── feat/transaction-ui
        ├── feat/holdings-view
        ├── feat/cash-tracking
        ├── feat/drift-rebalancing
        ├── feat/import-portfolio-performance
        ├── feat/import-parqet
        └── feat/import-broker-csv
```

Features branch off `epic/portfolio-tracking` and merge back via PR. Epic merges to `main` when complete or at meaningful release points.

## GitHub Project Management

- **Milestone:** "Portfolio Tracking" — tracks epic progress
- **Issues:** One per feature with description and acceptance criteria
- **Labels:** `epic:portfolio-tracking`
