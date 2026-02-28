import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchECBRates } from './ecb';

// Sample ECB CSV response (trimmed to relevant columns, but with full header)
const SAMPLE_CSV = [
  'KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE,OBS_STATUS,OBS_CONF,OBS_PRE_BREAK,OBS_COM,TIME_FORMAT,BREAKS,COLLECTION,COMPILING_ORG,DISS_ORG,DOM_SER_IDS,PUBL_ECB,PUBL_MU,PUBL_PUBLIC,UNIT_INDEX_BASE,COMPILATION,COVERAGE,DECIMALS,NAT_TITLE,SOURCE_AGENCY,SOURCE_PUB,TITLE,TITLE_COMPL,UNIT,UNIT_MULT',
  'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2025-01-02,1.0321,A,F,,,P1D,,A,,,,,,,99Q1=100,,,4,,4F0,,US dollar/Euro,"ECB reference exchange rate, US dollar/Euro",USD,0',
  'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2025-01-03,1.0299,A,F,,,P1D,,A,,,,,,,99Q1=100,,,4,,4F0,,US dollar/Euro,"ECB reference exchange rate, US dollar/Euro",USD,0',
  'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2025-01-06,1.0426,A,F,,,P1D,,A,,,,,,,99Q1=100,,,4,,4F0,,US dollar/Euro,"ECB reference exchange rate, US dollar/Euro",USD,0',
].join('\n');

describe('fetchECBRates', () => {
  const originalFetch = globalThis.fetch;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('parses ECB CSV response into CurrencyRate', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(SAMPLE_CSV, { status: 200 }));

    const result = await fetchECBRates({ currency: 'USD' });

    expect(result.pair).toBe('USDEUR');
    expect(result.rates).toHaveLength(3);
    expect(result.rates[0]).toEqual({ date: '2025-01-02', rate: 1.0321 });
    expect(result.rates[1]).toEqual({ date: '2025-01-03', rate: 1.0299 });
    expect(result.rates[2]).toEqual({ date: '2025-01-06', rate: 1.0426 });
  });

  it('sorts rates by date ascending', async () => {
    const reversed = [
      SAMPLE_CSV.split('\n')[0],
      SAMPLE_CSV.split('\n')[3],
      SAMPLE_CSV.split('\n')[1],
      SAMPLE_CSV.split('\n')[2],
    ].join('\n');

    fetchSpy.mockResolvedValueOnce(new Response(reversed, { status: 200 }));

    const result = await fetchECBRates({ currency: 'USD' });
    const dates = result.rates.map((r) => r.date);
    expect(dates).toEqual(['2025-01-02', '2025-01-03', '2025-01-06']);
  });

  it('returns empty rates for EUR-to-EUR', async () => {
    const result = await fetchECBRates({ currency: 'EUR' });
    expect(result.pair).toBe('EUREUR');
    expect(result.rates).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uppercases currency code', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(SAMPLE_CSV, { status: 200 }));

    const result = await fetchECBRates({ currency: 'usd' });
    expect(result.pair).toBe('USDEUR');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('/D.USD.EUR.SP00.A');
  });

  it('includes date range params when provided', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(SAMPLE_CSV, { status: 200 }));

    await fetchECBRates({
      currency: 'GBP',
      startPeriod: '2024-01-01',
      endPeriod: '2024-12-31',
    });

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('startPeriod=2024-01-01');
    expect(url).toContain('endPeriod=2024-12-31');
  });

  it('throws on invalid currency code', async () => {
    await expect(fetchECBRates({ currency: 'TOOLONG' })).rejects.toThrow('Invalid currency code');
    await expect(fetchECBRates({ currency: 'AB' })).rejects.toThrow('Invalid currency code');
  });

  it('throws on HTTP error', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Not Found', { status: 404, statusText: 'Not Found' }));

    await expect(fetchECBRates({ currency: 'USD' })).rejects.toThrow('ECB API request failed: 404');
  });

  it('throws when CSV is missing expected columns', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('COL_A,COL_B\n1,2\n', { status: 200 }));

    await expect(fetchECBRates({ currency: 'USD' })).rejects.toThrow('missing expected columns');
  });

  it('skips rows with invalid data', async () => {
    const csv = [
      'KEY,TIME_PERIOD,OBS_VALUE',
      'EXR,2025-01-02,1.05',
      'EXR,bad-date,1.06',
      'EXR,2025-01-03,not-a-number',
      'EXR,2025-01-04,-0.5',
      'EXR,2025-01-06,1.07',
      '',
    ].join('\n');

    fetchSpy.mockResolvedValueOnce(new Response(csv, { status: 200 }));

    const result = await fetchECBRates({ currency: 'CHF' });
    expect(result.rates).toHaveLength(2);
    expect(result.rates[0].date).toBe('2025-01-02');
    expect(result.rates[1].date).toBe('2025-01-06');
  });
});
