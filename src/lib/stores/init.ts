import { loadAssets } from './assets';
import { loadPortfolios, portfolios } from './portfolios';
import { loadStrategies } from './strategies';
import { loadSettings, settings } from './settings';
import { loadCurrencies } from './currencies';
import { setBenchmark } from './benchmark';
import { get } from 'svelte/store';
import '$lib/migrations/classify-assets';
import '$lib/migrations/strip-zero-allocations';
import { runPendingMigrations } from '$lib/migrations/runner';

let initialized = false;

/**
 * Initialize all stores from IndexedDB. Safe to call multiple times;
 * only the first call performs the actual load.
 */
export async function initStores(): Promise<void> {
  if (initialized) return;
  initialized = true;

  await Promise.all([loadAssets(), loadPortfolios(), loadStrategies(), loadSettings(), loadCurrencies()]);

  // Migrate: if no benchmark setting exists but a portfolio has isBenchmark, adopt it
  const s = get(settings);
  if (!s.benchmark) {
    const ps = get(portfolios);
    const legacy = ps.find((p) => p.isBenchmark);
    if (legacy) {
      await setBenchmark({ type: 'portfolio', id: legacy.id });
    }
  }

  // Run any pending data migrations (non-blocking)
  runPendingMigrations();
}
