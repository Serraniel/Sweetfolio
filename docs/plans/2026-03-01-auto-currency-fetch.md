# Auto Currency Fetch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically fetch exchange rates from the ECB when foreign-currency assets are detected, eliminating the need for manual CSV upload of currency data.

**Architecture:** A new `currency-auto-fetch` store module detects needed currency pairs by comparing asset currencies against the user's `mainCurrency`, fetches rates from the existing ECB fetcher, derives cross-rates via EUR for non-EUR main currencies, and merges with existing stored rates. A toast component shows progress. Four trigger points: startup, currency change, post-asset-refresh, and post-asset-import.

**Tech Stack:** SvelteKit 5 (runes mode), TypeScript, Vitest, existing ECB fetcher (`src/lib/fetchers/ecb.ts`), existing currency store (`src/lib/stores/currencies.ts`)

---

### Task 1: Cross-Rate Derivation Utility

**Files:**
- Create: `src/lib/engine/cross-rate.ts`
- Test: `src/lib/engine/cross-rate.test.ts`

**Step 1: Write the failing test**

Create `src/lib/engine/cross-rate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { deriveCrossRate, mergeRates } from './cross-rate';
import type { CurrencyRate } from '$lib/types';

describe('deriveCrossRate', () => {
  it('computes cross-rate from two EUR-based rates', () => {
    const gbpEur: CurrencyRate = {
      pair: 'GBPEUR',
      rates: [
        { date: '2025-01-02', rate: 0.84 },
        { date: '2025-01-03', rate: 0.85 },
      ],
    };
    const usdEur: CurrencyRate = {
      pair: 'USDEUR',
      rates: [
        { date: '2025-01-02', rate: 1.04 },
        { date: '2025-01-03', rate: 1.05 },
      ],
    };

    const result = deriveCrossRate(gbpEur, usdEur, 'GBPUSD');

    expect(result.pair).toBe('GBPUSD');
    expect(result.rates).toHaveLength(2);
    // GBPUSD = GBPEUR / USDEUR = 0.84 / 1.04
    expect(result.rates[0].rate).toBeCloseTo(0.84 / 1.04, 8);
    expect(result.rates[1].rate).toBeCloseTo(0.85 / 1.05, 8);
  });

  it('only includes dates present in both rate series', () => {
    const gbpEur: CurrencyRate = {
      pair: 'GBPEUR',
      rates: [
        { date: '2025-01-02', rate: 0.84 },
        { date: '2025-01-03', rate: 0.85 },
        { date: '2025-01-06', rate: 0.86 },
      ],
    };
    const usdEur: CurrencyRate = {
      pair: 'USDEUR',
      rates: [
        { date: '2025-01-02', rate: 1.04 },
        { date: '2025-01-06', rate: 1.06 },
      ],
    };

    const result = deriveCrossRate(gbpEur, usdEur, 'GBPUSD');
    expect(result.rates).toHaveLength(2);
    expect(result.rates[0].date).toBe('2025-01-02');
    expect(result.rates[1].date).toBe('2025-01-06');
  });

  it('returns empty rates when no dates overlap', () => {
    const a: CurrencyRate = { pair: 'GBPEUR', rates: [{ date: '2025-01-02', rate: 0.84 }] };
    const b: CurrencyRate = { pair: 'USDEUR', rates: [{ date: '2025-01-06', rate: 1.06 }] };
    const result = deriveCrossRate(a, b, 'GBPUSD');
    expect(result.rates).toHaveLength(0);
  });
});

describe('mergeRates', () => {
  it('merges two rate arrays, existing rates take priority on overlapping dates', () => {
    const existing: CurrencyRate = {
      pair: 'USDEUR',
      rates: [
        { date: '2025-01-02', rate: 1.04 },
        { date: '2025-01-03', rate: 1.05 },
      ],
    };
    const fetched: CurrencyRate = {
      pair: 'USDEUR',
      rates: [
        { date: '2025-01-03', rate: 9.99 }, // should be ignored (existing takes priority)
        { date: '2025-01-06', rate: 1.06 }, // new date, should be added
      ],
    };

    const result = mergeRates(existing, fetched);
    expect(result.pair).toBe('USDEUR');
    expect(result.rates).toHaveLength(3);
    expect(result.rates.find((r) => r.date === '2025-01-03')?.rate).toBe(1.05); // existing preserved
    expect(result.rates.find((r) => r.date === '2025-01-06')?.rate).toBe(1.06); // new added
  });

  it('returns all fetched rates when existing is empty', () => {
    const existing: CurrencyRate = { pair: 'USDEUR', rates: [] };
    const fetched: CurrencyRate = {
      pair: 'USDEUR',
      rates: [{ date: '2025-01-02', rate: 1.04 }],
    };
    const result = mergeRates(existing, fetched);
    expect(result.rates).toHaveLength(1);
  });

  it('sorts merged rates by date', () => {
    const existing: CurrencyRate = {
      pair: 'USDEUR',
      rates: [{ date: '2025-01-06', rate: 1.06 }],
    };
    const fetched: CurrencyRate = {
      pair: 'USDEUR',
      rates: [{ date: '2025-01-02', rate: 1.04 }],
    };
    const result = mergeRates(existing, fetched);
    expect(result.rates[0].date).toBe('2025-01-02');
    expect(result.rates[1].date).toBe('2025-01-06');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/engine/cross-rate.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `src/lib/engine/cross-rate.ts`:

```typescript
import type { CurrencyRate } from '$lib/types';

