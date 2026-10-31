# Data Migration System Design

## Goal

Create a reusable one-time data migration system with a non-blocking toast UI. First migration: auto-classify assets by fetching their type from Onvista using known ISIN/WKN identifiers.

## Architecture

### Migration Runner

A generic system for registering and running one-time data migrations:

```typescript
interface DataMigration {
  id: string;                    // e.g. 'classify-assets-v1'
  label: string;                 // e.g. 'Classifying assets'
  run(onProgress: (current: number, total: number, detail: string) => void): Promise<MigrationResult>;
}

interface MigrationResult {
  changes: string[];             // e.g. ['MSCI World → ETF', 'Apple → Stock']
  errors: string[];              // e.g. ['Failed to fetch for DE000xxx']
}
```

### Settings Tracking

`completedMigrations: string[]` in settings store — array of migration IDs that have run.

### Data Flow

```
App init → initStores() → runPendingMigrations()
  → checks settings.completedMigrations
  → finds unrun migrations
  → updates migrationProgress store (reactive)
  → MigrationToast renders progress
  → on complete: shows summary, saves to settings
```

## Toast UI (Non-blocking)

Bottom-right toast area (same as existing toasts):

- **Running**: progress bar + "Classifying assets... (3/7)" with percentage
- **Complete**: summary of changes (e.g. "Updated 5 assets"), auto-dismiss after 8s or click to dismiss
- **Errors**: shows error count, expandable details

## Navigation Guard

While a migration is running, register a `beforeunload` event handler to show the browser's native "Leave page?" confirmation dialog. Remove the handler when migration completes.

## First Migration: Classify Assets (`classify-assets-v1`)

1. Find all assets where `classification === 'unknown'` AND (`isin !== null` OR `wkn !== null`)
2. For each, call `fetchByISIN` or `fetchByWKN`
3. If returned classification is non-null and not 'unknown', update the asset
4. Report changes and errors

## Component Structure

- `src/lib/migrations/runner.ts` — migration registry, runner logic, progress store
- `src/lib/migrations/classify-assets.ts` — first migration implementation
- `src/lib/components/shared/MigrationToast.svelte` — toast UI with progress bar
- `src/routes/+layout.svelte` — render MigrationToast globally, trigger migrations on init
