# Asset Classification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a classification field to assets (stock, ETF, ETN, etc.) with auto-detection from Onvista, manual editing, and filtering on the assets page.

**Architecture:** Flat enum `AssetClassification` on the `Asset` type. Onvista fetcher returns classification via `FetchResult`. DB migration backfills `'unknown'`. UI shows badges and filter dropdown.

**Tech Stack:** Svelte 5 (runes), IndexedDB, Vitest, TypeScript

---

### Task 1: Add AssetClassification type and update Asset interface

**Files:**
- Modify: `src/lib/types/index.ts:1-21`

**Step 1: Add the classification type and update Asset**

In `src/lib/types/index.ts`, add after the `PricePoint` interface (before `Asset`):

```typescript
export const ASSET_CLASSIFICATIONS = [
  'stock', 'etf', 'etn', 'etc',
  'fund', 'bond', 'certificate',
  'crypto', 'commodity', 'unknown',
] as const;

export type AssetClassification = (typeof ASSET_CLASSIFICATIONS)[number];
```

Add `classification: AssetClassification;` to the `Asset` interface after `currency`.

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: Type errors in files that create Asset objects without `classification`. This is expected and will be fixed in subsequent tasks.

**Step 3: Commit**

```bash
git add src/lib/types/index.ts
git commit -m "feat(types): add AssetClassification type to Asset interface"
```

---

### Task 2: Add classification to FetchResult and Onvista fetcher

**Files:**
- Modify: `src/lib/fetchers/types.ts:8-14`
- Modify: `src/lib/fetchers/onvista.ts:67-80,209-250`

**Step 1: Add classification to FetchResult**

In `src/lib/fetchers/types.ts`, add to `FetchResult`:

```typescript
import type { PricePoint, AssetClassification } from '$lib/types';

export interface FetchResult {
  prices: PricePoint[];
  name: string | null;
  isin: string | null;
  wkn: string | null;
  currency: string | null;
  classification: AssetClassification | null;
}
```

**Step 2: Add entity type → classification mapping in Onvista fetcher**

In `src/lib/fetchers/onvista.ts`, add a mapping function after `entityTypePath`:

```typescript
import type { AssetClassification } from '$lib/types';

function mapEntityTypeToClassification(entityType: string): AssetClassification {
  const map: Record<string, AssetClassification> = {
    STOCK: 'stock',
    ETF: 'etf',
    FUND: 'fund',
    BOND: 'bond',
    COMMODITY: 'commodity',
    PRECIOUS_METAL: 'commodity',
    DERIVATIVE: 'certificate',
  };
  return map[entityType] ?? 'unknown';
}
```

**Step 3: Return classification from fetchPriceData**

In the `fetchPriceData` function, add `classification` to the returned `FetchResult`:

```typescript
return {
  success: true,
  data: {
    prices,
    name: snapshot.name || instrument.name,
    isin: snapshot.isin ?? null,
    wkn: snapshot.wkn ?? null,
    currency: snapshot.isoCurrency,
    classification: mapEntityTypeToClassification(instrument.entityType),
  },
};
```

**Step 4: Commit**

```bash
git add src/lib/fetchers/types.ts src/lib/fetchers/onvista.ts
git commit -m "feat(fetchers): return classification from Onvista data source"
```

---

### Task 3: Add classification to ScraperResult and scraper module

**Files:**
- Modify: `src/lib/scraper/index.ts:19-24,133-211`

**Step 1: Add classification to ScraperResult**

```typescript
import type { AssetClassification } from '$lib/types';

export interface ScraperResult {
  prices: PricePoint[];
  name: string | null;
  currency: string | null;
  source: string;
  classification: AssetClassification | null;
}
```

**Step 2: Update DataSource interface and registrations**

Update the `DataSource` interface return type to include `classification`:

```typescript
interface DataSource {
  name: string;
  fetchByISIN(isin: string): Promise<Omit<ScraperResult, 'source'> | null>;
  fetchByWKN?(wkn: string): Promise<Omit<ScraperResult, 'source'> | null>;
}
```

Update Onvista registration to pass through `classification`:

```typescript
registerDataSource({
  name: 'onvista',
  async fetchByISIN(isin) {
    const outcome = await onvistaFetch(isin);
    if (!outcome.success) return null;
    return {
      prices: outcome.data.prices,
      name: outcome.data.name,
      currency: outcome.data.currency,
      classification: outcome.data.classification,
    };
  },
  async fetchByWKN(wkn) {
    const outcome = await onvistaFetch(wkn);
    if (!outcome.success) return null;
    return {
      prices: outcome.data.prices,
      name: outcome.data.name,
      currency: outcome.data.currency,
      classification: outcome.data.classification,
    };
  },
});
```

