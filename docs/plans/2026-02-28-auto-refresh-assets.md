# Auto-Refresh Scraped Assets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically refresh assets with ISIN/WKN on startup when data is stale (>24h), with progress UI and conflict detection.

**Architecture:** New `auto-refresh.ts` store module handles the refresh logic. It reads assets after init, filters stale ones, re-fetches via existing scraper, merges prices (append-only with >1% conflict detection), and updates each asset. A reactive Svelte store exposes refresh progress for a toast notification in the layout. Settings toggle allows opt-out.

**Tech Stack:** SvelteKit, Svelte 5 runes, IndexedDB (via existing storage layer), existing scraper module, Vitest for tests.

---

### Task 1: Add `lastRefreshedAt` to Asset type

**Files:**
- Modify: `src/lib/types/index.ts:8-20`

**Step 1: Add the field to the Asset interface**

In `src/lib/types/index.ts`, add `lastRefreshedAt: string | null;` to the `Asset` interface after `updatedAt`:

```typescript
export interface Asset {
  id: string;
  name: string;
  isin: string | null;
  wkn: string | null;
  currency: string;
  prices: PricePoint[];
  formatConfig: DetectedFormat | null;
  rawCSV: string | null;
  rawCSVStoredAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastRefreshedAt: string | null;
}
```

**Step 2: Update identifier lookup to set lastRefreshedAt on creation**

In `src/routes/assets/+page.svelte`, in the `handleLookupConfirm` function, add `lastRefreshedAt: new Date().toISOString()` to the asset object.

**Step 3: Verify build passes**

Run: `npm run check`
Expected: No type errors

**Step 4: Commit**

```bash
git add src/lib/types/index.ts src/routes/assets/+page.svelte
git commit -m "feat: add lastRefreshedAt field to Asset type"
```

---

### Task 2: Create price merge utility with tests (TDD)

**Files:**
- Create: `src/lib/engine/price-merge.ts`
- Create: `src/lib/engine/price-merge.test.ts`

**Step 1: Write failing tests**

Create `src/lib/engine/price-merge.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mergePrices, type MergeResult } from './price-merge';
import type { PricePoint } from '$lib/types';

describe('mergePrices', () => {
  it('appends new dates not in existing data', () => {
    const existing: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 101 },
    ];
    const fetched: PricePoint[] = [
      { date: '2024-01-02', close: 101 },
      { date: '2024-01-03', close: 102 },
      { date: '2024-01-04', close: 103 },
    ];
    const result = mergePrices(existing, fetched);
    expect(result.merged).toHaveLength(4);
    expect(result.merged[2]).toEqual({ date: '2024-01-03', close: 102 });
    expect(result.merged[3]).toEqual({ date: '2024-01-04', close: 103 });
    expect(result.conflicts).toHaveLength(0);
    expect(result.addedCount).toBe(2);
  });

  it('keeps existing data for overlapping dates with small deviation', () => {
    const existing: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
    ];
    const fetched: PricePoint[] = [
      { date: '2024-01-01', close: 100.5 }, // 0.5% deviation — below threshold
    ];
    const result = mergePrices(existing, fetched);
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].close).toBe(100); // keeps existing
    expect(result.conflicts).toHaveLength(0);
  });

  it('flags conflicts for overlapping dates with >1% deviation', () => {
    const existing: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
    ];
    const fetched: PricePoint[] = [
      { date: '2024-01-01', close: 105 }, // 5% deviation
    ];
    const result = mergePrices(existing, fetched);
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].close).toBe(100); // keeps existing by default
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toEqual({
      date: '2024-01-01',
      existingClose: 100,
      fetchedClose: 105,
    });
  });

  it('returns sorted results by date', () => {
    const existing: PricePoint[] = [
      { date: '2024-01-03', close: 103 },
      { date: '2024-01-01', close: 100 },
    ];
    const fetched: PricePoint[] = [
      { date: '2024-01-02', close: 101 },
      { date: '2024-01-04', close: 104 },
    ];
    const result = mergePrices(existing, fetched);
    expect(result.merged.map((p) => p.date)).toEqual([
      '2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04',
    ]);
  });

  it('handles empty existing data', () => {
    const result = mergePrices([], [{ date: '2024-01-01', close: 100 }]);
    expect(result.merged).toHaveLength(1);
    expect(result.addedCount).toBe(1);
  });

  it('handles empty fetched data', () => {
    const existing: PricePoint[] = [{ date: '2024-01-01', close: 100 }];
    const result = mergePrices(existing, []);
    expect(result.merged).toHaveLength(1);
    expect(result.addedCount).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/engine/price-merge.test.ts`
