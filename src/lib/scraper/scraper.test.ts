import { describe, it, expect } from 'vitest';
import { validateISIN, validateWKN, fetchByISIN, fetchByWKN } from './index';

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

describe('fetchByISIN', () => {
  it('returns validation error for invalid ISIN', async () => {
    const result = await fetchByISIN('invalid');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.source).toBe('validation');
      expect(result.error.recoverable).toBe(false);
    }
  });

  it('returns failure when no data sources are registered', async () => {
    const result = await fetchByISIN('US0378331005');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.source).toBe('all');
      expect(result.error.recoverable).toBe(true);
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

  it('returns failure when no data sources are registered', async () => {
    const result = await fetchByWKN('A0RPWH');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.recoverable).toBe(true);
    }
  });
});