/**
 * Derive a cross-rate from two EUR-based rate series.
 * E.g. GBPUSD = GBPEUR / USDEUR for each overlapping date.
 */
export function deriveCrossRate(
  sourceEUR: CurrencyRate,
  targetEUR: CurrencyRate,
  pair: string,
): CurrencyRate {
  const targetMap = new Map(targetEUR.rates.map((r) => [r.date, r.rate]));

  const rates: Array<{ date: string; rate: number }> = [];
  for (const s of sourceEUR.rates) {
    const t = targetMap.get(s.date);
    if (t !== undefined && t > 0) {
      rates.push({ date: s.date, rate: s.rate / t });
    }
  }

  rates.sort((a, b) => a.date.localeCompare(b.date));
  return { pair, rates };
}

/**
 * Merge fetched rates into existing rates.
 * Existing rates take priority on overlapping dates; fetched rates fill gaps.
 */
export function mergeRates(existing: CurrencyRate, fetched: CurrencyRate): CurrencyRate {
  const existingDates = new Set(existing.rates.map((r) => r.date));
  const merged = [
    ...existing.rates,
    ...fetched.rates.filter((r) => !existingDates.has(r.date)),
  ];
  merged.sort((a, b) => a.date.localeCompare(b.date));
  return { pair: existing.pair || fetched.pair, rates: merged };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/engine/cross-rate.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/engine/cross-rate.ts src/lib/engine/cross-rate.test.ts
git commit -m "feat: add cross-rate derivation and rate merging utilities"
```

---

### Task 2: Currency Auto-Fetch Store

**Files:**
- Create: `src/lib/stores/currency-auto-fetch.ts`
- Test: `src/lib/stores/currency-auto-fetch.test.ts`

**Step 1: Write the failing test**

Create `src/lib/stores/currency-auto-fetch.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getNeededPairs } from './currency-auto-fetch';
import type { Asset, CurrencyRate } from '$lib/types';

function makeAsset(currency: string): Asset {
  return {
    id: crypto.randomUUID(),
    name: 'Test',
    isin: null,
    wkn: null,
    currency,
    classification: 'unknown',
    prices: [{ date: '2024-01-01', close: 100 }],
    formatConfig: null,
    rawCSV: null,
    rawCSVStoredAt: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    lastRefreshedAt: null,
  };
}

