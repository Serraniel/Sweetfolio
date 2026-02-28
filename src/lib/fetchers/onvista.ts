/**
 * Onvista price data fetcher.
 *
 * Fetches historical price data from the Onvista API (api.onvista.de).
 * CORS is fully supported, no API key required.
 *
 * Flow:
 * 1. Search by ISIN or WKN to find the instrument
 * 2. Get snapshot for the instrument to obtain idNotation and metadata
 * 3. Fetch chart history using idNotation for daily resolution
 */

import type { PricePoint } from '$lib/types';
import type { FetchOutcome, FetchResult } from './types';

const BASE_URL = 'https://api.onvista.de/api/v1';

// --- Onvista API response types ---

interface SearchFacetResult {
  search: {
    results: Array<{
      entityType: string;
      entityValue: string;
      isin: string;
      name: string;
    }>;
  };
}

interface SnapshotResponse {
  idNotation: number;
  isoCurrency: string;
  name: string;
  isin?: string;
  wkn?: string;
}

interface ChartHistoryResponse {
  datetimeLast: number[];
  last: number[];
}

// --- Internal helpers ---

/** Map Onvista entity types to API path segments. */
function entityTypePath(entityType: string): string {
  const map: Record<string, string> = {
    FUND: 'funds',
    STOCK: 'stocks',
    BOND: 'bonds',
    INDEX: 'indices',
    DERIVATIVE: 'derivatives',
    ETF: 'etfs',
    COMMODITY: 'commodities',
    PRECIOUS_METAL: 'precious_metals',
    CURRENCY: 'currencies',
  };
  return map[entityType] ?? entityType.toLowerCase();
}

/** Convert a unix timestamp (seconds or milliseconds) to YYYY-MM-DD. */
function unixToISODate(timestamp: number): string {
  // Onvista uses millisecond timestamps when value > 10^12
  const ms = timestamp > 1e12 ? timestamp : timestamp * 1000;
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Format a Date as YYYY-MM-DD for query parameters. */
function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Onvista API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

// --- Public API ---

/**
 * Search Onvista for an instrument by ISIN or WKN.
 * Returns the first matching result's entity type and value, or null if not found.
 */
export async function searchInstrument(
  query: string,
): Promise<{ entityType: string; entityValue: string; isin: string; name: string } | null> {
  const url = `${BASE_URL}/instruments/search/facet?perType=10&searchValue=${encodeURIComponent(query)}`;
  const data = await fetchJSON<SearchFacetResult>(url);

  const results = data?.search?.results;
  if (!results || results.length === 0) return null;

  return results[0];
}

/**
 * Get a snapshot for an instrument, returning idNotation and metadata.
 */
export async function getSnapshot(
  entityType: string,
  isin: string,
): Promise<SnapshotResponse> {
  const typePath = entityTypePath(entityType);
  const url = `${BASE_URL}/${typePath}/ISIN:${encodeURIComponent(isin)}/snapshot`;
  return fetchJSON<SnapshotResponse>(url);
}

/**
 * Fetch daily chart history for an instrument.
 * Defaults to fetching all available data (from 2000-01-01 to today).
 */
export async function getChartHistory(
  entityType: string,
  entityValue: string,
  idNotation: number,
  startDate?: Date,
  endDate?: Date,
): Promise<PricePoint[]> {
  const start = formatDate(startDate ?? new Date(2000, 0, 1));
  const end = formatDate(endDate ?? new Date());
  const typePath = entityTypePath(entityType).toUpperCase();

  const url =
    `${BASE_URL}/instruments/${typePath}/${encodeURIComponent(entityValue)}/chart_history` +
    `?idNotation=${idNotation}&resolution=1D&startDate=${start}&endDate=${end}`;

  const data = await fetchJSON<ChartHistoryResponse>(url);

  if (!data.datetimeLast || !data.last || data.datetimeLast.length !== data.last.length) {
    return [];
  }

  const prices: PricePoint[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < data.datetimeLast.length; i++) {
    const close = data.last[i];
    if (close == null || !isFinite(close)) continue;

    const date = unixToISODate(data.datetimeLast[i]);
    // Deduplicate by date (keep first occurrence)
    if (seen.has(date)) continue;
    seen.add(date);

    prices.push({ date, close });
  }

  prices.sort((a, b) => a.date.localeCompare(b.date));
  return prices;
}

/**
 * Fetch historical price data by ISIN or WKN from Onvista.
 *
 * This is the main entry point. It searches for the instrument, gets the
 * snapshot for metadata, and fetches the full chart history.
 */
export async function fetchPriceData(query: string): Promise<FetchOutcome> {
  try {
    // Step 1: Search for the instrument
    const instrument = await searchInstrument(query);
    if (!instrument) {
      return {
        success: false,
        error: {
          message: `No instrument found on Onvista for "${query}".`,
          recoverable: true,
        },
      };
    }

    // Step 2: Get snapshot for metadata and idNotation
    const snapshot = await getSnapshot(instrument.entityType, instrument.isin);

    // Step 3: Fetch chart history
    const prices = await getChartHistory(
      instrument.entityType,
      instrument.entityValue,
      snapshot.idNotation,
    );

    if (prices.length === 0) {
      return {
        success: false,
        error: {
          message: `No price data available on Onvista for "${query}".`,
          recoverable: true,
        },
      };
    }

    const result: FetchResult = {
      prices,
      name: snapshot.name ?? instrument.name ?? null,
      isin: snapshot.isin ?? instrument.isin ?? null,
      wkn: snapshot.wkn ?? null,
      currency: snapshot.isoCurrency ?? null,
    };

    return { success: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error fetching from Onvista';
    return {
      success: false,
      error: { message, recoverable: true },
    };
  }
}
