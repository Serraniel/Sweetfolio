# Portfolio Tracking Epic — Implementation Plan (Foundation)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the foundational data model, FIFO cost basis engine, and storage layer for portfolio tracking — enabling portfolios to have transactions, computed holdings, and optional cash tracking.

**Architecture:** Extend the existing Portfolio type with a `mode` field (`model`/`tracked`/`both`). Add a new `transactions` IndexedDB store. Holdings are always computed from transactions via a pluggable cost basis engine (FIFO first). All existing portfolios migrate to `mode: 'model'` preserving backward compatibility.

**Tech Stack:** SvelteKit 2, Svelte 5 (runes), TypeScript, IndexedDB, vitest, Playwright

**Design doc:** `docs/plans/2026-03-02-portfolio-tracking-epic-design.md`

---

## Pre-requisite: Branch Setup

### Task 0: Create epic integration branch

**Step 1: Create the epic branch from main**

```bash
git checkout main
git pull
git checkout -b epic/portfolio-tracking
git push -u origin epic/portfolio-tracking
```

**Step 2: Verify branch**

```bash
git branch --show-current
# Expected: epic/portfolio-tracking
```

---

## Feature 1: Merge Strategy Branch

### Task 1: Merge the existing strategy feature branch

The strategy feature is developed in a worktree at `.claude/worktrees/strategy-feature` on branch `feat/strategy-feature`. It needs to be merged into the epic branch.

**Step 1: Check strategy branch status**

```bash
git log --oneline main..feat/strategy-feature | head -20
```

Review the commits to understand what's coming in.

**Step 2: Merge strategy into epic branch**

```bash
git checkout epic/portfolio-tracking
git merge feat/strategy-feature --no-ff -m "feat: merge strategy feature into portfolio tracking epic"
```

**Step 3: Resolve any conflicts if needed**

If conflicts arise, they'll likely be in:
- `src/lib/types/index.ts` (type additions)
- `src/lib/storage/db.ts` (store additions)
- `src/lib/io/schema.ts` (scope additions)
- Navigation components

Resolve by keeping both sets of changes.

**Step 4: Verify the build**

```bash
npm run build
npm run test
```

**Step 5: Commit merge resolution (if there were conflicts)**

```bash
git add .
git commit -m "fix: resolve merge conflicts from strategy feature"
```

---

## Feature 2: Portfolio Data Model + FIFO Engine

All tasks below branch from `epic/portfolio-tracking`:

```bash
git checkout epic/portfolio-tracking
git checkout -b feat/portfolio-data-model
```

---

### Task 2: Extend Portfolio type and add Transaction type

**Files:**
- Modify: `src/lib/types/index.ts:32-39` (Portfolio type)

**Step 1: Write the types**

Add to `src/lib/types/index.ts` after the existing Portfolio interface (replacing it):

```typescript
export type PortfolioMode = 'model' | 'tracked' | 'both';

export interface Portfolio {
	id: string;
	name: string;
	mode: PortfolioMode;

	// Model side (active when mode is 'model' or 'both')
	allocations: Array<{ assetId: string; weight: number }>;
	isBenchmark: boolean;

	// Tracked side (active when mode is 'tracked' or 'both')
	trackCash: boolean;
	cashCurrency: string;

	// Links
	sourceStrategyId: string | null;

	createdAt: string;
	updatedAt: string;
}

export type TransactionType = 'buy' | 'sell' | 'dividend';

export interface Transaction {
	id: string;
	portfolioId: string;
	type: TransactionType;
	assetId: string;
	date: string;

	// Buy/Sell fields
	quantity: number | null;
	price: number | null;
	fee: number;

	// Dividend fields
	amount: number | null;
	withholdingTax: number;

	currency: string;
	notes: string;

	createdAt: string;
	updatedAt: string;
}
```

Add holding and cost basis types:

```typescript
export interface Holding {
	assetId: string;
	quantity: number;
	avgCostBasis: number;
	totalCost: number;
	currentPrice: number;
	currentValue: number;
	unrealizedGain: number;
	unrealizedGainPercent: number;
	weight: number;
}

export interface HoldingLot {
	assetId: string;
	quantity: number;
	purchasePrice: number;
	purchaseDate: string;
}

export interface RealizedGain {
	assetId: string;
	sellDate: string;
	quantity: number;
	costBasis: number;
	proceeds: number;
	gain: number;
}

export interface DriftItem {
	assetId: string;
	modelWeight: number;
	actualWeight: number;
	drift: number;
}
```

**Step 2: Verify build**

Run: `npm run check`
Expected: PASS (types are just definitions, no runtime code yet)

**Step 3: Commit**

```bash
git add src/lib/types/index.ts
git commit -m "feat: add Transaction, Holding, and cost basis types to data model"
```

---

