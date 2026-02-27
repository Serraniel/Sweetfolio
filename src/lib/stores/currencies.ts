import { writable } from 'svelte/store';
import type { CurrencyRate } from '$lib/types';
import * as db from '$lib/storage/currencies';

export const currencies = writable<CurrencyRate[]>([]);

export async function loadCurrencies(): Promise<void> {
  currencies.set(await db.getAll());
}

export async function addCurrencyRate(rate: CurrencyRate): Promise<void> {
  await db.put(rate);
  currencies.update((list) => {
    const existing = list.findIndex((r) => r.pair === rate.pair);
    if (existing >= 0) {
      const updated = [...list];
      updated[existing] = rate;
      return updated;
    }
    return [...list, rate];
  });
}

export async function removeCurrencyRate(pair: string): Promise<void> {
  await db.remove(pair);
  currencies.update((list) => list.filter((r) => r.pair !== pair));
}