Update Alpha Vantage registration to return `classification: null`:

```typescript
// In both fetchByISIN and fetchByWKN:
return {
  prices: outcome.data.prices,
  name: outcome.data.name,
  currency: outcome.data.currency,
  classification: outcome.data.classification,
};
```

**Step 3: Commit**

```bash
git add src/lib/scraper/index.ts
git commit -m "feat(scraper): pass through classification from data sources"
```

---

### Task 4: DB migration (version 2 → 3)

**Files:**
- Modify: `src/lib/storage/db.ts`

**Step 1: Bump version and add migration**

Change `DB_VERSION` from `2` to `3`.

In `onupgradeneeded`, add migration logic after existing store creation. When upgrading from version < 3:

```typescript
// Migration: add classification to existing assets
if (event.oldVersion < 3) {
  const tx = (event.target as IDBOpenDBRequest).transaction!;
  if (db.objectStoreNames.contains('assets')) {
    const store = tx.objectStore('assets');
    store.createIndex('by-classification', 'classification', { unique: false });

    // Backfill existing assets with 'unknown'
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        const asset = cursor.value;
        if (!asset.classification) {
          asset.classification = 'unknown';
          cursor.update(asset);
        }
        cursor.continue();
      }
    };
  }
}
```

**Step 2: Verify the app loads without errors**

Run: `npm run dev` (manual check) or `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/lib/storage/db.ts
git commit -m "feat(db): migrate to v3 with classification field and index"
```

---

### Task 5: Update asset creation in assets page (identifier import + CSV import)

**Files:**
- Modify: `src/routes/assets/+page.svelte`

**Step 1: Update identifier lookup confirm to include classification**

In `handleLookupConfirm()`, add `classification` to the asset object:

```typescript
classification: lookupResult.classification ?? 'unknown',
```

**Step 2: Update CSV auto-import to set classification**

In `processFilesWithAutoImport()`, add `classification: 'unknown'` to the asset object.

**Step 3: Update manual CSV import to set classification**

In `handleImportConfirm()`, add `classification: 'unknown'` to the asset object. (FormatConfigModal dropdown is Task 7.)

**Step 4: Commit**

```bash
git add src/routes/assets/+page.svelte
git commit -m "feat(assets): include classification when creating assets"
```

---

### Task 6: Update asset detail page edit modal

**Files:**
- Modify: `src/routes/assets/[slug]/+page.svelte`

**Step 1: Add classification to edit modal state**

Add:

```typescript
import { ASSET_CLASSIFICATIONS, type AssetClassification } from '$lib/types';

let editClassification: AssetClassification = $state('unknown');
```

**Step 2: Populate on modal open**

In `openEditModal()`:

```typescript
editClassification = asset.classification;
```

**Step 3: Add dropdown to edit modal template**

After the currency dropdown, add:

```svelte
<label class="edit-label">
  Classification
  <select class="edit-select" bind:value={editClassification}>
    {#each ASSET_CLASSIFICATIONS as cls}
      <option value={cls}>{cls.toUpperCase()}</option>
    {/each}
  </select>
</label>
```

**Step 4: Include classification in save**

In `handleEditSave()`, add `classification: editClassification` to the spread.

**Step 5: Commit**

```bash
git add src/routes/assets/[slug]/+page.svelte
git commit -m "feat(asset-detail): add classification to edit modal"
```

---

### Task 7: Add classification dropdown to FormatConfigModal

**Files:**
- Modify: `src/lib/components/shared/FormatConfigModal.svelte`
- Modify: `src/routes/assets/+page.svelte` (wire up binding)

**Step 1: Add assetClassification prop to FormatConfigModal**

Add a new bindable prop:

```typescript
import { ASSET_CLASSIFICATIONS, type AssetClassification } from '$lib/types';

assetClassification = $bindable('unknown' as AssetClassification),
```

Add the type to the props interface too.

**Step 2: Add dropdown in the modal template**

After the currency select, add:

```svelte
<label class="config-label">
  Classification
  <select class="config-select" bind:value={assetClassification}>
    {#each ASSET_CLASSIFICATIONS as cls}
      <option value={cls}>{cls.toUpperCase()}</option>
    {/each}
  </select>
</label>
```

**Step 3: Wire up in assets page**

In `+page.svelte`, add state:

```typescript
let assetClassification: AssetClassification = $state('unknown');
```

Bind it to FormatConfigModal:

```svelte
bind:assetClassification
```

