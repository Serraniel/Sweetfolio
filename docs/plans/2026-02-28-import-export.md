# Import/Export Data Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable users to export all Sweetfolio data as a versioned JSON file and import it back with configurable scope and per-conflict resolution.

**Architecture:** New `src/lib/io/` module handles schema definition, export assembly, import validation/migration, and conflict detection. New Svelte components under `src/lib/components/io/` provide the UI (export modal, import wizard with conflict resolver). Settings page gets a "Data Management" section wiring it all together.

**Tech Stack:** SvelteKit, Svelte 5, TypeScript, Vitest, IndexedDB (via existing storage layer)

---

### Task 1: Schema and type definitions

**Files:**
- Create: `src/lib/io/schema.ts`
- Test: `src/lib/io/schema.test.ts`

**Step 1: Write the failing test**

Create `src/lib/io/schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  CURRENT_VERSION,
  ALL_SCOPES,
  type SweetfolioExport,
  type SweetfolioScope,
  isValidExportEnvelope,
} from './schema';

describe('schema', () => {
  it('CURRENT_VERSION is a positive integer', () => {
    expect(CURRENT_VERSION).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(CURRENT_VERSION)).toBe(true);
  });

  it('ALL_SCOPES contains all five categories', () => {
    expect(ALL_SCOPES).toEqual(['assets', 'portfolios', 'settings', 'currencies', 'simulations']);
  });

  it('isValidExportEnvelope accepts valid envelope', () => {
    const valid: SweetfolioExport = {
      format: 'sweetfolio',
      version: 1,
      exportedAt: '2026-02-28T12:00:00Z',
      scopes: ['assets'],
      data: { assets: [] },
    };
    expect(isValidExportEnvelope(valid)).toBe(true);
  });

  it('isValidExportEnvelope rejects missing format', () => {
    expect(isValidExportEnvelope({ version: 1 })).toBe(false);
  });

  it('isValidExportEnvelope rejects wrong format string', () => {
    expect(isValidExportEnvelope({ format: 'other', version: 1, exportedAt: '', scopes: [], data: {} })).toBe(false);
  });

  it('isValidExportEnvelope rejects non-integer version', () => {
    expect(isValidExportEnvelope({ format: 'sweetfolio', version: 1.5, exportedAt: '', scopes: [], data: {} })).toBe(false);
  });

  it('isValidExportEnvelope rejects version below 1', () => {
    expect(isValidExportEnvelope({ format: 'sweetfolio', version: 0, exportedAt: '', scopes: [], data: {} })).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/io/schema.test.ts`
Expected: FAIL — module `./schema` not found

**Step 3: Write minimal implementation**

Create `src/lib/io/schema.ts`:

```typescript
import type { Asset, Portfolio, CurrencyRate, StoredSimulation } from '$lib/types';

export const CURRENT_VERSION = 1;

export const ALL_SCOPES = [
  'assets',
  'portfolios',
  'settings',
  'currencies',
  'simulations',
] as const;

export type SweetfolioScope = (typeof ALL_SCOPES)[number];

export interface SweetfolioExport {
  format: 'sweetfolio';
  version: number;
  exportedAt: string;
  scopes: SweetfolioScope[];
  data: {
    assets?: Asset[];
    portfolios?: Portfolio[];
    settings?: Record<string, unknown>;
    currencies?: CurrencyRate[];
    simulations?: StoredSimulation[];
  };
}

export function isValidExportEnvelope(obj: unknown): obj is SweetfolioExport {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  if (o.format !== 'sweetfolio') return false;
  if (typeof o.version !== 'number' || !Number.isInteger(o.version) || o.version < 1) return false;
  if (typeof o.exportedAt !== 'string') return false;
  if (!Array.isArray(o.scopes)) return false;
  if (typeof o.data !== 'object' || o.data === null) return false;
  return true;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/io/schema.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/io/schema.ts src/lib/io/schema.test.ts
git commit -m "feat(io): add export schema types and validation"
```

---

### Task 2: Migration system

**Files:**
- Create: `src/lib/io/migrations.ts`
- Test: `src/lib/io/migrations.test.ts`

**Step 1: Write the failing test**

Create `src/lib/io/migrations.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { migrateToLatest } from './migrations';
import { CURRENT_VERSION } from './schema';

describe('migrateToLatest', () => {
  it('returns data unchanged when version matches current', () => {
    const data = {
      format: 'sweetfolio' as const,
      version: CURRENT_VERSION,
      exportedAt: '2026-01-01T00:00:00Z',
      scopes: ['assets' as const],
      data: { assets: [] },
    };
    const result = migrateToLatest(data);
    expect(result).toEqual(data);
  });

  it('throws for unknown future version', () => {
    const data = {
      format: 'sweetfolio' as const,
      version: 9999,
      exportedAt: '',
      scopes: [],
      data: {},
    };
    expect(() => migrateToLatest(data)).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/io/migrations.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `src/lib/io/migrations.ts`:

```typescript
import type { SweetfolioExport } from './schema';
import { CURRENT_VERSION } from './schema';

type Migration = (data: unknown) => unknown;

const migrations: Record<number, Migration> = {
  // Example: 1: (data) => { /* v1 → v2 */ return { ...data, version: 2 }; },
};

