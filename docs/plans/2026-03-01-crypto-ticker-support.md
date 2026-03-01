# Crypto Ticker Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to import crypto assets (BTC, ETH, etc.) by ticker symbol via the existing identifier lookup input.

**Architecture:** Add a CoinGecko fetcher that resolves ticker symbols to price history. Extend the scraper module with `validateTicker()` and `fetchByTicker()`. Update the assets page UI to detect and handle ticker input alongside ISIN/WKN.

**Tech Stack:** SvelteKit, TypeScript, Vitest, CoinGecko free API (no key required)

---

### Task 1: Add `validateTicker` and extend `IdentifierType`

**Files:**
- Modify: `src/lib/scraper/index.ts:78` (IdentifierType), `src/lib/scraper/index.ts:49-51` (add validateTicker after validateWKN)
- Test: `src/lib/scraper/scraper.test.ts`

**Step 1: Write the failing tests**

Add to `src/lib/scraper/scraper.test.ts`:

```typescript
// Add validateTicker to the import on line 2:
// import { validateISIN, validateWKN, validateTicker, fetchByISIN, fetchByWKN } from './index';

describe('validateTicker', () => {
  it('accepts common crypto tickers', () => {
    expect(validateTicker('BTC')).toBe(true);
    expect(validateTicker('ETH')).toBe(true);
    expect(validateTicker('DOGE')).toBe(true);
    expect(validateTicker('SHIB')).toBe(true);
  });

  it('accepts tickers with digits', () => {
    expect(validateTicker('1INCH')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(validateTicker('btc')).toBe(true);
    expect(validateTicker('Eth')).toBe(true);
  });

  it('rejects empty and too-short input', () => {
    expect(validateTicker('')).toBe(false);
    expect(validateTicker('A')).toBe(false);
  });

  it('rejects input longer than 10 characters', () => {
    expect(validateTicker('ABCDEFGHIJK')).toBe(false);
  });

  it('rejects strings that are valid ISIN or WKN', () => {
    // 12-char ISIN pattern should not match ticker (handled by ISIN validator)
    expect(validateTicker('US0378331005')).toBe(false);
    // 6-char WKN pattern should not match ticker (handled by WKN validator)
    expect(validateTicker('A0RPWH')).toBe(false);
  });

  it('rejects strings with special characters', () => {
    expect(validateTicker('BTC!')).toBe(false);
    expect(validateTicker('BTC-USD')).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/scraper/scraper.test.ts`
Expected: FAIL — `validateTicker` is not exported

**Step 3: Implement `validateTicker` and extend `IdentifierType`**

In `src/lib/scraper/index.ts`, after `validateWKN` (line 51), add:

```typescript
/**
 * Validate a crypto ticker symbol.
 * Must be 2-10 alphanumeric characters, and must NOT match ISIN or WKN patterns
 * (those are checked first in the UI detection flow).
 */
export function validateTicker(ticker: string): boolean {
  const upper = ticker.toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(upper)) return false;
  // Exclude strings that match ISIN or WKN patterns
  if (validateISIN(upper)) return false;
  if (validateWKN(upper)) return false;
  return true;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/scraper/scraper.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```
git add src/lib/scraper/index.ts src/lib/scraper/scraper.test.ts
git commit -m "feat(scraper): add validateTicker for crypto ticker detection"
```

---

### Task 2: Add CoinGecko fetcher

**Files:**
- Create: `src/lib/fetchers/coingecko.ts`
- Create: `src/lib/fetchers/coingecko.test.ts`

**Step 1: Write the failing tests**

Create `src/lib/fetchers/coingecko.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { fetchByTicker, _resetCoinListCache } from './coingecko';

function mockFetch(responses: Record<string, { ok: boolean; json: () => unknown }>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const [pattern, resp] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        if (!resp.ok) {
          return { ok: false, status: 404, statusText: 'Not Found' } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => resp.json(),
        } as Response;
      }
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  _resetCoinListCache();
});