Expected: FAIL — module not found

**Step 3: Implement mergePrices**

Create `src/lib/engine/price-merge.ts`:

```typescript
import type { PricePoint } from '$lib/types';

export interface PriceConflict {
  date: string;
  existingClose: number;
  fetchedClose: number;
}

export interface MergeResult {
  merged: PricePoint[];
  conflicts: PriceConflict[];
  addedCount: number;
}

const CONFLICT_THRESHOLD = 0.01; // 1%

export function mergePrices(existing: PricePoint[], fetched: PricePoint[]): MergeResult {
  const existingMap = new Map(existing.map((p) => [p.date, p]));
  const conflicts: PriceConflict[] = [];
  let addedCount = 0;

  for (const fp of fetched) {
    const ep = existingMap.get(fp.date);
    if (ep) {
      // Overlapping date — check for conflict
      const deviation = Math.abs(fp.close - ep.close) / ep.close;
      if (deviation > CONFLICT_THRESHOLD) {
        conflicts.push({
          date: fp.date,
          existingClose: ep.close,
          fetchedClose: fp.close,
        });
      }
      // Keep existing data regardless (conflicts resolved later by user)
    } else {
      // New date — add it
      existingMap.set(fp.date, fp);
      addedCount++;
    }
  }

  const merged = Array.from(existingMap.values()).sort(
    (a, b) => a.date.localeCompare(b.date),
  );

  return { merged, conflicts, addedCount };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/engine/price-merge.test.ts`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add src/lib/engine/price-merge.ts src/lib/engine/price-merge.test.ts
git commit -m "feat: add price merge utility with conflict detection"
```

---

### Task 3: Create auto-refresh store module with tests (TDD)

**Files:**
- Create: `src/lib/stores/auto-refresh.ts`
- Create: `src/lib/stores/auto-refresh.test.ts`

**Step 1: Write failing tests**

Create `src/lib/stores/auto-refresh.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isAssetStale, getRefreshableAssets } from './auto-refresh';
import type { Asset } from '$lib/types';

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'test-id',
    name: 'Test Asset',
    isin: null,
    wkn: null,
    currency: 'EUR',
    prices: [{ date: '2024-01-01', close: 100 }],
    formatConfig: null,
    rawCSV: null,
    rawCSVStoredAt: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    lastRefreshedAt: null,
    ...overrides,
  };
}

describe('isAssetStale', () => {
  it('returns true if lastRefreshedAt is null and asset has ISIN', () => {
    expect(isAssetStale(makeAsset({ isin: 'US0378331005' }))).toBe(true);
  });

  it('returns true if lastRefreshedAt is null and asset has WKN', () => {
    expect(isAssetStale(makeAsset({ wkn: 'A0RPWH' }))).toBe(true);
  });

  it('returns false if asset has no ISIN and no WKN', () => {
    expect(isAssetStale(makeAsset())).toBe(false);
  });

  it('returns true if lastRefreshedAt is older than 24h', () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(isAssetStale(makeAsset({ isin: 'US0378331005', lastRefreshedAt: old }))).toBe(true);
  });

  it('returns false if lastRefreshedAt is within 24h', () => {
    const recent = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    expect(isAssetStale(makeAsset({ isin: 'US0378331005', lastRefreshedAt: recent }))).toBe(false);
  });
});

