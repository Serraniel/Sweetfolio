import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateISIN, validateWKN, validateTicker, fetchByISIN, fetchByWKN, fetchByTicker } from './index';

describe('validateISIN', () => {
  it('accepts valid ISIN', () => {
    expect(validateISIN('US0378331005')).toBe(true); // Apple
    expect(validateISIN('DE0007100000')).toBe(true); // Daimler
    expect(validateISIN('IE00B4L5Y983')).toBe(true); // iShares Core MSCI World
  });

  it('rejects invalid ISIN', () => {
    expect(validateISIN('')).toBe(false);
    expect(validateISIN('US037833100')).toBe(false); // too short
    expect(validateISIN('US03783310055')).toBe(false); // too long
    expect(validateISIN('1234567890AB')).toBe(false); // starts with digits
    expect(validateISIN('us0378331005')).toBe(true); // case-insensitive
  });
});

describe('validateWKN', () => {
  it('accepts valid WKN', () => {
    expect(validateWKN('A0RPWH')).toBe(true); // iShares MSCI World
    expect(validateWKN('710000')).toBe(true); // numeric
    expect(validateWKN('ABC123')).toBe(true);
  });

  it('rejects invalid WKN', () => {
    expect(validateWKN('')).toBe(false);
    expect(validateWKN('A0RPW')).toBe(false); // too short
    expect(validateWKN('A0RPWHX')).toBe(false); // too long
    expect(validateWKN('a0rpwh')).toBe(true); // case-insensitive
  });
});

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
    expect(validateTicker('US0378331005')).toBe(false);
    expect(validateTicker('A0RPWH')).toBe(false);
  });

  it('rejects strings with special characters', () => {
    expect(validateTicker('BTC!')).toBe(false);
    expect(validateTicker('BTC-USD')).toBe(false);
  });
});

describe('fetchByISIN', () => {
  it('returns validation error for invalid ISIN', async () => {
    const result = await fetchByISIN('invalid');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.source).toBe('validation');
      expect(result.error.recoverable).toBe(false);
    }
  });

  it('returns failure when all data sources fail', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    try {
      const result = await fetchByISIN('US0378331005');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.source).toBe('all');
        expect(result.error.recoverable).toBe(true);
      }
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('fetchByWKN', () => {
  it('returns validation error for invalid WKN', async () => {
    const result = await fetchByWKN('x');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.source).toBe('validation');
    }
  });

  it('returns failure when all data sources fail', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    try {
      const result = await fetchByWKN('A0RPWH');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.recoverable).toBe(true);
      }
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('fetchByTicker', () => {
  it('returns validation error for invalid ticker', async () => {
    const result = await fetchByTicker('A');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.source).toBe('validation');
      expect(result.error.recoverable).toBe(false);
    }
  });

  it('returns error when Onvista fails and no CORS proxy configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    try {
      const result = await fetchByTicker('BTC');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('CORS proxy');
        expect(result.error.source).toBe('all');
      }
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
