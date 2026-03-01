import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchInstrument, getSnapshot, getChartHistory, fetchPriceData, searchCryptoByTicker, getCryptoSnapshot, fetchCryptoByTicker } from './onvista';

function mockFetch(responses: Array<{ ok: boolean; json: () => unknown }>) {
  let callIndex = 0;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    const resp = responses[callIndex++];
    if (!resp) throw new Error('Unexpected fetch call');
    if (!resp.ok) {
      return { ok: false, status: 404, statusText: 'Not Found' } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => resp.json(),
    } as Response;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('searchInstrument', () => {
  it('returns instrument from direct match', async () => {
    const spy = mockFetch([
      {
        ok: true,
        json: () => ({
          instrument: {
            entityType: 'FUND',
            entityValue: '40773086',
            isin: 'IE00B3RBWM25',
            name: 'Vanguard FTSE All-World UCITS ETF USD Dis.',
          },
          facets: [],
        }),
      },
    ]);

    const result = await searchInstrument('A1JX52');
    expect(result).toEqual({
      entityType: 'FUND',
      entityValue: '40773086',
      isin: 'IE00B3RBWM25',
      name: 'Vanguard FTSE All-World UCITS ETF USD Dis.',
    });
    expect(spy).toHaveBeenCalledOnce();
  });

  it('falls back to facets results when no direct instrument', async () => {
    const spy = mockFetch([
      {
        ok: true,
        json: () => ({
          facets: [
            {
              type: 'ETF',
              results: [
                { entityType: 'FUND', entityValue: '12345', isin: 'IE00B4L5Y983', name: 'iShares MSCI World' },
              ],
            },
          ],
        }),
      },
    ]);

    const result = await searchInstrument('IE00B4L5Y983');
    expect(result).toEqual({
      entityType: 'FUND',
      entityValue: '12345',
      isin: 'IE00B4L5Y983',
      name: 'iShares MSCI World',
    });
    expect(spy).toHaveBeenCalledOnce();
  });

  it('returns null when no results found', async () => {
    mockFetch([
      { ok: true, json: () => ({ facets: [], instrument: null }) },
    ]);

    const result = await searchInstrument('INVALID');
    expect(result).toBeNull();
  });
});

describe('getSnapshot', () => {
  it('returns snapshot data from nested structure', async () => {
    const snapshotData = {
      instrument: {
        isin: 'IE00B4L5Y983',
        wkn: 'A0RPWH',
        name: 'iShares Core MSCI World',
      },
      quote: {
        isoCurrency: 'EUR',
      },
      chart: {
        idNotation: 99999,
      },
    };

    mockFetch([{ ok: true, json: () => snapshotData }]);

    const result = await getSnapshot('FUND', 'IE00B4L5Y983');
    expect(result.idNotation).toBe(99999);
    expect(result.isoCurrency).toBe('EUR');
    expect(result.name).toBe('iShares Core MSCI World');
    expect(result.isin).toBe('IE00B4L5Y983');
    expect(result.wkn).toBe('A0RPWH');
  });

  it('handles flat response format as fallback', async () => {
    const snapshotData = {
      idNotation: 88888,
      isoCurrency: 'USD',
      name: 'Test Fund',
      isin: 'US0000000000',
    };

    mockFetch([{ ok: true, json: () => snapshotData }]);

    const result = await getSnapshot('STOCK', 'US0000000000');
    expect(result.idNotation).toBe(88888);
    expect(result.isoCurrency).toBe('USD');
  });

  it('throws on API error', async () => {
    mockFetch([{ ok: false, json: () => ({}) }]);

    await expect(getSnapshot('FUND', 'INVALID')).rejects.toThrow('Onvista API error');
  });
});

describe('getChartHistory', () => {
  it('maps parallel arrays to PricePoint[]', async () => {
    mockFetch([
      {
        ok: true,
        json: () => ({
          datetimeLast: [1704067200000, 1704153600000, 1704240000000], // 2024-01-01, 02, 03
          last: [100.5, 101.0, 99.8],
        }),
      },
    ]);

    const prices = await getChartHistory('FUND', '12345', 99999);
    expect(prices).toHaveLength(3);
    expect(prices[0].close).toBe(100.5);
    expect(prices[2].close).toBe(99.8);
    // Dates should be sorted ascending
    expect(prices[0].date < prices[1].date).toBe(true);
  });

  it('deduplicates by date', async () => {
    mockFetch([
      {
        ok: true,
        json: () => ({
          datetimeLast: [1704067200000, 1704067200000],
          last: [100.0, 101.0],
        }),
      },
    ]);

    const prices = await getChartHistory('FUND', '12345', 99999);
    expect(prices).toHaveLength(1);
    expect(prices[0].close).toBe(100.0); // keeps first occurrence
  });

  it('skips non-finite values', async () => {
    mockFetch([
      {
        ok: true,
        json: () => ({
          datetimeLast: [1704067200000, 1704153600000],
          last: [100.0, NaN],
        }),
      },
    ]);

    const prices = await getChartHistory('FUND', '12345', 99999);
    expect(prices).toHaveLength(1);
  });

  it('returns empty array for mismatched arrays', async () => {
    mockFetch([
      {
        ok: true,
        json: () => ({
          datetimeLast: [1704067200000],
          last: [100.0, 101.0],
        }),
      },
    ]);

    const prices = await getChartHistory('FUND', '12345', 99999);
    expect(prices).toHaveLength(0);
  });
});

describe('fetchPriceData', () => {
  it('returns full result on success', async () => {
    mockFetch([
      // search
      {
        ok: true,
        json: () => ({
          instrument: { entityType: 'FUND', entityValue: '12345', isin: 'IE00B4L5Y983', name: 'iShares MSCI World' },
          facets: [],
        }),
      },
      // snapshot
      {
        ok: true,
        json: () => ({
          instrument: { name: 'iShares Core MSCI World', isin: 'IE00B4L5Y983', wkn: 'A0RPWH' },
          quote: { isoCurrency: 'EUR' },
          chart: { idNotation: 99999 },
        }),
      },
      // chart history
      {
        ok: true,
        json: () => ({
          datetimeLast: [1704067200000, 1704153600000],
          last: [100.5, 101.0],
        }),
      },
    ]);

    const result = await fetchPriceData('IE00B4L5Y983');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prices).toHaveLength(2);
      expect(result.data.name).toBe('iShares Core MSCI World');
      expect(result.data.isin).toBe('IE00B4L5Y983');
      expect(result.data.wkn).toBe('A0RPWH');
      expect(result.data.currency).toBe('EUR');
    }
  });

  it('returns error when instrument not found', async () => {
    mockFetch([
      { ok: true, json: () => ({ facets: [], instrument: null }) },
    ]);

    const result = await fetchPriceData('NOTFOUND');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.recoverable).toBe(true);
    }
  });

  it('returns error on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const result = await fetchPriceData('IE00B4L5Y983');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('Network error');
      expect(result.error.recoverable).toBe(true);
    }
  });

  it('returns error when no price data available', async () => {
    mockFetch([
      {
        ok: true,
        json: () => ({
          instrument: { entityType: 'FUND', entityValue: '12345', isin: 'IE00B4L5Y983', name: 'Test' },
          facets: [],
        }),
      },
      {
        ok: true,
        json: () => ({
          instrument: { name: 'Test' },
          quote: { isoCurrency: 'EUR' },
          chart: { idNotation: 99999 },
        }),
      },
      {
        ok: true,
        json: () => ({ datetimeLast: [], last: [] }),
      },
    ]);

    const result = await fetchPriceData('IE00B4L5Y983');
    expect(result.success).toBe(false);
  });
});

