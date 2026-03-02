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
  2: (data) => {
    // v2→v3: strategies scope added (no data transformation needed)
    return { ...(data as Record<string, unknown>), version: 3 };
  },
  3: (data) => {
    const d = data as Record<string, unknown>;
    const inner = d.data as Record<string, unknown>;
    // Add default mode fields to portfolios
    if (Array.isArray(inner.portfolios)) {
      for (const p of inner.portfolios) {
        const portfolio = p as Record<string, unknown>;
        if (!portfolio.mode) {
          portfolio.mode = 'model';
          portfolio.trackCash = false;
          portfolio.cashCurrency = 'EUR';
          portfolio.sourceStrategyId = portfolio.sourceStrategyId ?? null;
        }
      }
    }
    // Transactions scope didn't exist before v4, nothing to migrate
    return { ...d, version: 4 };
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
