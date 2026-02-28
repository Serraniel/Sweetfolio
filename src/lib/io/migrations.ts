import type { SweetfolioExport } from './schema';
import { CURRENT_VERSION } from './schema';

type Migration = (data: unknown) => unknown;

const migrations: Record<number, Migration> = {
  1: (data) => {
    const d = data as Record<string, unknown>;
    const inner = d.data as Record<string, unknown>;
    if (Array.isArray(inner.assets)) {
      for (const asset of inner.assets) {
        if (!(asset as Record<string, unknown>).classification) {
          (asset as Record<string, unknown>).classification = 'unknown';
        }
      }
    }
    return { ...d, version: 2 };
  },
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
