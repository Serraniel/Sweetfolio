/**
 * Currency conversion for asset prices using uploaded conversion rate history.
 */

import type { CurrencyRate, PricePoint } from '$lib/types';

/**
 * Convert prices from one currency to another using historical rates.
 * Uses forward-fill for missing rate dates (last known rate carried forward).
 *
 * @param prices - Price series in the source currency
 * @param currencyRate - Currency rate data for the pair (e.g. "USDEUR")
 * @param targetCurrency - The target currency code
 * @param sourceCurrency - The source currency code
 * @returns Converted price series, or null if no conversion data available
 */
export function convertPrices(
  prices: PricePoint[],
  currencyRate: CurrencyRate,
  sourceCurrency: string,
  targetCurrency: string,
): PricePoint[] | null {
  if (sourceCurrency === targetCurrency) return prices;

  // Build a rate lookup map sorted by date
  const rateMap = new Map<string, number>();
  const sortedRates = [...currencyRate.rates].sort((a, b) => a.date.localeCompare(b.date));
  for (const r of sortedRates) {
    rateMap.set(r.date, r.rate);
  }

  if (sortedRates.length === 0) return null;

  // Determine if we need to invert (e.g., pair is "EURUSD" but we need USD->EUR)
  const pair = currencyRate.pair;
  const directPair = sourceCurrency + targetCurrency;
  const inversePair = targetCurrency + sourceCurrency;
  let invert = false;

  if (pair === directPair) {
    invert = false;
  } else if (pair === inversePair) {
    invert = true;
  } else {
    return null; // Pair does not match
  }

  // Forward-fill rates to cover all price dates
  const allRateDates = sortedRates.map((r) => r.date);
  const converted: PricePoint[] = [];

  for (const p of prices) {
    let rate = rateMap.get(p.date);

    if (rate === undefined) {
      // Forward-fill: find the most recent rate before this date
      rate = findNearestRate(allRateDates, sortedRates, p.date);
    }

    if (rate === undefined) continue;

    const effectiveRate = invert ? 1 / rate : rate;
    converted.push({
      date: p.date,
      close: p.close * effectiveRate,
    });
  }

  return converted;
}

function findNearestRate(
  sortedDates: string[],
  sortedRates: Array<{ date: string; rate: number }>,
  targetDate: string,
): number | undefined {
  // Binary search for the nearest date <= targetDate
  let lo = 0;
  let hi = sortedDates.length - 1;
  let best = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedDates[mid] <= targetDate) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (best >= 0) return sortedRates[best].rate;
  // If all rates are after targetDate, use the earliest available
  return sortedRates.length > 0 ? sortedRates[0].rate : undefined;
}