export function migrateToLatest(data: SweetfolioExport): SweetfolioExport {
  let current = data as Record<string, unknown>;

  if ((current.version as number) > CURRENT_VERSION) {
    throw new Error(
      `Export version ${current.version} is newer than supported version ${CURRENT_VERSION}. Please update Sweetfolio.`,
    );
  }

  while ((current.version as number) < CURRENT_VERSION) {
    const version = current.version as number;
    const migrate = migrations[version];
    if (!migrate) {
      throw new Error(`No migration available for version ${version}`);
    }
    current = migrate(current) as Record<string, unknown>;
  }

  return current as unknown as SweetfolioExport;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/io/migrations.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/io/migrations.ts src/lib/io/migrations.test.ts
git commit -m "feat(io): add version migration system"
```

---

### Task 3: Export logic

**Files:**
- Create: `src/lib/io/export.ts`
- Test: `src/lib/io/export.test.ts`

**Step 1: Write the failing test**

Create `src/lib/io/export.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { buildExport } from './export';
import { CURRENT_VERSION } from './schema';
import type { Asset, Portfolio } from '$lib/types';

async function resetDB() {
  const req = indexedDB.deleteDatabase('sweetfolio');
  await new Promise<void>((resolve, reject) => {
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

describe('buildExport', () => {
  beforeEach(async () => {
    await resetDB();
  });

  it('exports selected scopes only', async () => {
    const { getDB } = await import('$lib/storage/db');
    const assetsDb = await import('$lib/storage/assets');
    await getDB();

    const asset: Asset = {
      id: 'a1',
      name: 'Test',
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
    };
    await assetsDb.put(asset);

    const result = await buildExport(['assets']);
    expect(result.format).toBe('sweetfolio');
    expect(result.version).toBe(CURRENT_VERSION);
    expect(result.scopes).toEqual(['assets']);
    expect(result.data.assets).toHaveLength(1);
    expect(result.data.portfolios).toBeUndefined();
    expect(result.data.settings).toBeUndefined();
    expect(result.data.currencies).toBeUndefined();
    expect(result.data.simulations).toBeUndefined();
  });

  it('exports multiple scopes', async () => {
    const { getDB } = await import('$lib/storage/db');
    await getDB();

    const result = await buildExport(['assets', 'portfolios', 'settings']);
    expect(result.scopes).toEqual(['assets', 'portfolios', 'settings']);
    expect(result.data.assets).toBeDefined();
    expect(result.data.portfolios).toBeDefined();
    expect(result.data.settings).toBeDefined();
  });

  it('sets exportedAt to a valid ISO string', async () => {
    const { getDB } = await import('$lib/storage/db');
    await getDB();

    const result = await buildExport(['assets']);
    expect(new Date(result.exportedAt).toISOString()).toBe(result.exportedAt);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/io/export.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `src/lib/io/export.ts`:

```typescript
import type { SweetfolioExport, SweetfolioScope } from './schema';
import { CURRENT_VERSION } from './schema';
import * as assetsDb from '$lib/storage/assets';
import * as portfoliosDb from '$lib/storage/portfolios';
import * as settingsDb from '$lib/storage/settings';
import * as currenciesDb from '$lib/storage/currencies';
import * as simulationsDb from '$lib/storage/simulations';

export async function buildExport(scopes: SweetfolioScope[]): Promise<SweetfolioExport> {
  const data: SweetfolioExport['data'] = {};

  if (scopes.includes('assets')) data.assets = await assetsDb.getAll();
  if (scopes.includes('portfolios')) data.portfolios = await portfoliosDb.getAll();
  if (scopes.includes('settings')) data.settings = await settingsDb.getAll();
  if (scopes.includes('currencies')) data.currencies = await currenciesDb.getAll();
  if (scopes.includes('simulations')) data.simulations = await simulationsDb.getAll();

  return {
    format: 'sweetfolio',
    version: CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    scopes,
    data,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/io/export.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/io/export.ts src/lib/io/export.test.ts
git commit -m "feat(io): add export builder"
```

---

### Task 4: Download helper

**Files:**
- Create: `src/lib/io/download.ts`

No tests needed — this is a thin browser API wrapper (creates Blob + anchor click).

**Step 1: Write implementation**

Create `src/lib/io/download.ts`:

```typescript
import type { SweetfolioExport } from './schema';

export function triggerDownload(data: SweetfolioExport): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);

  const a = document.createElement('a');
  a.href = url;
  a.download = `sweetfolio-export-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

**Step 2: Commit**

```bash
git add src/lib/io/download.ts
git commit -m "feat(io): add file download helper"
```

---

### Task 5: Import parser (validate + migrate)

**Files:**
- Create: `src/lib/io/import.ts`
- Test: `src/lib/io/import.test.ts`

**Step 1: Write the failing test**

Create `src/lib/io/import.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseImportFile } from './import';
import { CURRENT_VERSION } from './schema';

function makeBlob(obj: unknown): File {
  const json = JSON.stringify(obj);
  return new File([json], 'test.json', { type: 'application/json' });
}

describe('parseImportFile', () => {
  it('parses a valid export file', async () => {
    const file = makeBlob({
      format: 'sweetfolio',
      version: CURRENT_VERSION,
      exportedAt: '2026-01-01T00:00:00Z',
      scopes: ['assets'],
      data: { assets: [] },
    });
    const result = await parseImportFile(file);
    expect(result.format).toBe('sweetfolio');
    expect(result.scopes).toEqual(['assets']);
  });

  it('rejects non-JSON file', async () => {
    const file = new File(['not json'], 'test.json', { type: 'application/json' });
    await expect(parseImportFile(file)).rejects.toThrow('Invalid JSON');
  });

  it('rejects file with wrong format', async () => {
    const file = makeBlob({ format: 'other', version: 1 });
    await expect(parseImportFile(file)).rejects.toThrow('not a valid Sweetfolio export');
  });

  it('rejects file with future version', async () => {
    const file = makeBlob({
      format: 'sweetfolio',
      version: 9999,
      exportedAt: '',
      scopes: [],
      data: {},
    });
    await expect(parseImportFile(file)).rejects.toThrow('newer than supported');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/io/import.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

Create `src/lib/io/import.ts`:

```typescript
import type { SweetfolioExport } from './schema';
import { isValidExportEnvelope } from './schema';
import { migrateToLatest } from './migrations';

export async function parseImportFile(file: File): Promise<SweetfolioExport> {
  const text = await file.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON: the file could not be parsed.');
  }

  if (!isValidExportEnvelope(parsed)) {
    throw new Error('This is not a valid Sweetfolio export file.');
  }

  return migrateToLatest(parsed);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/io/import.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/io/import.ts src/lib/io/import.test.ts
git commit -m "feat(io): add import file parser with validation and migration"
```

---

### Task 6: Conflict detection

**Files:**
- Create: `src/lib/io/conflicts.ts`
- Test: `src/lib/io/conflicts.test.ts`

**Step 1: Write the failing test**

Create `src/lib/io/conflicts.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectConflicts, type ConflictReport, type ConflictItem } from './conflicts';
import type { Asset, Portfolio, CurrencyRate } from '$lib/types';

describe('detectConflicts', () => {
  it('detects no conflicts when existing data is empty', () => {
    const imported = {
      assets: [
        { id: 'a1', name: 'New Asset' } as Asset,
      ],
    };
    const existing = { assets: [], portfolios: [], currencies: [], simulations: [], settings: {} };
    const report = detectConflicts(imported, existing);
    expect(report.assets.newItems).toHaveLength(1);
    expect(report.assets.conflicts).toHaveLength(0);
  });

  it('detects asset conflict by matching id', () => {
    const asset = { id: 'a1', name: 'Existing' } as Asset;
    const importedAsset = { id: 'a1', name: 'Imported' } as Asset;
    const imported = { assets: [importedAsset] };
    const existing = { assets: [asset], portfolios: [], currencies: [], simulations: [], settings: {} };
    const report = detectConflicts(imported, existing);
    expect(report.assets.conflicts).toHaveLength(1);
    expect(report.assets.conflicts[0].existing.name).toBe('Existing');
    expect(report.assets.conflicts[0].imported.name).toBe('Imported');
    expect(report.assets.newItems).toHaveLength(0);
  });

  it('detects currency conflict by matching pair', () => {
    const rate: CurrencyRate = { pair: 'USDEUR', rates: [] };
    const imported = { currencies: [rate] };
    const existing = { assets: [], portfolios: [], currencies: [rate], simulations: [], settings: {} };
    const report = detectConflicts(imported, existing);
    expect(report.currencies.conflicts).toHaveLength(1);
    expect(report.currencies.newItems).toHaveLength(0);
  });

  it('detects setting conflicts by key', () => {
    const imported = { settings: { mainCurrency: 'USD', newSetting: true } };
    const existing = { assets: [], portfolios: [], currencies: [], simulations: [], settings: { mainCurrency: 'EUR' } };
    const report = detectConflicts(imported, existing);
    expect(report.settings.conflicts).toHaveLength(1);
    expect(report.settings.conflicts[0].key).toBe('mainCurrency');
    expect(report.settings.newItems).toHaveLength(1);
  });

  it('returns empty report for scopes not in imported data', () => {
    const imported = {};
    const existing = { assets: [], portfolios: [], currencies: [], simulations: [], settings: {} };
    const report = detectConflicts(imported, existing);
    expect(report.assets.conflicts).toHaveLength(0);
    expect(report.assets.newItems).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/io/conflicts.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

Create `src/lib/io/conflicts.ts`:

```typescript
import type { Asset, Portfolio, CurrencyRate, StoredSimulation } from '$lib/types';
import type { SweetfolioExport } from './schema';

export interface ConflictItem<T> {
  existing: T;
  imported: T;
  resolution?: 'keep' | 'replace' | 'skip';
}

export interface SettingConflict {
  key: string;
  existing: unknown;
  imported: unknown;
  resolution?: 'keep' | 'replace' | 'skip';
}

export interface ScopeReport<T> {
  newItems: T[];
  conflicts: ConflictItem<T>[];
}

export interface SettingScopeReport {
  newItems: Array<{ key: string; value: unknown }>;
  conflicts: SettingConflict[];
}

export interface ConflictReport {
  assets: ScopeReport<Asset>;
  portfolios: ScopeReport<Portfolio>;
  currencies: ScopeReport<CurrencyRate>;
  simulations: ScopeReport<StoredSimulation>;
  settings: SettingScopeReport;
}

interface ExistingData {
  assets: Asset[];
  portfolios: Portfolio[];
  currencies: CurrencyRate[];
  simulations: StoredSimulation[];
  settings: Record<string, unknown>;
}

function detectIdConflicts<T extends { id: string }>(
  imported: T[] | undefined,
  existing: T[],
): ScopeReport<T> {
  if (!imported || imported.length === 0) return { newItems: [], conflicts: [] };
  const existingMap = new Map(existing.map((item) => [item.id, item]));
  const newItems: T[] = [];
  const conflicts: ConflictItem<T>[] = [];

  for (const item of imported) {
    const match = existingMap.get(item.id);
    if (match) {
      conflicts.push({ existing: match, imported: item });
    } else {
      newItems.push(item);
    }
  }

  return { newItems, conflicts };
}

export function detectConflicts(
  imported: SweetfolioExport['data'],
  existing: ExistingData,
): ConflictReport {
  // Currencies use 'pair' as key instead of 'id'
  const currencyReport: ScopeReport<CurrencyRate> = (() => {
    if (!imported.currencies || imported.currencies.length === 0) return { newItems: [], conflicts: [] };
    const existingMap = new Map(existing.currencies.map((c) => [c.pair, c]));
    const newItems: CurrencyRate[] = [];
    const conflicts: ConflictItem<CurrencyRate>[] = [];
    for (const item of imported.currencies) {
      const match = existingMap.get(item.pair);
      if (match) {
        conflicts.push({ existing: match, imported: item });
      } else {
        newItems.push(item);
      }
    }
    return { newItems, conflicts };
  })();

  // Settings use key-value pairs
  const settingsReport: SettingScopeReport = (() => {
    if (!imported.settings) return { newItems: [], conflicts: [] };
    const newItems: Array<{ key: string; value: unknown }> = [];
    const conflicts: SettingConflict[] = [];
    for (const [key, value] of Object.entries(imported.settings)) {
      if (key in existing.settings) {
        conflicts.push({ key, existing: existing.settings[key], imported: value });
      } else {
        newItems.push({ key, value });
      }
    }
    return { newItems, conflicts };
  })();

  return {
    assets: detectIdConflicts(imported.assets, existing.assets),
    portfolios: detectIdConflicts(imported.portfolios, existing.portfolios),
    currencies: currencyReport,
    simulations: detectIdConflicts(imported.simulations, existing.simulations),
    settings: settingsReport,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/io/conflicts.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/io/conflicts.ts src/lib/io/conflicts.test.ts
git commit -m "feat(io): add conflict detection for import"
```

---

### Task 7: Import apply logic

**Files:**
- Create: `src/lib/io/apply.ts`
- Test: `src/lib/io/apply.test.ts`

**Step 1: Write the failing test**

Create `src/lib/io/apply.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { applyImport } from './apply';
import type { Asset, Portfolio } from '$lib/types';
import type { ConflictReport } from './conflicts';

async function resetDB() {
  const req = indexedDB.deleteDatabase('sweetfolio');
  await new Promise<void>((resolve, reject) => {
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

describe('applyImport', () => {
  beforeEach(async () => {
    await resetDB();
  });

  it('writes new assets to IndexedDB', async () => {
    const { getDB } = await import('$lib/storage/db');
    const assetsDb = await import('$lib/storage/assets');
    await getDB();

    const asset: Asset = {
      id: 'new-1',
      name: 'Imported',
      isin: null,
      wkn: null,
      currency: 'EUR',
      prices: [],
      formatConfig: null,
      rawCSV: null,
      rawCSVStoredAt: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      lastRefreshedAt: null,
    };

    const report: ConflictReport = {
      assets: { newItems: [asset], conflicts: [] },
      portfolios: { newItems: [], conflicts: [] },
      currencies: { newItems: [], conflicts: [] },
      simulations: { newItems: [], conflicts: [] },
      settings: { newItems: [], conflicts: [] },
    };

    await applyImport(report);

    const all = await assetsDb.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('new-1');
  });

  it('writes replaced conflicts to IndexedDB', async () => {
    const { getDB } = await import('$lib/storage/db');
    const assetsDb = await import('$lib/storage/assets');
    await getDB();

    const existing: Asset = {
      id: 'a1',
      name: 'Old',
      isin: null,
      wkn: null,
      currency: 'EUR',
      prices: [],
      formatConfig: null,
      rawCSV: null,
      rawCSVStoredAt: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      lastRefreshedAt: null,
    };
    await assetsDb.put(existing);

    const imported: Asset = { ...existing, name: 'New' };
    const report: ConflictReport = {
      assets: { newItems: [], conflicts: [{ existing, imported, resolution: 'replace' }] },
      portfolios: { newItems: [], conflicts: [] },
      currencies: { newItems: [], conflicts: [] },
      simulations: { newItems: [], conflicts: [] },
      settings: { newItems: [], conflicts: [] },
    };

    await applyImport(report);

    const found = await assetsDb.getById('a1');
    expect(found!.name).toBe('New');
  });

  it('skips conflicts with keep or skip resolution', async () => {
    const { getDB } = await import('$lib/storage/db');
    const assetsDb = await import('$lib/storage/assets');
    await getDB();

    const existing: Asset = {
      id: 'a1',
      name: 'Old',
      isin: null,
      wkn: null,
      currency: 'EUR',
      prices: [],
      formatConfig: null,
      rawCSV: null,
      rawCSVStoredAt: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      lastRefreshedAt: null,
    };
    await assetsDb.put(existing);

    const imported: Asset = { ...existing, name: 'New' };
    const report: ConflictReport = {
      assets: { newItems: [], conflicts: [{ existing, imported, resolution: 'keep' }] },
      portfolios: { newItems: [], conflicts: [] },
      currencies: { newItems: [], conflicts: [] },
      simulations: { newItems: [], conflicts: [] },
      settings: { newItems: [], conflicts: [] },
    };

    await applyImport(report);

    const found = await assetsDb.getById('a1');
    expect(found!.name).toBe('Old');
  });

  it('writes new settings', async () => {
    const { getDB } = await import('$lib/storage/db');
    const settingsDb = await import('$lib/storage/settings');
    await getDB();

    const report: ConflictReport = {
      assets: { newItems: [], conflicts: [] },
      portfolios: { newItems: [], conflicts: [] },
      currencies: { newItems: [], conflicts: [] },
      simulations: { newItems: [], conflicts: [] },
      settings: {
        newItems: [{ key: 'mainCurrency', value: 'USD' }],
        conflicts: [],
      },
    };

    await applyImport(report);

    const val = await settingsDb.get('mainCurrency');
    expect(val).toBe('USD');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/io/apply.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

Create `src/lib/io/apply.ts`:

```typescript
import type { ConflictReport, ConflictItem, SettingConflict } from './conflicts';
import * as assetsDb from '$lib/storage/assets';
import * as portfoliosDb from '$lib/storage/portfolios';
import * as currenciesDb from '$lib/storage/currencies';
import * as simulationsDb from '$lib/storage/simulations';
import * as settingsDb from '$lib/storage/settings';

async function applyIdScope<T extends { id: string }>(
  report: { newItems: T[]; conflicts: ConflictItem<T>[] },
  put: (item: T) => Promise<void>,
): Promise<void> {
  for (const item of report.newItems) {
    await put(item);
  }
  for (const conflict of report.conflicts) {
    if (conflict.resolution === 'replace') {
      await put(conflict.imported);
    }
    // 'keep' and 'skip' — do nothing
  }
}

async function applyCurrencyScope(
  report: ConflictReport['currencies'],
): Promise<void> {
  for (const item of report.newItems) {
    await currenciesDb.put(item);
  }
  for (const conflict of report.conflicts) {
    if (conflict.resolution === 'replace') {
      await currenciesDb.put(conflict.imported);
    }
  }
}

async function applySettingsScope(
  report: ConflictReport['settings'],
): Promise<void> {
  for (const item of report.newItems) {
    await settingsDb.set(item.key, item.value);
  }
  for (const conflict of report.conflicts) {
    if (conflict.resolution === 'replace') {
      await settingsDb.set(conflict.key, conflict.imported);
    }
  }
}

export async function applyImport(report: ConflictReport): Promise<void> {
  await applyIdScope(report.assets, assetsDb.put);
  await applyIdScope(report.portfolios, portfoliosDb.put);
  await applyCurrencyScope(report.currencies);
  await applyIdScope(report.simulations, simulationsDb.put);
  await applySettingsScope(report.settings);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/io/apply.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/io/apply.ts src/lib/io/apply.test.ts
git commit -m "feat(io): add import apply logic with conflict resolution"
```

---

### Task 8: Export modal component

**Files:**
- Create: `src/lib/components/io/ExportModal.svelte`

This is a Svelte component — tested through the integration in the settings page (manual/E2E).

**Step 1: Write implementation**

Create `src/lib/components/io/ExportModal.svelte`:

```svelte
<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import Button from '$lib/components/shared/Button.svelte';
  import { ALL_SCOPES, type SweetfolioScope } from '$lib/io/schema';
  import { buildExport } from '$lib/io/export';
  import { triggerDownload } from '$lib/io/download';

  let {
    open = $bindable(false),
  }: {
    open?: boolean;
  } = $props();

  const scopeLabels: Record<SweetfolioScope, string> = {
    assets: 'Assets',
    portfolios: 'Portfolios',
    settings: 'Settings',
    currencies: 'Exchange Rates',
    simulations: 'Simulations',
  };

  let selectedScopes: Set<SweetfolioScope> = $state(new Set(ALL_SCOPES));
  let exporting = $state(false);
  let error: string | null = $state(null);

  function toggleScope(scope: SweetfolioScope) {
    const next = new Set(selectedScopes);
    if (next.has(scope)) {
      next.delete(scope);
    } else {
      next.add(scope);
    }
    selectedScopes = next;
  }

  async function handleExport() {
    error = null;
    exporting = true;
    try {
      const data = await buildExport([...selectedScopes]);
      triggerDownload(data);
      open = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Export failed';
    } finally {
      exporting = false;
    }
  }
</script>

<Modal bind:open title="Export Data">
  <p class="export-description">Select which data to include in the export file.</p>

  <div class="scope-list">
    {#each ALL_SCOPES as scope}
      <label class="scope-item">
        <input
          type="checkbox"
          checked={selectedScopes.has(scope)}
          onchange={() => toggleScope(scope)}
        />
        <span>{scopeLabels[scope]}</span>
      </label>
    {/each}
  </div>

  {#if error}
    <div class="export-error">{error}</div>
  {/if}

  {#snippet footer()}
    <Button variant="default" onclick={() => open = false}>Cancel</Button>
    <Button
      variant="primary"
      onclick={handleExport}
      disabled={exporting || selectedScopes.size === 0}
    >
      {exporting ? 'Exporting...' : 'Export'}
    </Button>
  {/snippet}
</Modal>

<style>
  .export-description {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    margin-bottom: var(--spacing-lg);
  }

  .scope-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .scope-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    font-size: var(--font-size-sm);
    cursor: pointer;
    padding: var(--spacing-xs) 0;
  }

  .scope-item input[type="checkbox"] {
    accent-color: var(--color-accent);
  }

  .export-error {
    margin-top: var(--spacing-md);
    font-size: var(--font-size-xs);
    color: var(--color-negative, #e55);
    padding: var(--spacing-xs) var(--spacing-sm);
    background: rgba(232, 23, 93, 0.08);
    border: 1px solid rgba(232, 23, 93, 0.2);
    border-radius: var(--radius-sm);
  }
</style>
```

**Step 2: Commit**

```bash
git add src/lib/components/io/ExportModal.svelte
git commit -m "feat(io): add export modal component"
```

---

### Task 9: Import wizard component

**Files:**
- Create: `src/lib/components/io/ImportWizard.svelte`

Multi-step wizard: file validation → scope selection → conflict review → apply.

**Step 1: Write implementation**

Create `src/lib/components/io/ImportWizard.svelte`:

```svelte
<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import Button from '$lib/components/shared/Button.svelte';
  import { ALL_SCOPES, type SweetfolioScope, type SweetfolioExport } from '$lib/io/schema';
  import { parseImportFile } from '$lib/io/import';
  import { detectConflicts, type ConflictReport, type ConflictItem, type SettingConflict } from '$lib/io/conflicts';
  import { applyImport } from '$lib/io/apply';
  import * as assetsDb from '$lib/storage/assets';
  import * as portfoliosDb from '$lib/storage/portfolios';
  import * as currenciesDb from '$lib/storage/currencies';
  import * as simulationsDb from '$lib/storage/simulations';
  import * as settingsDb from '$lib/storage/settings';
  import { loadAssets } from '$lib/stores/assets';
  import { loadPortfolios } from '$lib/stores/portfolios';
  import { loadCurrencies } from '$lib/stores/currencies';
  import { loadSettings } from '$lib/stores/settings';

  let {
    open = $bindable(false),
  }: {
    open?: boolean;
  } = $props();

  type Step = 'select-file' | 'select-scopes' | 'resolve-conflicts' | 'applying' | 'done';

  let step: Step = $state('select-file');
  let error: string | null = $state(null);
  let importData: SweetfolioExport | null = $state(null);
  let selectedScopes: Set<SweetfolioScope> = $state(new Set());
  let conflictReport: ConflictReport | null = $state(null);
  let applyProgress: string = $state('');

  const scopeLabels: Record<SweetfolioScope, string> = {
    assets: 'Assets',
    portfolios: 'Portfolios',
    settings: 'Settings',
    currencies: 'Exchange Rates',
    simulations: 'Simulations',
  };

  function reset() {
    step = 'select-file';
    error = null;
    importData = null;
    selectedScopes = new Set();
    conflictReport = null;
    applyProgress = '';
  }

  function handleClose() {
    open = false;
    reset();
  }

  async function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    error = null;

    try {
      importData = await parseImportFile(input.files[0]);
      selectedScopes = new Set(importData.scopes);
      step = 'select-scopes';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to read file';
    }
  }

  function toggleScope(scope: SweetfolioScope) {
    const next = new Set(selectedScopes);
    if (next.has(scope)) {
      next.delete(scope);
    } else {
      next.add(scope);
    }
    selectedScopes = next;
  }

  async function handleDetectConflicts() {
    if (!importData) return;
    error = null;

    try {
      const existing = {
        assets: selectedScopes.has('assets') ? await assetsDb.getAll() : [],
        portfolios: selectedScopes.has('portfolios') ? await portfoliosDb.getAll() : [],
        currencies: selectedScopes.has('currencies') ? await currenciesDb.getAll() : [],
        simulations: selectedScopes.has('simulations') ? await simulationsDb.getAll() : [],
        settings: selectedScopes.has('settings') ? await settingsDb.getAll() : {},
      };

      // Filter imported data to selected scopes only
      const filteredData: SweetfolioExport['data'] = {};
      if (selectedScopes.has('assets')) filteredData.assets = importData.data.assets;
      if (selectedScopes.has('portfolios')) filteredData.portfolios = importData.data.portfolios;
      if (selectedScopes.has('settings')) filteredData.settings = importData.data.settings;
      if (selectedScopes.has('currencies')) filteredData.currencies = importData.data.currencies;
      if (selectedScopes.has('simulations')) filteredData.simulations = importData.data.simulations;

      conflictReport = detectConflicts(filteredData, existing);
      step = 'resolve-conflicts';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to detect conflicts';
    }
  }

  function setResolution<T>(conflict: ConflictItem<T>, resolution: 'keep' | 'replace' | 'skip') {
    conflict.resolution = resolution;
    conflictReport = conflictReport; // trigger reactivity
  }

  function setSettingResolution(conflict: SettingConflict, resolution: 'keep' | 'replace' | 'skip') {
    conflict.resolution = resolution;
    conflictReport = conflictReport;
  }

  function hasUnresolvedConflicts(): boolean {
    if (!conflictReport) return false;
    const scopes = ['assets', 'portfolios', 'currencies', 'simulations'] as const;
    for (const scope of scopes) {
      if (conflictReport[scope].conflicts.some((c) => !c.resolution)) return true;
    }
    if (conflictReport.settings.conflicts.some((c) => !c.resolution)) return true;
    return false;
  }

  async function handleApply() {
    if (!conflictReport) return;
    step = 'applying';
    error = null;

    try {
      await applyImport(conflictReport);

      // Reload stores
      applyProgress = 'Reloading data...';
      await Promise.all([loadAssets(), loadPortfolios(), loadCurrencies(), loadSettings()]);

      step = 'done';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Import failed';
      step = 'resolve-conflicts';
    }
  }

  function totalNewItems(): number {
    if (!conflictReport) return 0;
    return (
      conflictReport.assets.newItems.length +
      conflictReport.portfolios.newItems.length +
      conflictReport.currencies.newItems.length +
      conflictReport.simulations.newItems.length +
      conflictReport.settings.newItems.length
    );
  }

  function totalConflicts(): number {
    if (!conflictReport) return 0;
    return (
      conflictReport.assets.conflicts.length +
      conflictReport.portfolios.conflicts.length +
      conflictReport.currencies.conflicts.length +
      conflictReport.simulations.conflicts.length +
      conflictReport.settings.conflicts.length
    );
  }
</script>

<Modal bind:open title="Import Data" >
  {#if step === 'select-file'}
    <p class="wizard-description">Select a Sweetfolio export file (.json) to import.</p>
    <input type="file" accept=".json" onchange={handleFileSelect} class="file-input" />

    {#if error}
      <div class="wizard-error">{error}</div>
    {/if}

  {:else if step === 'select-scopes'}
    <p class="wizard-description">
      File exported on {importData?.exportedAt ? new Date(importData.exportedAt).toLocaleDateString() : 'unknown'}.
      Select which data to import:
    </p>

    <div class="scope-list">
      {#each ALL_SCOPES as scope}
        {@const available = importData?.scopes.includes(scope)}
        <label class="scope-item" class:disabled={!available}>
          <input
            type="checkbox"
            checked={selectedScopes.has(scope)}
            disabled={!available}
            onchange={() => toggleScope(scope)}
          />
          <span>{scopeLabels[scope]}</span>
          {#if !available}
            <span class="scope-unavailable">(not in file)</span>
          {/if}
        </label>
      {/each}
    </div>

    {#if error}
      <div class="wizard-error">{error}</div>
    {/if}

    {#snippet footer()}
      <Button variant="default" onclick={handleClose}>Cancel</Button>
      <Button
        variant="primary"
        onclick={handleDetectConflicts}
        disabled={selectedScopes.size === 0}
      >
        Next
      </Button>
    {/snippet}

  {:else if step === 'resolve-conflicts'}
    <div class="conflict-summary">
      <span class="summary-new">{totalNewItems()} new items</span>
      {#if totalConflicts() > 0}
        <span class="summary-conflicts">{totalConflicts()} conflicts to resolve</span>
      {:else}
        <span class="summary-no-conflicts">No conflicts</span>
      {/if}
    </div>

    {#if conflictReport}
      {#each ['assets', 'portfolios', 'currencies', 'simulations'] as scope}
        {@const report = conflictReport[scope as keyof ConflictReport]}
        {#if 'conflicts' in report && (report.conflicts.length > 0 || report.newItems.length > 0)}
          <div class="conflict-scope">
            <h4>{scopeLabels[scope as SweetfolioScope]}</h4>
            {#if report.newItems.length > 0}
              <p class="scope-info">{report.newItems.length} new item{report.newItems.length !== 1 ? 's' : ''} will be added</p>
            {/if}
            {#each report.conflicts as conflict}
              <div class="conflict-item">
                <div class="conflict-names">
                  <span class="conflict-label">
                    {#if 'name' in conflict.existing}
                      {(conflict.existing as {name: string}).name}
                    {:else if 'pair' in conflict.existing}
                      {(conflict.existing as {pair: string}).pair}
                    {:else if 'id' in conflict.existing}
                      {(conflict.existing as {id: string}).id}
                    {/if}
                  </span>
                </div>
                <div class="conflict-actions">
                  <button
                    class="resolution-btn"
                    class:active={conflict.resolution === 'keep'}
                    onclick={() => setResolution(conflict, 'keep')}
                  >Keep</button>
                  <button
                    class="resolution-btn"
                    class:active={conflict.resolution === 'replace'}
                    onclick={() => setResolution(conflict, 'replace')}
                  >Replace</button>
                  <button
                    class="resolution-btn"
                    class:active={conflict.resolution === 'skip'}
                    onclick={() => setResolution(conflict, 'skip')}
                  >Skip</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {/each}

      {#if conflictReport.settings.conflicts.length > 0 || conflictReport.settings.newItems.length > 0}
        <div class="conflict-scope">
          <h4>Settings</h4>
          {#if conflictReport.settings.newItems.length > 0}
            <p class="scope-info">{conflictReport.settings.newItems.length} new setting{conflictReport.settings.newItems.length !== 1 ? 's' : ''} will be added</p>
          {/if}
          {#each conflictReport.settings.conflicts as conflict}
            <div class="conflict-item">
              <div class="conflict-names">
                <span class="conflict-label">{conflict.key}</span>
                <span class="conflict-detail">Current: {JSON.stringify(conflict.existing)} → Imported: {JSON.stringify(conflict.imported)}</span>
              </div>
              <div class="conflict-actions">
                <button
                  class="resolution-btn"
                  class:active={conflict.resolution === 'keep'}
                  onclick={() => setSettingResolution(conflict, 'keep')}
                >Keep</button>
                <button
                  class="resolution-btn"
                  class:active={conflict.resolution === 'replace'}
                  onclick={() => setSettingResolution(conflict, 'replace')}
                >Replace</button>
                <button
                  class="resolution-btn"
                  class:active={conflict.resolution === 'skip'}
                  onclick={() => setSettingResolution(conflict, 'skip')}
                >Skip</button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}

    {#if error}
      <div class="wizard-error">{error}</div>
    {/if}

    {#snippet footer()}
      <Button variant="default" onclick={handleClose}>Cancel</Button>
      <Button
        variant="primary"
        onclick={handleApply}
        disabled={hasUnresolvedConflicts()}
      >
        {hasUnresolvedConflicts() ? 'Resolve all conflicts first' : 'Apply Import'}
      </Button>
    {/snippet}

  {:else if step === 'applying'}
    <p class="wizard-description">Importing data... {applyProgress}</p>

  {:else if step === 'done'}
    <p class="wizard-description">Import completed successfully.</p>

    {#snippet footer()}
      <Button variant="primary" onclick={handleClose}>Done</Button>
    {/snippet}
  {/if}
</Modal>

<style>
  .wizard-description {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    margin-bottom: var(--spacing-lg);
  }

  .file-input {
    font-size: var(--font-size-sm);
    width: 100%;
  }

  .scope-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .scope-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    font-size: var(--font-size-sm);
    cursor: pointer;
    padding: var(--spacing-xs) 0;
  }

  .scope-item.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .scope-item input[type="checkbox"] {
    accent-color: var(--color-accent);
  }

  .scope-unavailable {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .wizard-error {
    margin-top: var(--spacing-md);
    font-size: var(--font-size-xs);
    color: var(--color-negative, #e55);
    padding: var(--spacing-xs) var(--spacing-sm);
    background: rgba(232, 23, 93, 0.08);
    border: 1px solid rgba(232, 23, 93, 0.2);
    border-radius: var(--radius-sm);
  }

  .conflict-summary {
    display: flex;
    gap: var(--spacing-lg);
    margin-bottom: var(--spacing-lg);
    font-size: var(--font-size-sm);
  }

  .summary-new {
    color: var(--color-accent);
  }

  .summary-conflicts {
    color: var(--color-warning, #e6a817);
  }

  .summary-no-conflicts {
    color: var(--color-accent);
  }

  .conflict-scope {
    margin-bottom: var(--spacing-lg);
  }

  .conflict-scope h4 {
    font-size: var(--font-size-sm);
    font-weight: 600;
    margin-bottom: var(--spacing-sm);
    color: var(--color-text-secondary);
  }

  .scope-info {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    margin-bottom: var(--spacing-sm);
  }

  .conflict-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-md);
    padding: var(--spacing-sm) 0;
    border-bottom: 1px solid var(--color-border);
    font-size: var(--font-size-sm);
  }

  .conflict-names {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .conflict-label {
    font-weight: 500;
  }

  .conflict-detail {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .conflict-actions {
    display: flex;
    gap: var(--spacing-xs);
    flex-shrink: 0;
  }

  .resolution-btn {
    font-size: var(--font-size-xs);
    padding: 2px var(--spacing-sm);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-bg-tertiary);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background-color var(--transition-fast), color var(--transition-fast);
  }

  .resolution-btn:hover {
    background: var(--color-border);
    color: var(--color-text-primary);
  }

  .resolution-btn.active {
    background: var(--color-accent);
    color: #fff;
    border-color: var(--color-accent);
  }
</style>
```

**Step 2: Commit**

```bash
git add src/lib/components/io/ImportWizard.svelte
git commit -m "feat(io): add import wizard with scope selection and conflict resolution"
```

---

### Task 10: Wire up settings page

**Files:**
- Modify: `src/routes/settings/+page.svelte`

**Step 1: Add import/export to settings page**

Add the following changes to `src/routes/settings/+page.svelte`:

1. Import the new components at the top of the `<script>` block:

```typescript
import ExportModal from '$lib/components/io/ExportModal.svelte';
import ImportWizard from '$lib/components/io/ImportWizard.svelte';
```

2. Add state variables:

```typescript
let showExportModal = $state(false);
let showImportWizard = $state(false);
```

3. Insert a new Card section **before** the existing "Data" card (the one with "Clear All Data"). The new section is called "Data Management":

```svelte
<Card>
  <div class="setting-section">
    <h2>Data Management</h2>
    <p class="section-description">Export your data as a backup or import from a previous export.</p>

    <div class="setting-row">
      <div class="setting-info">
        <span class="setting-label">Export</span>
        <span class="setting-description">Download all your data as a JSON file</span>
      </div>
      <div class="setting-control">
        <Button variant="default" size="sm" onclick={() => showExportModal = true}>Export Data</Button>
      </div>
    </div>

    <div class="setting-row" style="margin-top: var(--spacing-lg);">
      <div class="setting-info">
        <span class="setting-label">Import</span>
        <span class="setting-description">Restore data from a Sweetfolio export file</span>
      </div>
      <div class="setting-control">
        <Button variant="default" size="sm" onclick={() => showImportWizard = true}>Import Data</Button>
      </div>
    </div>
  </div>
</Card>
```

4. Add the modals at the bottom of the template (before the closing `</div>` of `.settings-page`):

```svelte
<ExportModal bind:open={showExportModal} />
<ImportWizard bind:open={showImportWizard} />
```

**Step 2: Run the dev server and manually test**

Run: `npm run dev`

Verify:
- Settings page shows "Data Management" section
- "Export Data" opens modal with scope checkboxes, downloads JSON file
- "Import Data" opens wizard, accepts JSON, shows scope/conflict UI

**Step 3: Commit**

```bash
git add src/routes/settings/+page.svelte
git commit -m "feat(io): wire import/export into settings page"
```

---

### Task 11: Run all tests and verify

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing + new io tests)

**Step 2: Fix any failures**

If any tests fail, fix them before proceeding.

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(io): resolve test failures"
```

---

### Task 12: Barrel export and index file

**Files:**
- Create: `src/lib/io/index.ts`

**Step 1: Create barrel export for clean imports**

Create `src/lib/io/index.ts`:

```typescript
export { CURRENT_VERSION, ALL_SCOPES, isValidExportEnvelope } from './schema';
export type { SweetfolioExport, SweetfolioScope } from './schema';
export { buildExport } from './export';
export { triggerDownload } from './download';
export { parseImportFile } from './import';
export { detectConflicts } from './conflicts';
export type { ConflictReport, ConflictItem, SettingConflict, ScopeReport, SettingScopeReport } from './conflicts';
export { applyImport } from './apply';
export { migrateToLatest } from './migrations';
```

**Step 2: Commit**

```bash
git add src/lib/io/index.ts
git commit -m "feat(io): add barrel export"
```
