# Data Migration System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a reusable one-time data migration system with a non-blocking toast UI. First migration: auto-classify assets by fetching type from Onvista via ISIN/WKN.

**Architecture:** Migration runner with a registry of `DataMigration` objects. A reactive Svelte store tracks progress. A `MigrationToast` component renders progress/results. Completed migration IDs are persisted in settings. A `beforeunload` guard prevents accidental page close during migration.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vitest

---

### Task 1: Create migration runner types and store

**Files:**
- Create: `src/lib/migrations/runner.ts`

**Step 1: Create the migration runner module**

```typescript
import { writable, get } from 'svelte/store';
import { settings, setSetting } from '$lib/stores/settings';

// --- Types ---

export interface DataMigration {
  id: string;
  label: string;
  run(
    onProgress: (current: number, total: number, detail: string) => void,
  ): Promise<MigrationResult>;
}

export interface MigrationResult {
  changes: string[];
  errors: string[];
}

export interface MigrationProgress {
  active: boolean;
  migrationLabel: string;
  current: number;
  total: number;
  detail: string;
  result: MigrationResult | null;
}

// --- Store ---

export const migrationProgress = writable<MigrationProgress>({
  active: false,
  migrationLabel: '',
  current: 0,
  total: 0,
  detail: '',
  result: null,
});

// --- Registry ---

const registry: DataMigration[] = [];

export function registerMigration(migration: DataMigration): void {
  registry.push(migration);
}

// --- Runner ---

function getCompletedMigrations(): string[] {
  const s = get(settings);
  return (s.completedMigrations as string[]) ?? [];
}

export async function runPendingMigrations(): Promise<void> {
  const completed = getCompletedMigrations();
  const pending = registry.filter((m) => !completed.includes(m.id));
  if (pending.length === 0) return;

  for (const migration of pending) {
    migrationProgress.set({
      active: true,
      migrationLabel: migration.label,
      current: 0,
      total: 0,
      detail: '',
      result: null,
    });

    try {
      const result = await migration.run((current, total, detail) => {
        migrationProgress.set({
          active: true,
          migrationLabel: migration.label,
          current,
          total,
          detail,
          result: null,
        });
      });

      // Mark as completed
      const updatedCompleted = [...getCompletedMigrations(), migration.id];
      await setSetting('completedMigrations', updatedCompleted);

      migrationProgress.set({
        active: false,
        migrationLabel: migration.label,
        current: 0,
        total: 0,
        detail: '',
        result,
      });
    } catch (err) {
      migrationProgress.set({
        active: false,
        migrationLabel: migration.label,
        current: 0,
        total: 0,
        detail: '',
        result: {
          changes: [],
          errors: [`Migration "${migration.label}" failed: ${err instanceof Error ? err.message : String(err)}`],
        },
      });
    }
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -c 'error'`
Expected: 0 errors related to this file (existing vite.config error is pre-existing).

**Step 3: Commit**

```bash
git add src/lib/migrations/runner.ts
git commit -m "feat(migrations): add migration runner with registry and progress store"
```

---

### Task 2: Create classify-assets migration

**Files:**
- Create: `src/lib/migrations/classify-assets.ts`

**Step 1: Create the migration**

```typescript
import { get } from 'svelte/store';
import { assets, updateAsset } from '$lib/stores/assets';
import { fetchByISIN, fetchByWKN } from '$lib/scraper/index';
import { registerMigration, type MigrationResult } from './runner';

registerMigration({
  id: 'classify-assets-v1',
  label: 'Classifying assets',
  async run(onProgress): Promise<MigrationResult> {
    const allAssets = get(assets);
    const candidates = allAssets.filter(
      (a) => (a.classification === 'unknown' || !a.classification) && (a.isin || a.wkn),
    );

    if (candidates.length === 0) {
      return { changes: [], errors: [] };
    }

    const changes: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const asset = candidates[i];
      onProgress(i + 1, candidates.length, asset.name);

      try {
        const outcome = asset.isin
          ? await fetchByISIN(asset.isin)
          : asset.wkn
            ? await fetchByWKN(asset.wkn)
            : null;

        if (!outcome || !outcome.success) {
          errors.push(`${asset.name}: fetch failed`);
          continue;
        }

        const cls = outcome.data.classification;
        if (cls && cls !== 'unknown') {
          await updateAsset({
            ...asset,
            classification: cls,
            updatedAt: new Date().toISOString(),
          });
          changes.push(`${asset.name} → ${cls.toUpperCase()}`);
        }
      } catch {
        errors.push(`${asset.name}: unexpected error`);
      }
    }

    return { changes, errors };
  },
});
```

**Step 2: Commit**

```bash
git add src/lib/migrations/classify-assets.ts
git commit -m "feat(migrations): add classify-assets-v1 migration"
```

---

### Task 3: Create MigrationToast component

**Files:**
- Create: `src/lib/components/shared/MigrationToast.svelte`

**Step 1: Create the toast component**

Model after `RefreshProgressToast.svelte` (same file for style reference: `src/lib/components/shared/RefreshProgressToast.svelte`). The toast should:

- Subscribe to `migrationProgress` store
- Show when `active` or when `result` is not null
- While active: show label, progress bar, detail text, current/total
- While active: register `beforeunload` handler to prevent page close
- When done: show summary (changes count + error count), dismiss button
- Auto-dismiss after 8 seconds when complete with no errors
- Use `$effect` for the beforeunload handler tied to `progress.active`