describe('searchCryptoByTicker', () => {
  it('returns crypto result from CRYPTO facet', async () => {
    mockFetch([
      {
        ok: true,
        json: () => ({
          facets: [
            { type: 'STOCK', results: [{ entityType: 'STOCK', entityValue: '1', isin: 'US123', name: 'Stock' }] },
            { type: 'CRYPTO', results: [{ entityType: 'CRYPTO', entityValue: 'BTCUSD', isin: 'XC000A2YY636', name: 'Bitcoin BTC/USD' }] },
          ],
        }),
      },
    ]);

    const result = await searchCryptoByTicker('BTC');
    expect(result).toEqual({
      entityType: 'CRYPTO',
      entityValue: 'BTCUSD',
      isin: 'XC000A2YY636',
      name: 'Bitcoin BTC/USD',
    });
  });

  it('returns crypto from direct instrument match', async () => {
    mockFetch([
      {
        ok: true,
        json: () => ({
          instrument: { entityType: 'CRYPTO', entityValue: 'ETHUSD', isin: 'XC000A2YY644', name: 'Ethereum ETH/USD' },
          facets: [],
        }),
      },
    ]);

    const result = await searchCryptoByTicker('ETH');
    expect(result).toEqual({
      entityType: 'CRYPTO',
      entityValue: 'ETHUSD',
      isin: 'XC000A2YY644',
      name: 'Ethereum ETH/USD',
    });
  });

  it('returns null when no CRYPTO facet found', async () => {
    mockFetch([
      {
        ok: true,
        json: () => ({
          facets: [
            { type: 'STOCK', results: [{ entityType: 'STOCK', entityValue: '1', isin: 'US123', name: 'Stock' }] },
          ],
        }),
      },
    ]);

    const result = await searchCryptoByTicker('NOTCRYPTO');
    expect(result).toBeNull();
  });

  it('ignores non-CRYPTO direct instrument match', async () => {
    mockFetch([
      {
        ok: true,
        json: () => ({
          instrument: { entityType: 'STOCK', entityValue: '1', isin: 'US123', name: 'Stock' },
          facets: [],
        }),
      },
    ]);

    const result = await searchCryptoByTicker('AAPL');
    expect(result).toBeNull();
  });
});

