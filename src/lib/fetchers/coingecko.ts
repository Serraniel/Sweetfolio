/**
 * CoinGecko price data fetcher for crypto assets.
 *
 * Uses the free CoinGecko API (no key required).
 * Resolves ticker symbols (BTC, ETH) to CoinGecko IDs via /coins/list,
 * then fetches historical prices via /coins/{id}/market_chart.
 */

import type { FetchOutcome } from './types';

const BASE_URL = 'https://api.coingecko.com/api/v3';

interface CoinListEntry {
  id: string;
  symbol: string;
  name: string;
}

let coinListCache: CoinListEntry[] | null = null;

/** Reset the coin list cache (for testing). */
export function _resetCoinListCache(): void {
  coinListCache = null;
}

async function fetchCoinList(): Promise<CoinListEntry[]> {
  if (coinListCache) return coinListCache;

  const response = await fetch(`${BASE_URL}/coins/list`);
  if (!response.ok) {
    throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
  }

  coinListCache = (await response.json()) as CoinListEntry[];
  return coinListCache;
}

function unixMsToISODate(timestampMs: number): string {
  const d = new Date(timestampMs);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Fetch historical price data by crypto ticker symbol.
 *
 * @param ticker - Crypto ticker (e.g. "BTC", "ETH")
 * @param vsCurrency - Fiat currency for prices (e.g. "USD", "EUR")
 */
export async function fetchByTicker(ticker: string, vsCurrency: string): Promise<FetchOutcome> {
  try {
    const coins = await fetchCoinList();
    const symbol = ticker.toLowerCase();
    const coin = coins.find((c) => c.symbol === symbol);

    if (!coin) {
      return {
        success: false,
        error: {
          message: `No cryptocurrency found for ticker "${ticker.toUpperCase()}".`,
          recoverable: true,
        },
      };
    }

    const vs = vsCurrency.toLowerCase();
    const url = `${BASE_URL}/coins/${coin.id}/market_chart?vs_currency=${vs}&days=max&interval=daily`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { prices: [number, number][] };

    const seen = new Set<string>();
    const prices = [];
    for (const [timestampMs, close] of data.prices) {
      if (close == null || !isFinite(close)) continue;
      const date = unixMsToISODate(timestampMs);
      if (seen.has(date)) continue;
      seen.add(date);
      prices.push({ date, close });
    }

    prices.sort((a, b) => a.date.localeCompare(b.date));

    return {
      success: true,
      data: {
        prices,
        name: coin.name,
        isin: null,
        wkn: null,
        currency: vsCurrency.toUpperCase(),
        classification: 'crypto',
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error fetching from CoinGecko';
    return {
      success: false,
      error: { message, recoverable: true },
    };
  }
}
