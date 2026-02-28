import type { ConflictReport, ConflictItem } from './conflicts';
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
  }
}

async function applyCurrencyScope(report: ConflictReport['currencies']): Promise<void> {
  for (const item of report.newItems) {
    await currenciesDb.put(item);
  }
  for (const conflict of report.conflicts) {
    if (conflict.resolution === 'replace') {
      await currenciesDb.put(conflict.imported);
    }
  }
}

async function applySettingsScope(report: ConflictReport['settings']): Promise<void> {
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
