import { untrack } from 'svelte';
import type { ConflictReport, ConflictItem } from './conflicts';
import * as assetsDb from '$lib/storage/assets';
import * as portfoliosDb from '$lib/storage/portfolios';
import * as strategiesDb from '$lib/storage/strategies';
import * as currenciesDb from '$lib/storage/currencies';
import * as simulationsDb from '$lib/storage/simulations';
import * as settingsDb from '$lib/storage/settings';
import * as transactionsDb from '$lib/storage/transactions';

function unwrap<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

async function applyIdScope<T extends { id: string }>(
  report: { newItems: T[]; conflicts: ConflictItem<T>[] },
  put: (item: T) => Promise<void>,
): Promise<void> {
  for (const item of report.newItems) {
    await put(unwrap(item));
  }
  for (const conflict of report.conflicts) {
    if (conflict.resolution === 'replace') {
      await put(unwrap(conflict.imported));
    }
  }
}

async function applyCurrencyScope(report: ConflictReport['currencies']): Promise<void> {
  for (const item of report.newItems) {
    await currenciesDb.put(unwrap(item));
  }
  for (const conflict of report.conflicts) {
    if (conflict.resolution === 'replace') {
      await currenciesDb.put(unwrap(conflict.imported));
    }
  }
}

async function applySettingsScope(report: ConflictReport['settings']): Promise<void> {
  for (const item of report.newItems) {
    await settingsDb.set(item.key, unwrap(item.value));
  }
  for (const conflict of report.conflicts) {
    if (conflict.resolution === 'replace') {
      await settingsDb.set(conflict.key, unwrap(conflict.imported));
    }
  }
}

export async function applyImport(report: ConflictReport): Promise<void> {
  await applyIdScope(report.assets, assetsDb.put);
  await applyIdScope(report.portfolios, portfoliosDb.put);
  await applyIdScope(report.strategies, strategiesDb.put);
  await applyCurrencyScope(report.currencies);
  await applyIdScope(report.simulations, simulationsDb.put);
  await applyIdScope(report.transactions, transactionsDb.put);
  await applySettingsScope(report.settings);
}
