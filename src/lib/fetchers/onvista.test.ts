import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchInstrument, getSnapshot, getChartHistory, fetchPriceData } from './onvista';

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
  it('returns the first search result', async () => {
    const spy = mockFetch([
      {
        ok: true,
        json: () => ({
          search: {
            results: [
              { entityType: 'FUND', entityValue: '12345', isin: 'IE00B4L5Y983', name: 'iShares MSCI World' },
            ],
          },
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
      { ok: true, json: () => ({ search: { results: [] } }) },
    ]);

    const result = await searchInstrument('INVALID');
    expect(result).toBeNull();
  });
});

describe('getSnapshot', () => {
  it('returns snapshot data', async () => {
    const snapshotData = {
      idNotation: 99999,
      isoCurrency: 'EUR',
      name: 'iShares Core MSCI World',
      isin: 'IE00B4L5Y983',
      wkn: 'A0RPWH',
    };

    mockFetch([{ ok: true, json: () => snapshotData }]);

    const result = await getSnapshot('FUND', 'IE00B4L5Y983');
    expect(result.idNotation).toBe(99999);
    expect(result.isoCurrency).toBe('EUR');
    expect(result.name).toBe('iShares Core MSCI World');
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
          search: {
            results: [
              { entityType: 'FUND', entityValue: '12345', isin: 'IE00B4L5Y983', name: 'iShares MSCI World' },
            ],
          },
        }),
      },
      // snapshot
      {
        ok: true,
        json: () => ({
          idNotation: 99999,
          isoCurrency: 'EUR',
          name: 'iShares Core MSCI World',
          isin: 'IE00B4L5Y983',
          wkn: 'A0RPWH',
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
      { ok: true, json: () => ({ search: { results: [] } }) },
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
      // search
      {
        ok: true,
        json: () => ({
          search: {
            results: [
              { entityType: 'FUND', entityValue: '12345', isin: 'IE00B4L5Y983', name: 'Test' },
            ],
          },
        }),
      },
      // snapshot
      {
        ok: true,
        json: () => ({
          idNotation: 99999,
          isoCurrency: 'EUR',
          name: 'Test',
        }),
      },
      // chart history — empty
      {
        ok: true,
        json: () => ({ datetimeLast: [], last: [] }),
      },
    ]);

    const result = await fetchPriceData('IE00B4L5Y983');
    expect(result.success).toBe(false);
  });
});
