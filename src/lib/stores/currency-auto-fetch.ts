import { writable, get } from 'svelte/store';
import type { Asset, CurrencyRate } from '$lib/types';
import { assets } from './assets';
import { settings } from './settings';
import { currencies, addCurrencyRate } from './currencies';
import { fetchECBRates, ECB_CURRENCIES } from '$lib/fetchers/ecb';
import { deriveCrossRate, mergeRates } from '$lib/engine/cross-rate';

export interface CurrencyFetchProgress {
  active: boolean;
  current: number;
  total: number;
  currentPair: string;
  errors: Array<{ pair: string; message: string }>;
}

export const currencyFetchProgress = writable<CurrencyFetchProgress>({
  active: false,
  current: 0,
  total: 0,
  currentPair: '',
  errors: [],
});

const ecbCurrencySet = new Set<string>(ECB_CURRENCIES);

/**
 * Determine which EUR-based currency pairs need to be fetched from the ECB.
 * Returns pairs in the format "CCYEUR" (e.g. "USDEUR", "GBPEUR").
 */
export function getNeededPairs(
  allAssets: Asset[],
  mainCurrency: string,
  _existingRates: CurrencyRate[],
): string[] {
  const foreignCurrencies = new Set<string>();

  for (const asset of allAssets) {
    const ccy = asset.currency.toUpperCase();
    if (ccy !== mainCurrency.toUpperCase() && ccy !== 'EUR') {
      foreignCurrencies.add(ccy);
    }
  }

  // If mainCurrency is not EUR, we also need mainCurrency's EUR rate for cross-rates
  if (mainCurrency.toUpperCase() !== 'EUR') {
    foreignCurrencies.add(mainCurrency.toUpperCase());
  }

  const pairs: string[] = [];
  for (const ccy of foreignCurrencies) {
    if (ecbCurrencySet.has(ccy)) {
      pairs.push(`${ccy}EUR`);
    }
  }

  return [...new Set(pairs)];
}

/**
 * Fetch all needed currency rates from the ECB, derive cross-rates, and store them.
 * This is the main entry point called from various trigger points.
 */
export async function autoFetchCurrencyRates(): Promise<void> {
  const allAssets = get(assets);
  const mainCurrency = ((get(settings).mainCurrency as string) ?? 'EUR').toUpperCase();
  const existingRates = get(currencies);

  const neededPairs = getNeededPairs(allAssets, mainCurrency, existingRates);
  if (neededPairs.length === 0) return;

  const progress: CurrencyFetchProgress = {
    active: true,
    current: 0,
    total: neededPairs.length,
    currentPair: '',
    errors: [],
  };
  currencyFetchProgress.set({ ...progress });

  // Fetch all needed EUR-based pairs
  const fetchedEURRates = new Map<string, CurrencyRate>();

  for (const pair of neededPairs) {
    const ccy = pair.slice(0, 3);
    progress.current++;
    progress.currentPair = pair;
    currencyFetchProgress.set({ ...progress });

    try {
      const rate = await fetchECBRates({ currency: ccy });
      fetchedEURRates.set(pair, rate);

      // Merge with existing and store the EUR-based pair
      const existing = existingRates.find((r) => r.pair === pair);
      const merged = existing ? mergeRates(existing, rate) : rate;
      await addCurrencyRate(merged);
    } catch (err) {
      progress.errors.push({
        pair,
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  // Derive cross-rates if mainCurrency is not EUR
  if (mainCurrency !== 'EUR') {
    const mainEURPair = `${mainCurrency}EUR`;
    const mainEURRate = fetchedEURRates.get(mainEURPair)
      ?? existingRates.find((r) => r.pair === mainEURPair);

    if (mainEURRate && mainEURRate.rates.length > 0) {
      for (const [pair, eurRate] of fetchedEURRates) {
        const sourceCcy = pair.slice(0, 3);
        if (sourceCcy === mainCurrency) continue;

        const crossPair = `${sourceCcy}${mainCurrency}`;
        const crossRate = deriveCrossRate(eurRate, mainEURRate, crossPair);

        if (crossRate.rates.length > 0) {
          const existing = existingRates.find((r) => r.pair === crossPair);
          const merged = existing ? mergeRates(existing, crossRate) : crossRate;
          await addCurrencyRate(merged);
        }
      }
    }
  }

  progress.active = false;
  currencyFetchProgress.set({ ...progress });
}
