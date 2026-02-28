import type { SweetfolioExport } from './schema';
import { CURRENT_VERSION } from './schema';

type Migration = (data: unknown) => unknown;

const migrations: Record<number, Migration> = {
  // Example: 1: (data) => { /* v1 → v2 */ return { ...data, version: 2 }; },
};

export function migrateToLatest(data: SweetfolioExport): SweetfolioExport {
  let current: Record<string, unknown> = data as unknown as Record<string, unknown>;

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