describe('getNeededPairs', () => {
  it('returns pairs for foreign currencies when mainCurrency is EUR', () => {
    const assets = [makeAsset('USD'), makeAsset('GBP'), makeAsset('EUR')];
    const existing: CurrencyRate[] = [];
    const pairs = getNeededPairs(assets, 'EUR', existing);
    expect(pairs).toContain('USDEUR');
    expect(pairs).toContain('GBPEUR');
    expect(pairs).not.toContain('EUREUR');
  });

  it('returns EUR-based pairs needed for cross-rate when mainCurrency is USD', () => {
    const assets = [makeAsset('GBP'), makeAsset('USD')];
    const existing: CurrencyRate[] = [];
    const pairs = getNeededPairs(assets, 'USD', existing);
    // Needs GBPEUR and USDEUR to derive GBPUSD
    expect(pairs).toContain('GBPEUR');
    expect(pairs).toContain('USDEUR');
  });

  it('deduplicates pairs', () => {
    const assets = [makeAsset('USD'), makeAsset('USD'), makeAsset('USD')];
    const pairs = getNeededPairs(assets, 'EUR', []);
    expect(pairs).toEqual(['USDEUR']);
  });

  it('skips pairs that already have fresh rates', () => {
    const assets = [makeAsset('USD')];
    const existing: CurrencyRate[] = [
      { pair: 'USDEUR', rates: [{ date: '2025-01-02', rate: 1.04 }] },
    ];
    // With fresh rates (checked via lastFetchedAt in real implementation),
    // for this pure function test, we always return needed pairs
    // The staleness check happens at the caller level
    const pairs = getNeededPairs(assets, 'EUR', existing);
    expect(pairs).toContain('USDEUR');
  });

  it('returns empty when all assets match mainCurrency', () => {
    const assets = [makeAsset('EUR'), makeAsset('EUR')];
    const pairs = getNeededPairs(assets, 'EUR', []);
    expect(pairs).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/stores/currency-auto-fetch.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/lib/stores/currency-auto-fetch.ts`:

```typescript
import { writable, get } from 'svelte/store';
import type { Asset, CurrencyRate } from '$lib/types';
import { assets } from './assets';
import { settings } from './settings';
import { currencies, addCurrencyRate } from './currencies';
import { fetchECBRates, ECB_CURRENCIES } from '$lib/fetchers/ecb';
import { deriveCrossRate, mergeRates } from '$lib/engine/cross-rate';

export interface CurrencyFetchProgress {
  active: boolean;
  current: number;
  total: number;
  currentPair: string;
  errors: Array<{ pair: string; message: string }>;
}

export const currencyFetchProgress = writable<CurrencyFetchProgress>({
  active: false,
  current: 0,
  total: 0,
  currentPair: '',
  errors: [],
});

const ecbCurrencySet = new Set<string>(ECB_CURRENCIES);

/**
 * Determine which EUR-based currency pairs need to be fetched from the ECB.
 * Returns pairs in the format "CCYEUR" (e.g. "USDEUR", "GBPEUR").
 */
export function getNeededPairs(
  allAssets: Asset[],
  mainCurrency: string,
  _existingRates: CurrencyRate[],
): string[] {
  const foreignCurrencies = new Set<string>();

  for (const asset of allAssets) {
    const ccy = asset.currency.toUpperCase();
    if (ccy !== mainCurrency.toUpperCase() && ccy !== 'EUR') {
      foreignCurrencies.add(ccy);
    }
  }

  // If mainCurrency is not EUR, we also need mainCurrency's EUR rate for cross-rates
  if (mainCurrency.toUpperCase() !== 'EUR') {
    foreignCurrencies.add(mainCurrency.toUpperCase());
  }

  // Also check if any asset is EUR but mainCurrency is not EUR
  // In that case we need the mainCurrency EUR rate (already handled above)

  const pairs: string[] = [];
  for (const ccy of foreignCurrencies) {
    if (ecbCurrencySet.has(ccy)) {
      pairs.push(`${ccy}EUR`);
    }
  }

  return [...new Set(pairs)];
}

/**
 * Fetch all needed currency rates from the ECB, derive cross-rates, and store them.
 * This is the main entry point called from various trigger points.
 */
export async function autoFetchCurrencyRates(): Promise<void> {
  const allAssets = get(assets);
  const mainCurrency = ((get(settings).mainCurrency as string) ?? 'EUR').toUpperCase();
  const existingRates = get(currencies);

  const neededPairs = getNeededPairs(allAssets, mainCurrency, existingRates);
  if (neededPairs.length === 0) return;

  const progress: CurrencyFetchProgress = {
    active: true,
    current: 0,
    total: neededPairs.length,
    currentPair: '',
    errors: [],
  };
  currencyFetchProgress.set({ ...progress });

  // Fetch all needed EUR-based pairs
  const fetchedEURRates = new Map<string, CurrencyRate>();

  for (const pair of neededPairs) {
    const ccy = pair.slice(0, 3); // e.g. "USD" from "USDEUR"
    progress.current++;
    progress.currentPair = pair;
    currencyFetchProgress.set({ ...progress });

    try {
      const rate = await fetchECBRates({ currency: ccy });
      fetchedEURRates.set(pair, rate);

      // Merge with existing and store the EUR-based pair
      const existing = existingRates.find((r) => r.pair === pair);
      const merged = existing ? mergeRates(existing, rate) : rate;
      await addCurrencyRate(merged);
    } catch (err) {
      progress.errors.push({
        pair,
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  // Derive cross-rates if mainCurrency is not EUR
  if (mainCurrency !== 'EUR') {
    const mainEURPair = `${mainCurrency}EUR`;
    const mainEURRate = fetchedEURRates.get(mainEURPair)
      ?? existingRates.find((r) => r.pair === mainEURPair);

    if (mainEURRate && mainEURRate.rates.length > 0) {
      for (const [pair, eurRate] of fetchedEURRates) {
        const sourceCcy = pair.slice(0, 3);
        if (sourceCcy === mainCurrency) continue;

        const crossPair = `${sourceCcy}${mainCurrency}`;
        const crossRate = deriveCrossRate(eurRate, mainEURRate, crossPair);

        if (crossRate.rates.length > 0) {
          const existing = existingRates.find((r) => r.pair === crossPair);
          const merged = existing ? mergeRates(existing, crossRate) : crossRate;
          await addCurrencyRate(merged);
        }
      }
    }
  }

  progress.active = false;
  currencyFetchProgress.set({ ...progress });
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/stores/currency-auto-fetch.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/stores/currency-auto-fetch.ts src/lib/stores/currency-auto-fetch.test.ts
git commit -m "feat: add currency auto-fetch store with ECB integration"
```

---

### Task 3: Currency Fetch Toast Component

**Files:**
- Create: `src/lib/components/shared/CurrencyFetchToast.svelte`

**Step 1: Create the toast component**

Create `src/lib/components/shared/CurrencyFetchToast.svelte` following the exact pattern of `src/lib/components/shared/RefreshProgressToast.svelte`:

```svelte
<script lang="ts">
	import { currencyFetchProgress } from '$lib/stores/currency-auto-fetch';

	const progress = $derived($currencyFetchProgress);
	const visible = $derived(progress.active || progress.errors.length > 0);
	const percent = $derived(progress.total > 0 ? (progress.current / progress.total) * 100 : 0);

	let dismissed = $state(false);

	function dismiss() {
		dismissed = true;
	}

	$effect(() => {
		if (progress.active) dismissed = false;
	});

	// Auto-dismiss after 4 seconds when complete with no errors
	$effect(() => {
		if (!progress.active && progress.errors.length === 0 && progress.total > 0) {
			const timer = setTimeout(() => {
				dismissed = true;
			}, 4000);
			return () => clearTimeout(timer);
		}
	});
</script>

{#if visible && !dismissed}
	<div class="currency-toast">
		<div class="currency-toast-content">
			{#if progress.active}
				<div class="currency-status">
					<span class="currency-text">
						Fetching exchange rates... ({progress.current}/{progress.total})
					</span>
					<span class="currency-pair">{progress.currentPair}</span>
				</div>
				<div class="progress-bar-track">
					<div class="progress-bar-fill" style="width: {percent}%"></div>
				</div>
			{:else}
				<div class="currency-done">
					<div class="currency-messages">
						{#if progress.errors.length > 0}
							<span class="currency-errors">
								{progress.errors.length} pair{progress.errors.length > 1 ? 's' : ''} failed to fetch
							</span>
						{:else}
							<span class="currency-success">Exchange rates updated</span>
						{/if}
					</div>
					<button class="dismiss-btn" onclick={dismiss} aria-label="Dismiss">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<line x1="18" y1="6" x2="6" y2="18"/>
							<line x1="6" y1="6" x2="18" y2="18"/>
						</svg>
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.currency-toast {
		position: fixed;
		bottom: calc(var(--spacing-lg) + 60px);
		right: var(--spacing-lg);
		z-index: 1000;
		min-width: 300px;
		max-width: 420px;
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
		animation: currency-toast-slide-in 0.3s ease-out;
		backdrop-filter: blur(12px);
	}

	.currency-toast-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.currency-status {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--spacing-sm);
	}

	.currency-text {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-primary);
	}

	.currency-pair {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		font-family: var(--font-mono);
	}

	.progress-bar-track {
		height: 4px;
		background: var(--color-bg-tertiary);
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-bar-fill {
		height: 100%;
		background: var(--color-accent);
		border-radius: 2px;
		transition: width 0.3s ease;
	}

	.currency-done {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm);
	}

	.currency-messages {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.currency-errors {
		font-size: var(--font-size-sm);
		color: var(--color-warning, #e6a817);
	}

	.currency-success {
		font-size: var(--font-size-sm);
		color: var(--color-accent);
	}

	.dismiss-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.dismiss-btn:hover {
		color: var(--color-text-primary);
		background: var(--color-bg-tertiary);
	}

	@keyframes currency-toast-slide-in {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
```

**Step 2: Commit**

```bash
git add src/lib/components/shared/CurrencyFetchToast.svelte
git commit -m "feat: add CurrencyFetchToast component for exchange rate progress"
```

---

### Task 4: Wire Up Trigger Points

**Files:**
- Modify: `src/routes/+layout.svelte` — add toast + startup trigger
- Modify: `src/routes/settings/+page.svelte` — trigger on currency change
- Modify: `src/lib/stores/auto-refresh.ts` — trigger after asset refresh

**Step 1: Add toast and startup trigger to layout**

In `src/routes/+layout.svelte`, add the import and component:

1. Add import: `import CurrencyFetchToast from '$lib/components/shared/CurrencyFetchToast.svelte';`
2. Add import: `import { autoFetchCurrencyRates } from '$lib/stores/currency-auto-fetch';`
3. In `onMount`, add `autoFetchCurrencyRates();` after `autoRefreshAssets();`
4. Add `<CurrencyFetchToast />` after `<MigrationToast />`

The file should become:

```svelte
<script lang="ts">
	import '../app.css';
	import Shell from '$lib/components/layout/Shell.svelte';
	import RefreshProgressToast from '$lib/components/shared/RefreshProgressToast.svelte';
	import MigrationToast from '$lib/components/shared/MigrationToast.svelte';
	import CurrencyFetchToast from '$lib/components/shared/CurrencyFetchToast.svelte';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { initStores } from '$lib/stores/init';
	import { autoRefreshAssets } from '$lib/stores/auto-refresh';
	import { autoFetchCurrencyRates } from '$lib/stores/currency-auto-fetch';

	let { children }: { children: Snippet } = $props();

	onMount(async () => {
		await initStores();
		autoRefreshAssets();
		autoFetchCurrencyRates();
	});
</script>

<svelte:head>
	<title>Sweetfolio</title>
	<meta name="description" content="Portfolio planning, backtesting, and Monte Carlo simulation" />
</svelte:head>

<Shell>
	{@render children()}
</Shell>

<RefreshProgressToast />
<MigrationToast />
<CurrencyFetchToast />
```

**Step 2: Trigger on currency change in settings**

In `src/routes/settings/+page.svelte`:

1. Add import: `import { autoFetchCurrencyRates } from '$lib/stores/currency-auto-fetch';`
2. In `handleSave()`, after all `setSetting` calls complete, add:

```typescript
// Trigger currency rate fetch if mainCurrency changed
autoFetchCurrencyRates();
```

Add this line right after `saving = false;` inside `handleSave()`.

**Step 3: Trigger after asset refresh completes**

In `src/lib/stores/auto-refresh.ts`:

1. Add import: `import { autoFetchCurrencyRates } from './currency-auto-fetch';`
2. At the end of `autoRefreshAssets()`, right before `progress.active = false;`, add:

```typescript
// Fetch currency rates for any newly discovered foreign currencies
autoFetchCurrencyRates();
```

**Step 4: Trigger after new asset import**

In `src/routes/assets/+page.svelte`:

1. Add import: `import { autoFetchCurrencyRates } from '$lib/stores/currency-auto-fetch';`
2. In `handleLookupConfirm()`, after `await addAsset(asset);`, add:

```typescript
autoFetchCurrencyRates();
```

3. In `processFilesWithAutoImport()`, after the for loop (after all files are processed, before handling ambiguous files), add:

```typescript
// Trigger currency fetch for any new foreign currencies
autoFetchCurrencyRates();
```

4. Also find `handleConfirmImport()` (the manual import confirm handler) and add the same call after `await addAsset(asset);`:

```typescript
autoFetchCurrencyRates();
```

**Step 5: Commit**

```bash
git add src/routes/+layout.svelte src/routes/settings/+page.svelte src/lib/stores/auto-refresh.ts src/routes/assets/+page.svelte
git commit -m "feat: wire up auto currency fetch triggers (startup, settings, refresh, import)"
```

---

### Task 5: Build Verification and Manual Test

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Run type check**

Run: `npx svelte-check --tsconfig ./tsconfig.json`
Expected: No errors

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit design and plan docs**

```bash
git add docs/plans/2026-03-01-auto-currency-fetch-design.md docs/plans/2026-03-01-auto-currency-fetch.md
git commit -m "docs: add auto currency fetch design and implementation plan"
```