describe('getRefreshableAssets', () => {
  it('filters to only stale assets with identifiers', () => {
    const assets: Asset[] = [
      makeAsset({ id: '1', isin: 'US0378331005' }), // stale (no lastRefreshedAt)
      makeAsset({ id: '2', wkn: 'A0RPWH', lastRefreshedAt: new Date().toISOString() }), // fresh
      makeAsset({ id: '3' }), // no identifier
    ];
    const result = getRefreshableAssets(assets);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/stores/auto-refresh.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the auto-refresh module**

Create `src/lib/stores/auto-refresh.ts`:

```typescript
import { writable, get } from 'svelte/store';
import type { Asset } from '$lib/types';
import { assets, updateAsset } from './assets';
import { settings } from './settings';
import { fetchByISIN, fetchByWKN } from '$lib/scraper/index';
import { mergePrices, type PriceConflict } from '$lib/engine/price-merge';

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface RefreshProgress {
  active: boolean;
  current: number;
  total: number;
  currentAssetName: string;
  errors: Array<{ assetName: string; message: string }>;
  conflicts: Array<{ assetId: string; assetName: string; conflicts: PriceConflict[] }>;
}

const initialProgress: RefreshProgress = {
  active: false,
  current: 0,
  total: 0,
  currentAssetName: '',
  errors: [],
  conflicts: [],
};

export const refreshProgress = writable<RefreshProgress>({ ...initialProgress });

export function isAssetStale(asset: Asset): boolean {
  if (!asset.isin && !asset.wkn) return false;
  if (!asset.lastRefreshedAt) return true;
  const elapsed = Date.now() - new Date(asset.lastRefreshedAt).getTime();
  return elapsed > STALE_THRESHOLD_MS;
}

export function getRefreshableAssets(allAssets: Asset[]): Asset[] {
  return allAssets.filter(isAssetStale);
}

export async function autoRefreshAssets(): Promise<void> {
  const s = get(settings);
  if (s.autoRefreshAssets === false) return; // opt-out (default is enabled)

  const allAssets = get(assets);
  const stale = getRefreshableAssets(allAssets);
  if (stale.length === 0) return;

  const progress: RefreshProgress = {
    active: true,
    current: 0,
    total: stale.length,
    currentAssetName: '',
    errors: [],
    conflicts: [],
  };
  refreshProgress.set({ ...progress });

  for (const asset of stale) {
    progress.current++;
    progress.currentAssetName = asset.name;
    refreshProgress.set({ ...progress });

    try {
      const outcome = asset.isin
        ? await fetchByISIN(asset.isin)
        : asset.wkn
          ? await fetchByWKN(asset.wkn)
          : null;

      if (!outcome || !outcome.success) {
        const msg = outcome && !outcome.success ? outcome.error.message : 'No identifier available';
        progress.errors.push({ assetName: asset.name, message: msg });
        continue;
      }

      const mergeResult = mergePrices(asset.prices, outcome.data.prices);

      if (mergeResult.conflicts.length > 0) {
        progress.conflicts.push({
          assetId: asset.id,
          assetName: asset.name,
          conflicts: mergeResult.conflicts,
        });
      }

      if (mergeResult.addedCount > 0 || mergeResult.conflicts.length === 0) {
        await updateAsset({
          ...asset,
          prices: mergeResult.merged,
          updatedAt: new Date().toISOString(),
          lastRefreshedAt: new Date().toISOString(),
        });
      }
    } catch {
      progress.errors.push({ assetName: asset.name, message: 'Unexpected error during refresh' });
    }
  }

  progress.active = false;
  refreshProgress.set({ ...progress });
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/stores/auto-refresh.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/lib/stores/auto-refresh.ts src/lib/stores/auto-refresh.test.ts
git commit -m "feat: add auto-refresh store with staleness detection"
```

---

### Task 4: Wire auto-refresh into app startup

**Files:**
- Modify: `src/routes/+layout.svelte`

**Step 1: Import and call autoRefreshAssets after initStores**

In `src/routes/+layout.svelte`, update the `onMount` to call `autoRefreshAssets` after stores are initialized:

```svelte
<script lang="ts">
	import '../app.css';
	import Shell from '$lib/components/layout/Shell.svelte';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { initStores } from '$lib/stores/init';
	import { autoRefreshAssets } from '$lib/stores/auto-refresh';

	let { children }: { children: Snippet } = $props();

	onMount(async () => {
		await initStores();
		// Fire-and-forget: refresh stale assets in the background
		autoRefreshAssets();
	});
</script>
```

**Step 2: Verify build passes**

Run: `npm run check`
Expected: No errors

**Step 3: Commit**

```bash
git add src/routes/+layout.svelte
git commit -m "feat: trigger auto-refresh on app startup"
```

---

### Task 5: Add refresh progress toast with progress bar

**Files:**
- Create: `src/lib/components/shared/RefreshProgressToast.svelte`
- Modify: `src/routes/+layout.svelte`

**Step 1: Create the RefreshProgressToast component**

Create `src/lib/components/shared/RefreshProgressToast.svelte`:

```svelte
<script lang="ts">
	import { refreshProgress } from '$lib/stores/auto-refresh';

	const progress = $derived($refreshProgress);
	const visible = $derived(progress.active || progress.errors.length > 0 || progress.conflicts.length > 0);
	const percent = $derived(progress.total > 0 ? (progress.current / progress.total) * 100 : 0);

	let dismissed = $state(false);

	function dismiss() {
		dismissed = true;
	}

	// Reset dismissed when a new refresh starts
	$effect(() => {
		if (progress.active) dismissed = false;
	});
</script>

{#if visible && !dismissed}
	<div class="refresh-toast">
		<div class="refresh-toast-content">
			{#if progress.active}
				<div class="refresh-status">
					<span class="refresh-text">
						Refreshing assets… ({progress.current}/{progress.total})
					</span>
					<span class="refresh-asset-name">{progress.currentAssetName}</span>
				</div>
				<div class="progress-bar-track">
					<div class="progress-bar-fill" style="width: {percent}%"></div>
				</div>
			{:else}
				<div class="refresh-done">
					{#if progress.errors.length > 0}
						<span class="refresh-errors">
							{progress.errors.length} asset{progress.errors.length > 1 ? 's' : ''} failed to refresh
						</span>
					{/if}
					{#if progress.conflicts.length > 0}
						<span class="refresh-conflicts">
							{progress.conflicts.length} asset{progress.conflicts.length > 1 ? 's' : ''} have price conflicts
						</span>
					{/if}
					{#if progress.errors.length === 0 && progress.conflicts.length === 0}
						<span class="refresh-success">All assets refreshed</span>
					{/if}
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
	.refresh-toast {
		position: fixed;
		bottom: var(--spacing-lg);
		right: var(--spacing-lg);
		z-index: 1000;
		min-width: 300px;
		max-width: 420px;
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
		animation: toast-slide-in 0.3s ease-out;
		backdrop-filter: blur(12px);
	}

	.refresh-toast-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.refresh-status {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--spacing-sm);
	}

	.refresh-text {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-primary);
	}

	.refresh-asset-name {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 160px;
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

	.refresh-done {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm);
	}

	.refresh-errors {
		font-size: var(--font-size-sm);
		color: var(--color-warning, #e6a817);
	}

	.refresh-conflicts {
		font-size: var(--font-size-sm);
		color: var(--color-warning, #e6a817);
	}

	.refresh-success {
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

	@keyframes toast-slide-in {
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

**Step 2: Add the toast component to the layout**

In `src/routes/+layout.svelte`, add the import and render:

```svelte
<script lang="ts">
	import '../app.css';
	import Shell from '$lib/components/layout/Shell.svelte';
	import RefreshProgressToast from '$lib/components/shared/RefreshProgressToast.svelte';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { initStores } from '$lib/stores/init';
	import { autoRefreshAssets } from '$lib/stores/auto-refresh';

	let { children }: { children: Snippet } = $props();

	onMount(async () => {
		await initStores();
		autoRefreshAssets();
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
```

**Step 3: Verify build passes**

Run: `npm run check`
Expected: No errors

**Step 4: Commit**

```bash
git add src/lib/components/shared/RefreshProgressToast.svelte src/routes/+layout.svelte
git commit -m "feat: add refresh progress toast with progress bar"
```

---

### Task 6: Add auto-refresh toggle to settings page

**Files:**
- Modify: `src/routes/settings/+page.svelte`

**Step 1: Add autoRefreshAssets state variable**

In the `<script>` section of `src/routes/settings/+page.svelte`, add a new state variable after the existing `autoResolveNames`:

```typescript
let autoRefreshOnStartup = $state(true);
```

**Step 2: Initialize from settings store**

In the `$effect` that reads from `$settings`, add:

```typescript
if (s.autoRefreshAssets !== undefined) autoRefreshOnStartup = s.autoRefreshAssets as boolean;
```

**Step 3: Save the setting in handleSave**

Add to the `Promise.all` array in `handleSave`:

```typescript
setSetting('autoRefreshAssets', autoRefreshOnStartup),
```

**Step 4: Add the UI toggle**

In the "Import" Card section, after the Auto-Import Mode setting row, add:

```svelte
<div class="setting-row" style="margin-top: var(--spacing-lg);">
	<div class="setting-info">
		<span class="setting-label">Auto-Refresh on Startup</span>
		<span class="setting-description">Automatically fetch latest prices for assets with ISIN/WKN when opening Sweetfolio</span>
	</div>
	<div class="setting-control">
		<button
			class="theme-switch"
			onclick={() => autoRefreshOnStartup = !autoRefreshOnStartup}
		>
			<span class="theme-option" class:active={autoRefreshOnStartup}>On</span>
			<span class="theme-option" class:active={!autoRefreshOnStartup}>Off</span>
		</button>
	</div>
</div>
```

**Step 5: Verify build passes**

Run: `npm run check`
Expected: No errors

**Step 6: Commit**

```bash
git add src/routes/settings/+page.svelte
git commit -m "feat: add auto-refresh toggle to settings page"
```

---

### Task 7: Run all tests and verify

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 2: Run type checking**

Run: `npm run check`
Expected: No errors

**Step 3: Final commit if any fixups needed**

---

### Task 8 (Future / Optional): Conflict resolution modal

This task is deferred — the current implementation flags conflicts in the toast but doesn't provide a resolution UI. For now, conflicting data keeps the existing values. A future task can add a modal that lists conflicts and lets the user choose "Keep existing" or "Use new data" per asset.
