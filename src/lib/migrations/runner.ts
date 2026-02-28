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