describe('getCryptoSnapshot', () => {
  it('returns snapshot using crypto URL pattern', async () => {
    const spy = mockFetch([
      {
        ok: true,
        json: () => ({
          instrument: { name: 'Bitcoin BTC/USD', isin: 'XC000A2YY636', wkn: 'A2YY63' },
          quote: { isoCurrency: 'USD' },
          chart: { idNotation: 12345 },
        }),
      },
    ]);

    const result = await getCryptoSnapshot('BTCUSD');
    expect(result.idNotation).toBe(12345);
    expect(result.isoCurrency).toBe('USD');
    expect(result.name).toBe('Bitcoin BTC/USD');
    expect(result.isin).toBe('XC000A2YY636');
    expect(result.wkn).toBe('A2YY63');
    // Verify URL uses crypto/ path, not ISIN-based
    expect(spy.mock.calls[0][0]).toContain('/crypto/BTCUSD/snapshot');
  });
});

describe('fetchCryptoByTicker', () => {
  it('returns full result on success', async () => {
    mockFetch([
      // searchCryptoByTicker
      {
        ok: true,
        json: () => ({
          facets: [
            { type: 'CRYPTO', results: [{ entityType: 'CRYPTO', entityValue: 'BTCUSD', isin: 'XC000A2YY636', name: 'Bitcoin BTC/USD' }] },
          ],
        }),
      },
      // getCryptoSnapshot
      {
        ok: true,
        json: () => ({
          instrument: { name: 'Bitcoin BTC/USD', isin: 'XC000A2YY636', wkn: 'A2YY63' },
          quote: { isoCurrency: 'USD' },
          chart: { idNotation: 12345 },
        }),
      },
      // getChartHistory
      {
        ok: true,
        json: () => ({
          datetimeLast: [1704067200000, 1704153600000],
          last: [42000.0, 43000.0],
        }),
      },
    ]);

    const result = await fetchCryptoByTicker('BTC');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prices).toHaveLength(2);
      expect(result.data.name).toBe('Bitcoin BTC/USD');
      expect(result.data.classification).toBe('crypto');
      expect(result.data.currency).toBe('USD');
      expect(result.data.isin).toBe('XC000A2YY636');
      expect(result.data.wkn).toBe('A2YY63');
    }
  });

  it('returns error when no crypto found', async () => {
    mockFetch([
      { ok: true, json: () => ({ facets: [] }) },
    ]);

    const result = await fetchCryptoByTicker('NOTREAL');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('No cryptocurrency found');
      expect(result.error.recoverable).toBe(true);
    }
  });

  it('returns error on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const result = await fetchCryptoByTicker('BTC');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('Network error');
      expect(result.error.recoverable).toBe(true);
    }
  });

  it('returns error when no price data available', async () => {
    mockFetch([
      {
        ok: true,
        json: () => ({
          facets: [
            { type: 'CRYPTO', results: [{ entityType: 'CRYPTO', entityValue: 'BTCUSD', isin: 'XC000A2YY636', name: 'Bitcoin' }] },
          ],
        }),
      },
      {
        ok: true,
        json: () => ({
          instrument: { name: 'Bitcoin' },
          quote: { isoCurrency: 'USD' },
          chart: { idNotation: 12345 },
        }),
      },
      { ok: true, json: () => ({ datetimeLast: [], last: [] }) },
    ]);

    const result = await fetchCryptoByTicker('BTC');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('No price data');
    }
  });
});
