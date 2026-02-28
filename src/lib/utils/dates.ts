/**
 * Date utility functions for financial data processing.
 * All dates are ISO 8601 strings (YYYY-MM-DD).
 */

import type { PricePoint } from '$lib/types';

/**
 * Forward-fill missing dates in a price series.
 * For each missing trading day within the range, the last known close price is carried forward.
 */
export function forwardFillPrices(prices: PricePoint[]): PricePoint[] {
  if (prices.length === 0) return [];

  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date));
  const startDate = new Date(sorted[0].date);
  const endDate = new Date(sorted[sorted.length - 1].date);

  // Only add the first element if it's not on a weekend
  const startDay = startDate.getDay();
  const result: PricePoint[] = (startDay !== 0 && startDay !== 6) ? [sorted[0]] : [];

  const priceMap = new Map<string, number>();
  for (const p of sorted) {
    priceMap.set(p.date, p.close);
  }

  let lastClose = sorted[0].close;
  const current = new Date(startDate);
  current.setDate(current.getDate() + 1);

  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    // Skip weekends (Saturday=6, Sunday=0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const dateStr = toISODate(current);
      if (priceMap.has(dateStr)) {
        lastClose = priceMap.get(dateStr)!;
      }
      result.push({ date: dateStr, close: lastClose });
    }
    current.setDate(current.getDate() + 1);
  }

  return result;
}

/**
 * Align multiple price series to the same date range (intersection).
 * Returns arrays of the same length with matching dates, forward-filled.
 */
export function alignPriceSeries(
  seriesArray: PricePoint[][],
): { dates: string[]; alignedSeries: number[][] } {
  if (seriesArray.length === 0) return { dates: [], alignedSeries: [] };

  // Forward-fill each series
  const filled = seriesArray.map(forwardFillPrices);

  // Build date sets
  const dateSets = filled.map((s) => new Set(s.map((p) => p.date)));

  // Find intersection of all dates
  let commonDates = dateSets[0];
  for (let i = 1; i < dateSets.length; i++) {
    const next = new Set<string>();
    for (const d of commonDates) {
      if (dateSets[i].has(d)) next.add(d);
    }
    commonDates = next;
  }

  const dates = [...commonDates].sort();

  // Build price maps and extract aligned values
  const alignedSeries: number[][] = filled.map((series) => {
    const map = new Map<string, number>();
    for (const p of series) {
      map.set(p.date, p.close);
    }
    return dates.map((d) => map.get(d)!);
  });

  return { dates, alignedSeries };
}

/**
 * Get the date N years ago from a reference date.
 */
export function subtractYears(dateStr: string, years: number): string {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() - years);
  return toISODate(d);
}

/**
 * Filter prices to those within a date range (inclusive).
 */
export function filterByDateRange(
  prices: PricePoint[],
  startDate: string,
  endDate: string,
): PricePoint[] {
  return prices.filter((p) => p.date >= startDate && p.date <= endDate);
}

/**
 * Convert a Date object to YYYY-MM-DD string.
 */
export function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get the number of calendar days between two ISO date strings.
 */
export function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}
