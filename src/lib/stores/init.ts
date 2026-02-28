import { loadAssets } from './assets';
import { loadPortfolios } from './portfolios';
import { loadSettings } from './settings';
import { loadCurrencies } from './currencies';

let initialized = false;

/**
 * Initialize all stores from IndexedDB. Safe to call multiple times;
 * only the first call performs the actual load.
 */
export async function initStores(): Promise<void> {
  if (initialized) return;
  initialized = true;

  await Promise.all([loadAssets(), loadPortfolios(), loadSettings(), loadCurrencies()]);
}