```svelte
<script lang="ts">
  import { migrationProgress } from '$lib/migrations/runner';

  const progress = $derived($migrationProgress);
  const visible = $derived(progress.active || progress.result !== null);
  const percent = $derived(progress.total > 0 ? (progress.current / progress.total) * 100 : 0);

  let dismissed = $state(false);
  let showDetails = $state(false);

  function dismiss() {
    dismissed = true;
    showDetails = false;
  }

  // Reset dismissed when a new migration starts
  $effect(() => {
    if (progress.active) {
      dismissed = false;
      showDetails = false;
    }
  });

  // Auto-dismiss after 8s when complete with no errors
  $effect(() => {
    if (!progress.active && progress.result && progress.result.errors.length === 0) {
      const timer = setTimeout(() => { dismissed = true; }, 8000);
      return () => clearTimeout(timer);
    }
  });

  // Prevent page close while migration is running
  $effect(() => {
    if (progress.active) {
      const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
      window.addEventListener('beforeunload', handler);
      return () => window.removeEventListener('beforeunload', handler);
    }
  });
</script>

{#if visible && !dismissed}
  <div class="migration-toast">
    <div class="migration-toast-content">
      {#if progress.active}
        <div class="migration-status">
          <span class="migration-text">
            {progress.migrationLabel}… ({progress.current}/{progress.total})
          </span>
          <span class="migration-detail">{progress.detail}</span>
        </div>
        <div class="progress-bar-track">
          <div class="progress-bar-fill" style="width: {percent}%"></div>
        </div>
      {:else if progress.result}
        <div class="migration-done">
          <div class="migration-messages">
            {#if progress.result.changes.length > 0}
              <span class="migration-success">
                Updated {progress.result.changes.length} asset{progress.result.changes.length !== 1 ? 's' : ''}
              </span>
              <button class="details-btn" onclick={() => showDetails = !showDetails}>
                {showDetails ? 'Hide' : 'Show'} details
              </button>
            {:else}
              <span class="migration-neutral">No changes needed</span>
            {/if}
            {#if progress.result.errors.length > 0}
              <span class="migration-errors">
                {progress.result.errors.length} error{progress.result.errors.length !== 1 ? 's' : ''}
              </span>
            {/if}
          </div>
          <button class="dismiss-btn" onclick={dismiss} aria-label="Dismiss">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        {#if showDetails}
          <div class="migration-details">
            {#each progress.result.changes as change}
              <div class="detail-item detail-change">{change}</div>
            {/each}
            {#each progress.result.errors as error}
              <div class="detail-item detail-error">{error}</div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  .migration-toast {
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
    animation: migration-toast-slide-in 0.3s ease-out;
    backdrop-filter: blur(12px);
  }

  .migration-toast-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .migration-status {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--spacing-sm);
  }

  .migration-text {
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .migration-detail {
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

  .migration-done {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
  }

  .migration-messages {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .migration-success {
    font-size: var(--font-size-sm);
    color: var(--color-accent);
  }

  .migration-neutral {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
  }

  .migration-errors {
    font-size: var(--font-size-sm);
    color: var(--color-warning, #e6a817);
  }

  .details-btn {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
    text-decoration-style: dotted;
    text-underline-offset: 2px;
  }

  .details-btn:hover {
    color: var(--color-text-primary);
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

  .migration-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 200px;
    overflow-y: auto;
    padding-top: var(--spacing-xs);
    border-top: 1px solid var(--color-border);
  }

  .detail-item {
    font-size: var(--font-size-xs);
    padding: 2px 0;
  }

  .detail-change {
    color: var(--color-accent);
  }

  .detail-error {
    color: var(--color-warning, #e6a817);
  }

  @keyframes migration-toast-slide-in {
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
git add src/lib/components/shared/MigrationToast.svelte
git commit -m "feat(migrations): add MigrationToast component with progress bar"
```

---

### Task 4: Wire up in layout and init

**Files:**
- Modify: `src/routes/+layout.svelte`
- Modify: `src/lib/stores/init.ts`

**Step 1: Import and register migrations in init.ts**

In `src/lib/stores/init.ts`, add at the top:

```typescript
import '$lib/migrations/classify-assets';
import { runPendingMigrations } from '$lib/migrations/runner';
```

At the end of `initStores()`, after the benchmark migration, add:

```typescript
// Run any pending data migrations (non-blocking)
runPendingMigrations();
```

Note: Do NOT await this — migrations run in the background and the app should be usable immediately.

**Step 2: Add MigrationToast to layout**

In `src/routes/+layout.svelte`, import and render the toast alongside RefreshProgressToast:

```typescript
import MigrationToast from '$lib/components/shared/MigrationToast.svelte';
```

Add after `<RefreshProgressToast />`:

```svelte
<MigrationToast />
```

**Step 3: Verify the app compiles and starts**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/lib/stores/init.ts src/routes/+layout.svelte
git commit -m "feat(migrations): wire up migration runner and toast in app init"
```

---

### Task 5: Add migration runner tests

**Files:**
- Create: `src/lib/migrations/runner.test.ts`

**Step 1: Write tests for the migration runner**

Test these scenarios:
1. `runPendingMigrations` does nothing when no migrations are registered
2. `runPendingMigrations` runs a migration and marks it completed in settings
3. `runPendingMigrations` skips already-completed migrations
4. `runPendingMigrations` updates progress store during execution
5. `runPendingMigrations` handles migration errors gracefully

The tests will need to mock the settings store. Use `vi.mock` for `$lib/stores/settings`.

**Step 2: Run tests**

Run: `npx vitest run src/lib/migrations/runner.test.ts`
Expected: All pass.

**Step 3: Commit**

```bash
git add src/lib/migrations/runner.test.ts
git commit -m "test(migrations): add migration runner tests"
```

---

### Task 6: Final verification

**Step 1: Run full type check**

Run: `npx tsc --noEmit`

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

**Step 3: Commit any fixes**

If any test fixtures need updating, fix and commit.
