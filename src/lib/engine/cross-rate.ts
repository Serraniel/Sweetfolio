import type { CurrencyRate } from '$lib/types';

/**
 * Derive a cross-rate from two EUR-based rate series.
 * E.g. GBPUSD = GBPEUR / USDEUR for each overlapping date.
 */
export function deriveCrossRate(
  sourceEUR: CurrencyRate,
  targetEUR: CurrencyRate,
  pair: string,
): CurrencyRate {
  const targetMap = new Map(targetEUR.rates.map((r) => [r.date, r.rate]));

  const rates: Array<{ date: string; rate: number }> = [];
  for (const s of sourceEUR.rates) {
    const t = targetMap.get(s.date);
    if (t !== undefined && t > 0) {
      rates.push({ date: s.date, rate: s.rate / t });
    }
  }

  rates.sort((a, b) => a.date.localeCompare(b.date));
  return { pair, rates };
}

/**
 * Merge fetched rates into existing rates.
 * Existing rates take priority on overlapping dates; fetched rates fill gaps.
 */
export function mergeRates(existing: CurrencyRate, fetched: CurrencyRate): CurrencyRate {
  const existingDates = new Set(existing.rates.map((r) => r.date));
  const merged = [
    ...existing.rates,
    ...fetched.rates.filter((r) => !existingDates.has(r.date)),
  ];
  merged.sort((a, b) => a.date.localeCompare(b.date));
  return { pair: existing.pair || fetched.pair, rates: merged };
}