Use it in `handleImportConfirm()`:

```typescript
classification: assetClassification,
```

Reset it after import:

```typescript
assetClassification = 'unknown';
```

**Step 4: Commit**

```bash
git add src/lib/components/shared/FormatConfigModal.svelte src/routes/assets/+page.svelte
git commit -m "feat(import): add classification dropdown to CSV import modal"
```

---

### Task 8: Add classification badge and filter to asset list

**Files:**
- Modify: `src/routes/assets/+page.svelte`

**Step 1: Add classification filter state**

```typescript
let classificationFilter: AssetClassification | 'all' = $state('all');
```

**Step 2: Filter the asset list**

Update the `assetList` derived to apply the filter:

```typescript
const filteredAssetList = $derived(
  classificationFilter === 'all'
    ? assetList
    : assetList.filter((a) => a.classification === classificationFilter)
);
```

Add `classification` to the assetList mapping:

```typescript
classification: a.classification,
```

**Step 3: Add filter dropdown above the table**

Before the table, add:

```svelte
<div class="asset-list-toolbar">
  <select class="classification-filter" bind:value={classificationFilter}>
    <option value="all">All types</option>
    {#each ASSET_CLASSIFICATIONS as cls}
      <option value={cls}>{cls.toUpperCase()}</option>
    {/each}
  </select>
</div>
```

**Step 4: Add classification badge in table**

Add a `Type` column header after `Name`. In the row, show a badge:

```svelte
<td>
  <span class="classification-badge classification-{asset.classification}">
    {asset.classification.toUpperCase()}
  </span>
</td>
```

**Step 5: Use filteredAssetList in the template**

Replace `assetList` with `filteredAssetList` in the `{#each}` block and in the empty-state check.

**Step 6: Add badge styles**

```css
.classification-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  background: var(--color-bg-tertiary, rgba(255,255,255,0.05));
  color: var(--color-text-secondary);
}

.classification-stock { color: var(--color-accent); background: rgba(141, 208, 196, 0.1); }
.classification-etf { color: #7db3ff; background: rgba(125, 179, 255, 0.1); }
.classification-etn { color: #7db3ff; background: rgba(125, 179, 255, 0.08); }
.classification-etc { color: #7db3ff; background: rgba(125, 179, 255, 0.06); }
.classification-fund { color: #c49bff; background: rgba(196, 155, 255, 0.1); }
.classification-bond { color: #ffd700; background: rgba(255, 215, 0, 0.1); }
.classification-certificate { color: #ff9b7d; background: rgba(255, 155, 125, 0.1); }
.classification-crypto { color: #f7931a; background: rgba(247, 147, 26, 0.1); }
.classification-commodity { color: #d4a574; background: rgba(212, 165, 116, 0.1); }
.classification-unknown { color: var(--color-text-muted); }

.asset-list-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--spacing-sm);
}

.classification-filter {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-sm);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
}
```

**Step 7: Commit**

```bash
git add src/routes/assets/+page.svelte
git commit -m "feat(assets): add classification badges and filter to asset list"
```

---

### Task 9: Update export/import schema

**Files:**
- Modify: `src/lib/io/schema.ts`
- Modify: `src/lib/io/import.ts` (if migration logic needed for v1 imports)

**Step 1: Bump CURRENT_VERSION to 2**

In `schema.ts`, change `CURRENT_VERSION = 1` to `CURRENT_VERSION = 2`.

**Step 2: Add v1 import migration**

In the import flow (likely `import.ts` or `conflicts.ts`), when loading a v1 export, backfill `classification: 'unknown'` on all assets that lack the field:

```typescript
// After parsing the export envelope:
if (exported.version < 2 && exported.data.assets) {
  for (const asset of exported.data.assets) {
    if (!(asset as any).classification) {
      (asset as any).classification = 'unknown';
    }
  }
}
```

**Step 3: Verify round-trip**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/lib/io/schema.ts src/lib/io/import.ts
git commit -m "feat(io): bump export schema to v2 with classification support"
```

---

### Task 10: Final verification

**Step 1: Run full type check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (existing tests may need `classification: 'unknown'` added to test fixtures).

**Step 3: Fix any test fixtures**

If tests create Asset objects, add `classification: 'unknown'` to them.

**Step 4: Manual smoke test**

Run: `npm run dev`
- Check existing assets show "UNKNOWN" badge
- Import a new asset by ISIN → should auto-detect type
- Edit an asset → classification dropdown works
- Filter by classification → works

**Step 5: Commit any test fixes**

```bash
git add -A
git commit -m "fix(tests): add classification field to test fixtures"
```