### Task 3: Add transactions store to IndexedDB

**Files:**
- Modify: `src/lib/storage/db.ts:7` (DB_VERSION)
- Modify: `src/lib/storage/db.ts:35-62` (store creation)
- Modify: `src/lib/storage/db.ts:64-86` (migration)
- Create: `src/lib/storage/transactions.ts`

**Step 1: Bump DB_VERSION and add migration**

In `src/lib/storage/db.ts`:

- Change `DB_VERSION` from `2` to `3`
- In the `onupgradeneeded` handler, add the new `transactions` store creation (similar pattern to existing stores)
- Add migration v2→v3: create `transactions` store with indices, add default fields to existing portfolios

New store definition:
```typescript
// Inside onupgradeneeded, add:
if (!db.objectStoreNames.contains('transactions')) {
    const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
    txStore.createIndex('by-portfolioId', 'portfolioId', { unique: false });
    txStore.createIndex('by-date', 'date', { unique: false });
    txStore.createIndex('by-assetId', 'assetId', { unique: false });
}
```

Portfolio migration (in upgrade handler when oldVersion < 3):
```typescript
// Migrate existing portfolios: add mode, trackCash, cashCurrency, sourceStrategyId
const portfolioStore = transaction.objectStore('portfolios');
const allPortfolios = portfolioStore.getAll();
allPortfolios.onsuccess = () => {
    for (const p of allPortfolios.result) {
        if (!p.mode) {
            p.mode = 'model';
            p.trackCash = false;
            p.cashCurrency = 'EUR';
            p.sourceStrategyId = p.sourceStrategyId ?? null;
            portfolioStore.put(p);
        }
    }
};
```

**Step 2: Create transactions storage CRUD**

Create `src/lib/storage/transactions.ts`:

```typescript
import { getDB, transaction } from './db';
import type { Transaction } from '$lib/types';

const STORE = 'transactions';

export async function getAll(): Promise<Transaction[]> {
	const db = await getDB();
	return transaction(db, STORE, 'readonly', (store) => store.getAll());
}

export async function getByPortfolioId(portfolioId: string): Promise<Transaction[]> {
	const db = await getDB();
	return transaction(db, STORE, 'readonly', (store) =>
		store.index('by-portfolioId').getAll(portfolioId)
	);
}

export async function getByAssetId(assetId: string): Promise<Transaction[]> {
	const db = await getDB();
	return transaction(db, STORE, 'readonly', (store) =>
		store.index('by-assetId').getAll(assetId)
	);
}

export async function put(tx: Transaction): Promise<void> {
	const db = await getDB();
	return transaction(db, STORE, 'readwrite', (store) => store.put(tx));
}

export async function remove(id: string): Promise<void> {
	const db = await getDB();
	return transaction(db, STORE, 'readwrite', (store) => store.delete(id));
}

export async function removeByPortfolioId(portfolioId: string): Promise<void> {
	const db = await getDB();
	const txs = await getByPortfolioId(portfolioId);
	return transaction(db, STORE, 'readwrite', (store) => {
		for (const tx of txs) {
			store.delete(tx.id);
		}
	});
}
```

**Step 3: Verify build**

Run: `npm run check`
Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/storage/db.ts src/lib/storage/transactions.ts
git commit -m "feat: add transactions IndexedDB store and CRUD layer"
```

---

### Task 4: Create transactions Svelte store

**Files:**
- Create: `src/lib/stores/transactions.ts`

**Step 1: Create the store**

Create `src/lib/stores/transactions.ts`:

```typescript
import { writable } from 'svelte/store';
import type { Transaction } from '$lib/types';
import * as txStorage from '$lib/storage/transactions';

export const transactions = writable<Transaction[]>([]);

export async function loadTransactions(): Promise<void> {
	const all = await txStorage.getAll();
	transactions.set(all);
}

export async function loadTransactionsByPortfolio(portfolioId: string): Promise<Transaction[]> {
	return txStorage.getByPortfolioId(portfolioId);
}

export async function addTransaction(tx: Transaction): Promise<void> {
	const plain = JSON.parse(JSON.stringify(tx));
	await txStorage.put(plain);
	transactions.update((all) => [...all, plain]);
}

export async function updateTransaction(tx: Transaction): Promise<void> {
	const plain = JSON.parse(JSON.stringify(tx));
	await txStorage.put(plain);
	transactions.update((all) => all.map((t) => (t.id === tx.id ? plain : t)));
}

export async function removeTransaction(id: string): Promise<void> {
	await txStorage.remove(id);
	transactions.update((all) => all.filter((t) => t.id !== id));
}

