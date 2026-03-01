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
            [1609459200000, 29100],
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