describe('fetchByTicker', () => {
  it('resolves BTC to bitcoin and returns price data', async () => {
    const spy = mockFetch({
      '/coins/list': {
        ok: true,
        json: () => [
          { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' },
          { id: 'ethereum', symbol: 'eth', name: 'Ethereum' },
        ],
      },
      '/coins/bitcoin/market_chart': {
        ok: true,
        json: () => ({
          prices: [
            [1609459200000, 29000.5],
            [1609545600000, 30000.75],
          ],
        }),
      },
    });

    const result = await fetchByTicker('BTC', 'USD');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Bitcoin');
      expect(result.data.currency).toBe('USD');
      expect(result.data.classification).toBe('crypto');
      expect(result.data.prices).toHaveLength(2);
      expect(result.data.prices[0]).toEqual({ date: '2021-01-01', close: 29000.5 });
    }
  });

  it('is case-insensitive for ticker symbol', async () => {
    mockFetch({
      '/coins/list': {
        ok: true,
        json: () => [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' }],
      },
      '/coins/bitcoin/market_chart': {
        ok: true,
        json: () => ({ prices: [[1609459200000, 29000]] }),
      },
    });

    const result = await fetchByTicker('btc', 'EUR');
    expect(result.success).toBe(true);
  });

  it('returns error when ticker not found in coin list', async () => {
    mockFetch({
      '/coins/list': {
        ok: true,
        json: () => [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' }],
      },
    });

    const result = await fetchByTicker('NOTACOIN', 'USD');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('NOTACOIN');
      expect(result.error.recoverable).toBe(true);
    }
  });

  it('caches the coin list across calls', async () => {
    const spy = mockFetch({
      '/coins/list': {
        ok: true,
        json: () => [
          { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' },
          { id: 'ethereum', symbol: 'eth', name: 'Ethereum' },
        ],
      },
      '/coins/bitcoin/market_chart': {
        ok: true,
        json: () => ({ prices: [[1609459200000, 29000]] }),
      },
      '/coins/ethereum/market_chart': {
        ok: true,
        json: () => ({ prices: [[1609459200000, 2000]] }),
      },
    });

    await fetchByTicker('BTC', 'USD');
    await fetchByTicker('ETH', 'USD');

    // coins/list should only be fetched once
    const listCalls = spy.mock.calls.filter(([url]) =>
      (typeof url === 'string' ? url : url.toString()).includes('/coins/list'),
    );
    expect(listCalls).toHaveLength(1);
  });

  it('returns error when CoinGecko API fails', async () => {
    mockFetch({
      '/coins/list': { ok: false, json: () => ({}) },
    });

    const result = await fetchByTicker('BTC', 'USD');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.recoverable).toBe(true);
    }
  });

  it('deduplicates prices by date', async () => {
    mockFetch({
      '/coins/list': {
        ok: true,
        json: () => [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' }],
      },
      '/coins/bitcoin/market_chart': {
        ok: true,
        json: () => ({
          prices: [
            [1609459200000, 29000],
            [1609459200000, 29100], // same day duplicate
            [1609545600000, 30000],
          ],
        }),
      },
    });

    const result = await fetchByTicker('BTC', 'USD');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prices).toHaveLength(2);
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/fetchers/coingecko.test.ts`
Expected: FAIL — module not found

**Step 3: Implement CoinGecko fetcher**

Create `src/lib/fetchers/coingecko.ts`:

```typescript
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
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/fetchers/coingecko.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```
git add src/lib/fetchers/coingecko.ts src/lib/fetchers/coingecko.test.ts
git commit -m "feat(fetchers): add CoinGecko fetcher for crypto price data"
```

---

### Task 3: Add `fetchByTicker` to scraper module

**Files:**
- Modify: `src/lib/scraper/index.ts` (add fetchByTicker function, register CoinGecko source)
- Test: `src/lib/scraper/scraper.test.ts`

**Step 1: Write the failing test**

Add to `src/lib/scraper/scraper.test.ts`:

```typescript
// Update import to include fetchByTicker:
// import { validateISIN, validateWKN, validateTicker, fetchByISIN, fetchByWKN, fetchByTicker } from './index';

describe('fetchByTicker', () => {
  it('returns validation error for invalid ticker', async () => {
    const result = await fetchByTicker('A');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.source).toBe('validation');
      expect(result.error.recoverable).toBe(false);
    }
  });

  it('returns failure when CoinGecko fails', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    try {
      const result = await fetchByTicker('BTC');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.recoverable).toBe(true);
      }
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/scraper/scraper.test.ts`
Expected: FAIL — `fetchByTicker` not exported

**Step 3: Implement `fetchByTicker` in scraper**

In `src/lib/scraper/index.ts`, add after `fetchByWKN` (after line 132):

```typescript
/**
 * Attempt to fetch historical price data by crypto ticker symbol.
 *
 * Uses CoinGecko to resolve the ticker and fetch price history.
 * The vs_currency is read from the user's mainCurrency setting.
 */
export async function fetchByTicker(ticker: string): Promise<ScraperOutcome> {
  if (!validateTicker(ticker)) {
    return {
      success: false,
      error: {
        message: `Invalid ticker format: "${ticker}". Expected 2-10 character alphanumeric crypto ticker.`,
        source: 'validation',
        recoverable: false,
      },
    };
  }

  const vsCurrency = (get(settings).mainCurrency as string) ?? 'EUR';

  try {
    const result = await coingeckoFetch(ticker.toUpperCase(), vsCurrency);
    if (result.success) {
      return {
        success: true,
        data: {
          prices: result.data.prices,
          name: result.data.name,
          currency: result.data.currency,
          source: 'coingecko',
          classification: result.data.classification,
        },
      };
    }
    return {
      success: false,
      error: {
        message: result.error.message,
        source: 'coingecko',
        recoverable: result.error.recoverable,
      },
    };
  } catch {
    return {
      success: false,
      error: {
        message: `Could not fetch data for ticker ${ticker}. Please try again or upload a CSV file instead.`,
        source: 'coingecko',
        recoverable: true,
      },
    };
  }
}
```

Add the import at the top of `src/lib/scraper/index.ts` (with the other fetcher imports):

```typescript
import { fetchByTicker as coingeckoFetch } from '$lib/fetchers/coingecko';
```

Note: `get` and `settings` are already imported (lines 187-188).

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/scraper/scraper.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```
git add src/lib/scraper/index.ts src/lib/scraper/scraper.test.ts
git commit -m "feat(scraper): add fetchByTicker for crypto ticker lookup"
```

---

### Task 4: Update assets page UI for ticker support

**Files:**
- Modify: `src/routes/assets/+page.svelte`

**Step 1: Update imports (line 7)**

Change:
```typescript
import { validateISIN, validateWKN, fetchByISIN, fetchByWKN, type ScraperResult } from '$lib/scraper/index';
```
To:
```typescript
import { validateISIN, validateWKN, validateTicker, fetchByISIN, fetchByWKN, fetchByTicker, type ScraperResult } from '$lib/scraper/index';
```

**Step 2: Extend `IdentifierType` (line 78)**

Change:
```typescript
type IdentifierType = 'isin' | 'wkn' | null;
```
To:
```typescript
type IdentifierType = 'isin' | 'wkn' | 'ticker' | null;
```

**Step 3: Update `lookupIdentifierType` derived (lines 80-86)**

Change:
```typescript
const lookupIdentifierType: IdentifierType = $derived.by(() => {
    const v = lookupInput.trim().toUpperCase();
    if (v.length === 0) return null;
    if (validateISIN(v)) return 'isin';
    if (validateWKN(v)) return 'wkn';
    return null;
});
```
To:
```typescript
const lookupIdentifierType: IdentifierType = $derived.by(() => {
    const v = lookupInput.trim().toUpperCase();
    if (v.length === 0) return null;
    if (validateISIN(v)) return 'isin';
    if (validateWKN(v)) return 'wkn';
    if (validateTicker(v)) return 'ticker';
    return null;
});
```

**Step 4: Update `lookupHint` derived (lines 89-95)**

Change:
```typescript
const lookupHint = $derived.by(() => {
    const v = lookupInput.trim();
    if (v.length === 0) return '';
    if (lookupIdentifierType === 'isin') return 'Valid ISIN';
    if (lookupIdentifierType === 'wkn') return 'Valid WKN';
    return 'Not a valid ISIN or WKN';
});
```
To:
```typescript
const lookupHint = $derived.by(() => {
    const v = lookupInput.trim();
    if (v.length === 0) return '';
    if (lookupIdentifierType === 'isin') return 'Valid ISIN';
    if (lookupIdentifierType === 'wkn') return 'Valid WKN';
    if (lookupIdentifierType === 'ticker') return 'Crypto ticker';
    return 'Not a valid ISIN, WKN, or crypto ticker';
});
```

**Step 5: Update `handleLookup` fetch routing (lines 108-110)**

Change:
```typescript
const outcome = fetchedIdentifierType === 'isin'
    ? await fetchByISIN(identifier)
    : await fetchByWKN(identifier);
```
To:
```typescript
const outcome =
    fetchedIdentifierType === 'isin' ? await fetchByISIN(identifier)
    : fetchedIdentifierType === 'wkn' ? await fetchByWKN(identifier)
    : await fetchByTicker(identifier);
```

**Step 6: Update `handleLookupConfirm` isin/wkn assignment (lines 133-134)**

No change needed — the existing logic already handles this correctly:
- `isin` is set only when `fetchedIdentifierType === 'isin'`
- `wkn` is set only when `fetchedIdentifierType === 'wkn'`
- For `'ticker'`, both will be `null` ✓

**Step 7: Update the input placeholder**

Find the input element with `placeholder="Enter ISIN or WKN..."` and change it to:
```
placeholder="Enter ISIN, WKN or crypto ticker..."
```

**Step 8: Verify manually**

Run: `npm run dev`
1. Open the assets page
2. Type "BTC" → should show "Crypto ticker" hint in green, Fetch button enabled
3. Type "A0RPWH" → should show "Valid WKN" (not crypto ticker)
4. Type "US0378331005" → should show "Valid ISIN"
5. Click Fetch with "BTC" → should load Bitcoin price data from CoinGecko
6. Confirm import → asset added with classification "crypto"

**Step 9: Commit**

```
git add src/routes/assets/+page.svelte
git commit -m "feat(assets): add crypto ticker support to identifier lookup UI"
```

---

### Task 5: Run full test suite and verify build

**Step 1: Run all tests**

Run: `npm test`
Expected: ALL PASS

**Step 2: Run type check**

Run: `npx svelte-check`
Expected: No errors

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Fix any issues found, commit if needed**

```
git add -A
git commit -m "fix: address issues from full test suite run"
```
