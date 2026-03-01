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
      if (JSON.stringify(match) !== JSON.stringify(item)) {
        conflicts.push({ existing: match, imported: item });
      }
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
  const currencyReport: ScopeReport<CurrencyRate> = (() => {
    if (!imported.currencies || imported.currencies.length === 0)
      return { newItems: [], conflicts: [] };
    const existingMap = new Map(existing.currencies.map((c) => [c.pair, c]));
    const newItems: CurrencyRate[] = [];
    const conflicts: ConflictItem<CurrencyRate>[] = [];
    for (const item of imported.currencies) {
      const match = existingMap.get(item.pair);
      if (match) {
        if (JSON.stringify(match) !== JSON.stringify(item)) {
          conflicts.push({ existing: match, imported: item });
        }
      } else {
        newItems.push(item);
      }
    }
    return { newItems, conflicts };
  })();

  const settingsReport: SettingScopeReport = (() => {
    if (!imported.settings) return { newItems: [], conflicts: [] };
    const newItems: Array<{ key: string; value: unknown }> = [];
    const conflicts: SettingConflict[] = [];
    for (const [key, value] of Object.entries(imported.settings)) {
      if (key in existing.settings) {
        if (JSON.stringify(existing.settings[key]) !== JSON.stringify(value)) {
          conflicts.push({ key, existing: existing.settings[key], imported: value });
        }
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
