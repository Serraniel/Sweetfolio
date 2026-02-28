import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writable, get } from 'svelte/store';

const { mockSettingsStore, mockSetSetting } = vi.hoisted(() => {
  // Must import writable inline since hoisted block runs before imports
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { writable: w } = require('svelte/store');
  const store = w<Record<string, unknown>>({});
  const setSetting = vi.fn(async (key: string, value: unknown) => {
    store.update((s: Record<string, unknown>) => ({ ...s, [key]: value }));
  });
  return { mockSettingsStore: store, mockSetSetting: setSetting };
});

vi.mock('$lib/stores/settings', () => ({
  settings: mockSettingsStore,
  setSetting: mockSetSetting,
}));

import {
  registerMigration,
  runPendingMigrations,
  migrationProgress,
  type DataMigration,
} from './runner';

// Since the registry is module-level state that accumulates across tests,
// each test uses a unique migration ID to avoid interference.

let testCounter = 0;
function uniqueId(prefix: string): string {
  return `${prefix}-${++testCounter}`;
}

/** Generates all known migration IDs up to the current testCounter. */
function allKnownIds(): string[] {
  const prefixes = ['no-op', 'run-complete', 'skip', 'progress', 'error'];
  const ids: string[] = [];
  for (let i = 1; i <= testCounter; i++) {
    for (const p of prefixes) {
      ids.push(`${p}-${i}`);
    }
  }
  return ids;
}

function makeMigration(
  overrides: Partial<DataMigration> & { id: string },
): DataMigration {
  return {
    label: overrides.label ?? `Migration ${overrides.id}`,
    run: overrides.run ?? (async () => ({ changes: [], errors: [] })),
    ...overrides,
  };
}

describe('migration runner', () => {
  beforeEach(() => {
    mockSettingsStore.set({});
    mockSetSetting.mockClear();
    migrationProgress.set({
      active: false,
      migrationLabel: '',
      current: 0,
      total: 0,
      detail: '',
      result: null,
    });
  });

  it('does nothing when no migrations are pending', async () => {
    const id = uniqueId('no-op');
    const runFn = vi.fn(async () => ({ changes: [], errors: [] }));
    const migration = makeMigration({ id, run: runFn });
    registerMigration(migration);

    // Mark all registered migrations (including this one) as completed
    mockSettingsStore.set({ completedMigrations: allKnownIds() });

    mockSetSetting.mockClear();
    await runPendingMigrations();

    expect(runFn).not.toHaveBeenCalled();
    expect(mockSetSetting).not.toHaveBeenCalled();

    const progress = get(migrationProgress);
    expect(progress.active).toBe(false);
  });

  it('runs a migration and marks it completed in settings', async () => {
    const id = uniqueId('run-complete');
    const runFn = vi.fn(async () => ({
      changes: ['added item'],
      errors: [],
    }));

    const migration = makeMigration({ id, run: runFn });
    registerMigration(migration);

    // Mark all prior migrations as completed, but NOT the new one
    const completedIds = allKnownIds().filter((x) => x !== id);
    mockSettingsStore.set({ completedMigrations: completedIds });

    await runPendingMigrations();

    expect(runFn).toHaveBeenCalledOnce();

    // Verify setSetting was called with our migration ID in the completed list
    const completedCall = mockSetSetting.mock.calls.find(
      ([key, value]: [string, unknown]) =>
        key === 'completedMigrations' &&
        Array.isArray(value) &&
        value.includes(id),
    );
    expect(completedCall).toBeDefined();

    // Verify the settings store now has the migration marked completed
    const s = get(mockSettingsStore);
    expect(s.completedMigrations as string[]).toContain(id);
  });

  it('skips already-completed migrations', async () => {
    const id = uniqueId('skip');
    const runFn = vi.fn(async () => ({ changes: [], errors: [] }));
    const migration = makeMigration({ id, run: runFn });
    registerMigration(migration);

    // Mark ALL registered migrations as completed
    mockSettingsStore.set({ completedMigrations: allKnownIds() });

    mockSetSetting.mockClear();
    await runPendingMigrations();

    expect(runFn).not.toHaveBeenCalled();
    expect(mockSetSetting).not.toHaveBeenCalled();
  });

  it('updates progress store during execution', async () => {
    const id = uniqueId('progress');
    const progressSnapshots: Array<Record<string, unknown>> = [];

    // Mark all prior migrations as completed, but NOT the new one
    const completedIds = allKnownIds().filter((x) => x !== id);
    mockSettingsStore.set({ completedMigrations: completedIds });

    const runFn = vi.fn(
      async (
        onProgress: (current: number, total: number, detail: string) => void,
      ) => {
        // Capture progress state after initial set (active: true)
        progressSnapshots.push({ ...get(migrationProgress) });

        onProgress(1, 3, 'step 1');
        progressSnapshots.push({ ...get(migrationProgress) });

        onProgress(2, 3, 'step 2');
        progressSnapshots.push({ ...get(migrationProgress) });

        return { changes: ['done'], errors: [] };
      },
    );

    const migration = makeMigration({ id, label: 'Progress Test', run: runFn });
    registerMigration(migration);

    await runPendingMigrations();

    // First snapshot: active with label set, before any onProgress call
    expect(progressSnapshots[0]).toMatchObject({
      active: true,
      migrationLabel: 'Progress Test',
    });

    // After onProgress(1, 3, 'step 1')
    expect(progressSnapshots[1]).toMatchObject({
      active: true,
      current: 1,
      total: 3,
      detail: 'step 1',
    });

    // After onProgress(2, 3, 'step 2')
    expect(progressSnapshots[2]).toMatchObject({
      active: true,
      current: 2,
      total: 3,
      detail: 'step 2',
    });

    // After completion, progress should be inactive with result
    const final = get(migrationProgress);
    expect(final.active).toBe(false);
    expect(final.result).toEqual({ changes: ['done'], errors: [] });
  });

  it('handles migration errors gracefully', async () => {
    const id = uniqueId('error');

    // Mark all prior migrations as completed, but NOT the new one
    const completedIds = allKnownIds().filter((x) => x !== id);
    mockSettingsStore.set({ completedMigrations: completedIds });

    const migration = makeMigration({
      id,
      label: 'Failing Migration',
      run: async () => {
        throw new Error('something broke');
      },
    });
    registerMigration(migration);

    // Should not throw
    await runPendingMigrations();

    const progress = get(migrationProgress);
    expect(progress.active).toBe(false);
    expect(progress.result).toBeDefined();
    expect(progress.result!.errors).toHaveLength(1);
    expect(progress.result!.errors[0]).toContain('Failing Migration');
    expect(progress.result!.errors[0]).toContain('something broke');
    expect(progress.result!.changes).toEqual([]);

    // Should NOT have been marked as completed
    const s = get(mockSettingsStore);
    const completed = (s.completedMigrations as string[]) ?? [];
    expect(completed).not.toContain(id);
  });
});