export async function removeTransactionsByPortfolio(portfolioId: string): Promise<void> {
	await txStorage.removeByPortfolioId(portfolioId);
	transactions.update((all) => all.filter((t) => t.portfolioId !== portfolioId));
}
```

**Step 2: Verify build**

Run: `npm run check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/stores/transactions.ts
git commit -m "feat: add transactions Svelte store with CRUD operations"
```

---

### Task 5: FIFO cost basis engine — tests first

**Files:**
- Create: `src/lib/engine/cost-basis/fifo.ts`
- Create: `src/lib/engine/cost-basis/fifo.test.ts`
- Create: `src/lib/engine/cost-basis/types.ts`

**Step 1: Create the cost basis interface**

Create `src/lib/engine/cost-basis/types.ts`:

```typescript
import type { Transaction, HoldingLot, RealizedGain } from '$lib/types';

export interface CostBasisMethod {
	name: string;
	computeLots(transactions: Transaction[]): HoldingLot[];
	computeRealizedGains(transactions: Transaction[]): RealizedGain[];
}
```

**Step 2: Write the failing tests**

Create `src/lib/engine/cost-basis/fifo.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { fifo } from './fifo';
import type { Transaction } from '$lib/types';

function makeTx(overrides: Partial<Transaction> & Pick<Transaction, 'type' | 'assetId' | 'date'>): Transaction {
	return {
		id: crypto.randomUUID(),
		portfolioId: 'p1',
		quantity: null,
		price: null,
		fee: 0,
		amount: null,
		withholdingTax: 0,
		currency: 'EUR',
		notes: '',
		createdAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-01T00:00:00Z',
		...overrides
	};
}

