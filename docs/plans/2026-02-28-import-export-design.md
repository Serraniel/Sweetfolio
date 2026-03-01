# Import/Export Data Feature — Design Document

**Date:** 2026-02-28
**Status:** Approved

## Problem

All Sweetfolio data is stored in IndexedDB in the browser. Users have no way to back up, restore, or transfer their data between browsers/devices. If the browser data is cleared, everything is lost.

## Goals

1. Export all app data (assets, portfolios, settings, currencies, simulations) as a portable file
2. Import data from a Sweetfolio export file with conflict resolution
3. Configurable scopes at both export and import time
4. Versioned schema with migration support for forward compatibility
5. Extensible adapter pattern for future external tool imports (Portfolio Performance, Parqet)

## Export Format

Single JSON file with a versioned envelope:

```typescript
interface SweetfolioExport {
  format: 'sweetfolio';
  version: 1;
  exportedAt: string; // ISO 8601
  scopes: SweetfolioScope[];
  data: {
    assets?: Asset[];
    portfolios?: Portfolio[];
    settings?: Record<string, unknown>;
    currencies?: CurrencyRate[];
    simulations?: StoredSimulation[];
  };
}

type SweetfolioScope = 'assets' | 'portfolios' | 'settings' | 'currencies' | 'simulations';
```

- `format: 'sweetfolio'` — magic identifier for file validation
- `version` — integer, incremented on schema changes
- `scopes` — documents which categories are present (user-selected)
- `data` — only included scopes have data; others are omitted

File naming: `sweetfolio-export-YYYY-MM-DD.json`

## Version Migration System

Sequential migration chain from file version to current:

```typescript
type Migration = (data: unknown) => unknown;

const migrations: Record<number, Migration> = {
  // 1: (data) => { /* v1 -> v2 */ return data; },
};

const CURRENT_VERSION = 1;

function migrateToLatest(exportData: unknown): SweetfolioExport {
  let data = exportData as { version: number };
  while (data.version < CURRENT_VERSION) {
    const migrate = migrations[data.version];
    if (!migrate) throw new Error(`No migration for version ${data.version}`);
    data = migrate(data) as { version: number };
  }
  return data as SweetfolioExport;
}
```

**Rule:** Any change to core types (Asset, Portfolio, etc.) that alters stored data shape MUST bump `CURRENT_VERSION` and add a migration function.

## Export Flow

1. User clicks "Export Data" on settings page
2. Scope selection modal: checkboxes for each category (all checked by default)
3. System reads selected data from IndexedDB via existing storage functions
4. Assembles `SweetfolioExport` object
5. Triggers browser download via Blob + anchor element

## Import Flow

1. User clicks "Import Data" on settings page
2. File picker (accepts `.json`)
3. Validation:
   - Check `format === 'sweetfolio'`
   - Check `version` is a known version
   - Run migrations if `version < CURRENT_VERSION`
4. Scope selection: show available scopes in file, user picks which to import
5. Conflict resolution: for each scope, compare imported items against existing
   - Summary view: "3 new assets, 2 conflicts"
   - Per-conflict modal: shows existing vs imported item details
   - Options per conflict: Keep existing / Replace with imported / Skip
6. Apply import: write resolved data to IndexedDB
7. Reload stores to reflect changes

## Conflict Detection

Conflicts are identified by matching IDs:
- **Assets:** match on `id`
- **Portfolios:** match on `id`
- **Currencies:** match on `pair`
- **Simulations:** match on `id`
- **Settings:** match on `key` (each setting key compared individually)

For each match, show both versions so the user can make an informed choice.

## File Structure

New files:

```
src/lib/io/
  schema.ts        — SweetfolioExport type, CURRENT_VERSION, scope definitions
  export.ts        — exportData(scopes): builds export object from IndexedDB
  import.ts        — parseImport(file): validates, migrates, returns typed data
  migrations.ts    — migration chain functions
  conflicts.ts     — detectConflicts(imported, existing): ConflictReport
  apply.ts         — applyImport(data, resolutions): writes to IndexedDB
  download.ts      — triggerDownload(data, filename): Blob + anchor

src/lib/components/io/
  ExportModal.svelte        — scope checkboxes + export button
  ImportWizard.svelte        — multi-step: validate → scope select → conflicts → apply
  ConflictResolver.svelte    — per-item conflict UI (keep/replace/skip)
```

Settings page (`src/routes/settings/+page.svelte`): add "Data Management" section with Export and Import buttons.

## External Tool Adapters (Future Phase)

```typescript
interface ImportAdapter {
  name: string;
  accepts: string[];           // file extensions
  detect(file: File): Promise<boolean>;
  convert(file: File): Promise<SweetfolioExport>;
}
```

Planned adapters:
- **Portfolio Performance** — XML export → Sweetfolio format
- **Parqet** — CSV export → Sweetfolio format

Adapters produce a `SweetfolioExport` object, so the standard import flow (scope selection, conflict resolution) applies.

## UI Location

Primary UI on the settings page in a "Data Management" section. No links scattered across other pages — import/export is a data management concern, not a daily workflow action.

## Non-Goals (for initial implementation)

- Compression / ZIP format (can be added later if file sizes are a concern)
- Automatic scheduled backups
- Cloud sync
- Export to external tool formats (only import from them)