describe('FIFO cost basis', () => {
	describe('computeLots', () => {
		it('returns empty for no transactions', () => {
			expect(fifo.computeLots([])).toEqual([]);
		});

		it('creates a lot for a single buy', () => {
			const txs = [
				makeTx({ type: 'buy', assetId: 'a1', date: '2024-01-15', quantity: 10, price: 50 })
			];
			const lots = fifo.computeLots(txs);
			expect(lots).toEqual([
				{ assetId: 'a1', quantity: 10, purchasePrice: 50, purchaseDate: '2024-01-15' }
			]);
		});

		it('creates separate lots for multiple buys', () => {
			const txs = [
				makeTx({ type: 'buy', assetId: 'a1', date: '2024-01-15', quantity: 10, price: 50 }),
				makeTx({ type: 'buy', assetId: 'a1', date: '2024-02-15', quantity: 5, price: 80 })
			];
			const lots = fifo.computeLots(txs);
			expect(lots).toHaveLength(2);
			expect(lots[0]).toEqual({ assetId: 'a1', quantity: 10, purchasePrice: 50, purchaseDate: '2024-01-15' });
			expect(lots[1]).toEqual({ assetId: 'a1', quantity: 5, purchasePrice: 80, purchaseDate: '2024-02-15' });
		});

		it('consumes oldest lot first on sell', () => {
			const txs = [
				makeTx({ type: 'buy', assetId: 'a1', date: '2024-01-15', quantity: 10, price: 50 }),
				makeTx({ type: 'buy', assetId: 'a1', date: '2024-02-15', quantity: 10, price: 80 }),
				makeTx({ type: 'sell', assetId: 'a1', date: '2024-03-15', quantity: 7, price: 100 })
			];
			const lots = fifo.computeLots(txs);
			expect(lots).toHaveLength(2);
			expect(lots[0]).toEqual({ assetId: 'a1', quantity: 3, purchasePrice: 50, purchaseDate: '2024-01-15' });
			expect(lots[1]).toEqual({ assetId: 'a1', quantity: 10, purchasePrice: 80, purchaseDate: '2024-02-15' });
		});

		it('removes fully consumed lots', () => {
			const txs = [
				makeTx({ type: 'buy', assetId: 'a1', date: '2024-01-15', quantity: 10, price: 50 }),
				makeTx({ type: 'sell', assetId: 'a1', date: '2024-03-15', quantity: 10, price: 100 })
			];
			const lots = fifo.computeLots(txs);
			expect(lots).toEqual([]);
		});

		it('handles sell spanning multiple lots', () => {
			const txs = [
				makeTx({ type: 'buy', assetId: 'a1', date: '2024-01-15', quantity: 5, price: 50 }),
				makeTx({ type: 'buy', assetId: 'a1', date: '2024-02-15', quantity: 5, price: 80 }),
				makeTx({ type: 'sell', assetId: 'a1', date: '2024-03-15', quantity: 7, price: 100 })
			];
			const lots = fifo.computeLots(txs);
			expect(lots).toHaveLength(1);
			expect(lots[0]).toEqual({ assetId: 'a1', quantity: 3, purchasePrice: 80, purchaseDate: '2024-02-15' });
		});

		it('tracks lots per asset independently', () => {
			const txs = [
				makeTx({ type: 'buy', assetId: 'a1', date: '2024-01-15', quantity: 10, price: 50 }),
				makeTx({ type: 'buy', assetId: 'a2', date: '2024-01-15', quantity: 20, price: 30 }),
				makeTx({ type: 'sell', assetId: 'a1', date: '2024-03-15', quantity: 5, price: 100 })
			];
			const lots = fifo.computeLots(txs);
			const a1Lots = lots.filter((l) => l.assetId === 'a1');
			const a2Lots = lots.filter((l) => l.assetId === 'a2');
			expect(a1Lots).toHaveLength(1);
			expect(a1Lots[0].quantity).toBe(5);
			expect(a2Lots).toHaveLength(1);
			expect(a2Lots[0].quantity).toBe(20);
		});

		it('ignores dividend transactions', () => {
			const txs = [
				makeTx({ type: 'buy', assetId: 'a1', date: '2024-01-15', quantity: 10, price: 50 }),
				makeTx({ type: 'dividend', assetId: 'a1', date: '2024-06-15', amount: 25 })
			];
			const lots = fifo.computeLots(txs);
			expect(lots).toHaveLength(1);
			expect(lots[0].quantity).toBe(10);
		});

		it('sorts transactions by date before processing', () => {
			const txs = [
				makeTx({ type: 'sell', assetId: 'a1', date: '2024-03-15', quantity: 5, price: 100 }),
				makeTx({ type: 'buy', assetId: 'a1', date: '2024-01-15', quantity: 10, price: 50 })
			];
			const lots = fifo.computeLots(txs);
			expect(lots).toHaveLength(1);
			expect(lots[0].quantity).toBe(5);
		});
	});

	describe('computeRealizedGains', () => {
		it('returns empty for no sells', () => {
			const txs = [
				makeTx({ type: 'buy', assetId: 'a1', date: '2024-01-15', quantity: 10, price: 50 })
			];
			expect(fifo.computeRealizedGains(txs)).toEqual([]);
		});

		it('computes gain for a simple sell', () => {
			const txs = [
				makeTx({ type: 'buy', assetId: 'a1', date: '2024-01-15', quantity: 10, price: 50 }),
				makeTx({ type: 'sell', assetId: 'a1', date: '2024-06-15', quantity: 10, price: 100 })
			];
			const gains = fifo.computeRealizedGains(txs);
			expect(gains).toHaveLength(1);
			expect(gains[0]).toEqual({
				assetId: 'a1',
				sellDate: '2024-06-15',
				quantity: 10,
				costBasis: 500,
				proceeds: 1000,
				gain: 500
			});
		});

		it('computes gain spanning multiple lots with different prices', () => {
			const txs = [
				makeTx({ type: 'buy', assetId: 'a1', date: '2024-01-15', quantity: 5, price: 50 }),
				makeTx({ type: 'buy', assetId: 'a1', date: '2024-02-15', quantity: 5, price: 80 }),
				makeTx({ type: 'sell', assetId: 'a1', date: '2024-06-15', quantity: 7, price: 100 })
			];
			const gains = fifo.computeRealizedGains(txs);
			expect(gains).toHaveLength(1);
			// FIFO: 5 @ 50 + 2 @ 80 = 250 + 160 = 410 cost basis
			expect(gains[0].costBasis).toBe(410);
			expect(gains[0].proceeds).toBe(700);
			expect(gains[0].gain).toBe(290);
		});

		it('includes fees in cost basis and deducts from proceeds', () => {
			const txs = [
				makeTx({ type: 'buy', assetId: 'a1', date: '2024-01-15', quantity: 10, price: 50, fee: 10 }),
				makeTx({ type: 'sell', assetId: 'a1', date: '2024-06-15', quantity: 10, price: 100, fee: 15 })
			];
			const gains = fifo.computeRealizedGains(txs);
			// Cost basis: 10*50 + 10 buy fee = 510
			// Proceeds: 10*100 - 15 sell fee = 985
			expect(gains[0].costBasis).toBe(510);
			expect(gains[0].proceeds).toBe(985);
			expect(gains[0].gain).toBe(475);
		});
	});
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/engine/cost-basis/fifo.test.ts`
Expected: FAIL — module `./fifo` not found

**Step 4: Implement the FIFO engine**

Create `src/lib/engine/cost-basis/fifo.ts`:

```typescript
import type { Transaction, HoldingLot, RealizedGain } from '$lib/types';
import type { CostBasisMethod } from './types';

function sortByDate(transactions: Transaction[]): Transaction[] {
	return [...transactions].sort((a, b) => a.date.localeCompare(b.date));
}

function computeLots(transactions: Transaction[]): HoldingLot[] {
	const sorted = sortByDate(transactions);
	const lotQueues = new Map<string, HoldingLot[]>();

	for (const tx of sorted) {
		if (tx.type === 'dividend') continue;

		const assetId = tx.assetId;
		if (!lotQueues.has(assetId)) lotQueues.set(assetId, []);
		const queue = lotQueues.get(assetId)!;

		if (tx.type === 'buy' && tx.quantity != null && tx.price != null) {
			queue.push({
				assetId,
				quantity: tx.quantity,
				purchasePrice: tx.price,
				purchaseDate: tx.date
			});
		} else if (tx.type === 'sell' && tx.quantity != null) {
			let remaining = tx.quantity;
			while (remaining > 0 && queue.length > 0) {
				const oldest = queue[0];
				if (oldest.quantity <= remaining) {
					remaining -= oldest.quantity;
					queue.shift();
				} else {
					oldest.quantity -= remaining;
					remaining = 0;
				}
			}
		}
	}

	const result: HoldingLot[] = [];
	for (const queue of lotQueues.values()) {
		result.push(...queue);
	}
	return result;
}

function computeRealizedGains(transactions: Transaction[]): RealizedGain[] {
	const sorted = sortByDate(transactions);
	const lotQueues = new Map<string, Array<HoldingLot & { fee: number }>>();
	const gains: RealizedGain[] = [];

	for (const tx of sorted) {
		if (tx.type === 'dividend') continue;

		const assetId = tx.assetId;
		if (!lotQueues.has(assetId)) lotQueues.set(assetId, []);
		const queue = lotQueues.get(assetId)!;

		if (tx.type === 'buy' && tx.quantity != null && tx.price != null) {
			queue.push({
				assetId,
				quantity: tx.quantity,
				purchasePrice: tx.price,
				purchaseDate: tx.date,
				fee: tx.fee
			});
		} else if (tx.type === 'sell' && tx.quantity != null && tx.price != null) {
			let remaining = tx.quantity;
			let costBasis = 0;

			while (remaining > 0 && queue.length > 0) {
				const oldest = queue[0];
				const consumed = Math.min(oldest.quantity, remaining);
				const lotFraction = consumed / (consumed + (oldest.quantity - consumed) || consumed);

				costBasis += consumed * oldest.purchasePrice;
				// Proportional buy fee for partially consumed lots
				costBasis += oldest.fee * (consumed / (oldest.quantity + consumed - consumed));

				if (oldest.quantity <= remaining) {
					costBasis -= consumed * oldest.purchasePrice;
					costBasis += oldest.quantity * oldest.purchasePrice + oldest.fee;
					remaining -= oldest.quantity;
					queue.shift();
				} else {
					costBasis -= consumed * oldest.purchasePrice;
					costBasis += consumed * oldest.purchasePrice;
					const feeShare = oldest.fee * (consumed / oldest.quantity);
					costBasis += feeShare;
					oldest.fee -= feeShare;
					oldest.quantity -= consumed;
					remaining = 0;
				}
			}

			// Simplify: recalculate cleanly
			// (The above logic is complex — see simplified version below)
		}
	}

	// NOTE: The above realized gains calculation with fees is intentionally
	// complex. The implementing engineer should use the simplified approach below.
	return gains;
}

export const fifo: CostBasisMethod = {
	name: 'FIFO',
	computeLots,
	computeRealizedGains
};
```

**IMPORTANT:** The `computeRealizedGains` implementation above is a sketch. The implementing engineer should write the clean version guided by the tests. Here's the clean algorithm:

```typescript
function computeRealizedGains(transactions: Transaction[]): RealizedGain[] {
	const sorted = sortByDate(transactions);
	// Track lots with their remaining fee allocation
	const lotQueues = new Map<string, Array<{ qty: number; price: number; date: string; feePerUnit: number }>>();
	const gains: RealizedGain[] = [];

	for (const tx of sorted) {
		if (tx.type === 'dividend') continue;
		const assetId = tx.assetId;
		if (!lotQueues.has(assetId)) lotQueues.set(assetId, []);
		const queue = lotQueues.get(assetId)!;

		if (tx.type === 'buy' && tx.quantity != null && tx.price != null) {
			queue.push({
				qty: tx.quantity,
				price: tx.price,
				date: tx.date,
				feePerUnit: tx.fee / tx.quantity
			});
		} else if (tx.type === 'sell' && tx.quantity != null && tx.price != null) {
			let remaining = tx.quantity;
			let costBasis = 0;

			while (remaining > 0 && queue.length > 0) {
				const oldest = queue[0];
				const consumed = Math.min(oldest.qty, remaining);

				costBasis += consumed * (oldest.price + oldest.feePerUnit);

				if (oldest.qty <= remaining) {
					remaining -= oldest.qty;
					queue.shift();
				} else {
					oldest.qty -= consumed;
					remaining = 0;
				}
			}

			const proceeds = tx.quantity * tx.price - tx.fee;
			gains.push({
				assetId,
				sellDate: tx.date,
				quantity: tx.quantity,
				costBasis,
				proceeds,
				gain: proceeds - costBasis
			});
		}
	}

	return gains;
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/engine/cost-basis/fifo.test.ts`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/lib/engine/cost-basis/
git commit -m "feat: add FIFO cost basis engine with tests"
```

---

### Task 6: Holdings computation engine

**Files:**
- Create: `src/lib/engine/holdings.ts`
- Create: `src/lib/engine/holdings.test.ts`

**Step 1: Write the failing tests**

Create `src/lib/engine/holdings.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeHoldings, computeCashBalance } from './holdings';
import type { Transaction, PricePoint } from '$lib/types';

function makeTx(overrides: Partial<Transaction> & Pick<Transaction, 'type' | 'assetId' | 'date'>): Transaction {
	return {
		id: crypto.randomUUID(),
		portfolioId: 'p1',
		quantity: null,
		price: null,
		fee: 0,
		amount: null,
		withholdingTax: 0,
		currency: 'EUR',
		notes: '',
		createdAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-01T00:00:00Z',
		...overrides
	};
}

describe('computeHoldings', () => {
	it('returns empty for no transactions', () => {
		expect(computeHoldings([], new Map())).toEqual([]);
	});

	it('computes a single holding with current price', () => {
		const txs = [
			makeTx({ type: 'buy', assetId: 'a1', date: '2024-01-15', quantity: 10, price: 50, fee: 5 })
		];
		const prices = new Map([['a1', 75]]);
		const holdings = computeHoldings(txs, prices);

		expect(holdings).toHaveLength(1);
		expect(holdings[0].assetId).toBe('a1');
		expect(holdings[0].quantity).toBe(10);
		expect(holdings[0].currentPrice).toBe(75);
		expect(holdings[0].currentValue).toBe(750);
		expect(holdings[0].totalCost).toBeCloseTo(505); // 10*50 + 5 fee
		expect(holdings[0].unrealizedGain).toBeCloseTo(245);
		expect(holdings[0].weight).toBe(1); // only holding = 100%
	});

	it('computes weights across multiple holdings', () => {
		const txs = [
			makeTx({ type: 'buy', assetId: 'a1', date: '2024-01-15', quantity: 10, price: 100 }),
			makeTx({ type: 'buy', assetId: 'a2', date: '2024-01-15', quantity: 20, price: 50 })
		];
		const prices = new Map([['a1', 100], ['a2', 50]]);
		const holdings = computeHoldings(txs, prices);

		expect(holdings).toHaveLength(2);
		// a1: 10 * 100 = 1000, a2: 20 * 50 = 1000, total = 2000
		expect(holdings[0].weight).toBe(0.5);
		expect(holdings[1].weight).toBe(0.5);
	});

	it('excludes fully sold positions', () => {
		const txs = [
			makeTx({ type: 'buy', assetId: 'a1', date: '2024-01-15', quantity: 10, price: 50 }),
			makeTx({ type: 'sell', assetId: 'a1', date: '2024-06-15', quantity: 10, price: 100 })
		];
		const prices = new Map([['a1', 100]]);
		const holdings = computeHoldings(txs, prices);
		expect(holdings).toEqual([]);
	});
});

describe('computeCashBalance', () => {
	it('returns 0 for no transactions', () => {
		expect(computeCashBalance([], 0)).toBe(0);
	});

	it('deducts buys (price * quantity + fee)', () => {
		const txs = [
			makeTx({ type: 'buy', assetId: 'a1', date: '2024-01-15', quantity: 10, price: 50, fee: 5 })
		];
		expect(computeCashBalance(txs, 1000)).toBe(495); // 1000 - 500 - 5
	});

	it('adds sells (price * quantity - fee)', () => {
		const txs = [
			makeTx({ type: 'sell', assetId: 'a1', date: '2024-01-15', quantity: 10, price: 100, fee: 10 })
		];
		expect(computeCashBalance(txs, 0)).toBe(990); // 0 + 1000 - 10
	});

	it('adds dividends (amount - withholdingTax)', () => {
		const txs = [
			makeTx({ type: 'dividend', assetId: 'a1', date: '2024-06-15', amount: 50, withholdingTax: 13 })
		];
		expect(computeCashBalance(txs, 0)).toBe(37); // 50 - 13
	});

	it('tracks running balance across all transaction types', () => {
		const txs = [
			makeTx({ type: 'buy', assetId: 'a1', date: '2024-01-15', quantity: 10, price: 50, fee: 5 }),
			makeTx({ type: 'dividend', assetId: 'a1', date: '2024-06-15', amount: 25, withholdingTax: 5 }),
			makeTx({ type: 'sell', assetId: 'a1', date: '2024-12-15', quantity: 5, price: 80, fee: 5 })
		];
		// Start: 1000
		// Buy: -500 - 5 = 495
		// Dividend: +25 - 5 = 515
		// Sell: +400 - 5 = 910
		expect(computeCashBalance(txs, 1000)).toBe(910);
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/engine/holdings.test.ts`
Expected: FAIL — module `./holdings` not found

**Step 3: Implement holdings computation**

Create `src/lib/engine/holdings.ts`:

```typescript
import type { Transaction, Holding } from '$lib/types';
import { fifo } from './cost-basis/fifo';

export function computeHoldings(
	transactions: Transaction[],
	currentPrices: Map<string, number>
): Holding[] {
	const lots = fifo.computeLots(transactions);

	// Aggregate lots per asset
	const assetMap = new Map<string, { quantity: number; totalCost: number }>();
	for (const lot of lots) {
		const existing = assetMap.get(lot.assetId) || { quantity: 0, totalCost: 0 };
		existing.quantity += lot.quantity;
		existing.totalCost += lot.quantity * lot.purchasePrice;
		assetMap.set(lot.assetId, existing);
	}

	// Add fee impact to total cost
	const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
	const feeTracker = new Map<string, number>();
	for (const tx of sorted) {
		if (tx.type === 'buy' && tx.fee > 0) {
			feeTracker.set(tx.assetId, (feeTracker.get(tx.assetId) || 0) + tx.fee);
		}
	}
	// Note: fee tracking for partial sells is complex — for the initial version,
	// include all buy fees in total cost. FIFO lot-level fee tracking is a refinement.
	for (const [assetId, fee] of feeTracker) {
		const entry = assetMap.get(assetId);
		if (entry) entry.totalCost += fee;
	}

	// Build holdings with current prices
	const holdings: Holding[] = [];
	let totalValue = 0;

	for (const [assetId, data] of assetMap) {
		const currentPrice = currentPrices.get(assetId) ?? 0;
		const currentValue = data.quantity * currentPrice;
		totalValue += currentValue;

		holdings.push({
			assetId,
			quantity: data.quantity,
			avgCostBasis: data.totalCost / data.quantity,
			totalCost: data.totalCost,
			currentPrice,
			currentValue,
			unrealizedGain: currentValue - data.totalCost,
			unrealizedGainPercent: data.totalCost > 0 ? (currentValue - data.totalCost) / data.totalCost : 0,
			weight: 0 // computed below
		});
	}

	// Compute weights
	if (totalValue > 0) {
		for (const h of holdings) {
			h.weight = h.currentValue / totalValue;
		}
	}

	return holdings;
}

export function computeCashBalance(transactions: Transaction[], initialCash: number = 0): number {
	let cash = initialCash;

	for (const tx of transactions) {
		if (tx.type === 'buy' && tx.quantity != null && tx.price != null) {
			cash -= tx.quantity * tx.price + tx.fee;
		} else if (tx.type === 'sell' && tx.quantity != null && tx.price != null) {
			cash += tx.quantity * tx.price - tx.fee;
		} else if (tx.type === 'dividend' && tx.amount != null) {
			cash += tx.amount - tx.withholdingTax;
		}
	}

	return cash;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/engine/holdings.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/engine/holdings.ts src/lib/engine/holdings.test.ts
git commit -m "feat: add holdings computation engine with cash balance tracking"
```

---

### Task 7: Update Portfolio store for new mode field

**Files:**
- Modify: `src/lib/stores/portfolios.ts` (update functions to handle mode)
- Modify: `src/routes/portfolios/+page.svelte` (default mode on create)

**Step 1: Update portfolio creation defaults**

In `src/routes/portfolios/+page.svelte`, inside `handleCreate()` (~line 52), the new portfolio object should include:

```typescript
const portfolio: Portfolio = {
	id: crypto.randomUUID(),
	name: name.trim(),
	mode: 'model',
	allocations: normalizedAllocations,
	isBenchmark: false,
	trackCash: false,
	cashCurrency: 'EUR',
	sourceStrategyId: null,
	createdAt: now,
	updatedAt: now
};
```

**Step 2: Update removeAssetFromPortfolios**

In `src/lib/stores/portfolios.ts`, the `removeAssetFromPortfolios` function (~line 30) should also clean up transactions when removing an asset. Add a call to remove transactions by asset for tracked portfolios.

**Step 3: Verify build**

Run: `npm run check && npm run test`
Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/stores/portfolios.ts src/routes/portfolios/+page.svelte
git commit -m "feat: update portfolio creation and stores for new mode field"
```

---

### Task 8: Update import/export for transactions

**Files:**
- Modify: `src/lib/io/schema.ts:3,5-11,15-27` (bump version, add scope)
- Modify: `src/lib/io/export.ts:35-57` (add transactions to export)
- Modify: `src/lib/io/import.ts:24-41` (handle transactions in import)
- Modify: `src/lib/io/apply.ts:49-55` (apply transactions)
- Modify: `src/lib/io/migrations.ts:6-19` (add v2→v3 migration)

**Step 1: Update schema**

In `src/lib/io/schema.ts`:
- Change `CURRENT_VERSION` to `3`
- Add `'transactions'` to `ALL_SCOPES`
- Add `transactions?: Transaction[]` to the data interface in `SweetfolioExport`

**Step 2: Add v2→v3 migration**

In `src/lib/io/migrations.ts`, add migration `2`:
```typescript
2: (data: any) => {
	// Add default mode fields to portfolios
	if (data.data?.portfolios) {
		for (const p of data.data.portfolios) {
			if (!p.mode) {
				p.mode = 'model';
				p.trackCash = false;
				p.cashCurrency = 'EUR';
				p.sourceStrategyId = p.sourceStrategyId ?? null;
			}
		}
	}
	// Transactions scope didn't exist before v3, nothing to migrate
	data.version = 3;
	return data;
}
```

**Step 3: Update export builder**

In `src/lib/io/export.ts`, add transaction export:
```typescript
if (scopes.includes('transactions')) {
	data.transactions = await transactionStorage.getAll();
}
```

**Step 4: Update import applier**

In `src/lib/io/apply.ts`, add transaction apply using the same `applyIdScope` pattern as portfolios.

**Step 5: Verify build**

Run: `npm run check`
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/io/
git commit -m "feat: add transactions to import/export with v2→v3 migration"
```

---

### Task 9: Update E2E import/export test

**Files:**
- Modify: `e2e/import-export.spec.ts:12-145` (add transaction seed data)

**Step 1: Add transaction seed data**

In `seedTestData()`, after seeding portfolios, add transactions to the `transactions` store:

```typescript
const transactionsStore = db.transaction('transactions', 'readwrite').objectStore('transactions');
const testTransactions = [
	{
		id: 'tx-1',
		portfolioId: portfolioId, // reference the seeded portfolio
		type: 'buy',
		assetId: assetId1,
		date: '2024-01-15',
		quantity: 10,
		price: 50,
		fee: 5,
		amount: null,
		withholdingTax: 0,
		currency: 'EUR',
		notes: 'Initial buy',
		createdAt: '2024-01-15T00:00:00Z',
		updatedAt: '2024-01-15T00:00:00Z'
	},
	{
		id: 'tx-2',
		portfolioId: portfolioId,
		type: 'dividend',
		assetId: assetId1,
		date: '2024-06-15',
		quantity: null,
		price: null,
		fee: 0,
		amount: 25,
		withholdingTax: 6.5,
		currency: 'EUR',
		notes: 'H1 dividend',
		createdAt: '2024-06-15T00:00:00Z',
		updatedAt: '2024-06-15T00:00:00Z'
	}
];
for (const tx of testTransactions) {
	transactionsStore.put(tx);
}
```

**Step 2: Update readAllData() to include transactions**

Add reading the transactions store alongside existing stores.

**Step 3: Update verification phase**

Verify that exported data includes transactions, and imported data matches.

**Step 4: Update the seeded portfolio to mode 'both'**

Change the test portfolio to `mode: 'both'` so it exercises both model and tracked paths.

**Step 5: Run E2E tests**

Run: `npm run test:e2e`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add e2e/import-export.spec.ts
git commit -m "test: add transactions to E2E import/export round-trip test"
```

---

### Task 10: Create PR for data model feature

**Step 1: Push feature branch**

```bash
git push -u origin feat/portfolio-data-model
```

**Step 2: Create PR against epic branch**

```bash
gh pr create \
  --base epic/portfolio-tracking \
  --title "feat: portfolio data model + FIFO cost basis engine" \
  --body "## Summary
- Extended Portfolio type with mode (model/tracked/both), cash tracking fields
- Added Transaction type (buy/sell/dividend)
- FIFO cost basis engine with lot tracking and realized gains
- Holdings computation engine (derived from transactions)
- IndexedDB v3 migration with transactions store
- Updated import/export with transactions scope
- E2E test coverage for round-trip

Part of Portfolio Tracking epic."
```

---

## What comes next

After this PR is merged to `epic/portfolio-tracking`, the next implementation plans to write are:

1. **Feature 3: Transaction UI** — Add/edit/delete transactions on portfolio detail page
2. **Feature 4: Holdings & performance view** — Computed holdings table, P&L display, portfolio value chart
3. **Feature 5: Cash tracking** — Optional cash position with deposits/withdrawals

Each of these gets its own implementation plan when ready.
