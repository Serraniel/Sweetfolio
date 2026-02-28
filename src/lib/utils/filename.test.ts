import { describe, it, expect } from 'vitest';
import { extractIdentifier } from './filename';

describe('extractIdentifier', () => {
  describe('ISIN extraction', () => {
    it('extracts ISIN from filename with underscore separator', () => {
      const result = extractIdentifier('DE0005140008_history.csv');
      expect(result).toEqual({ type: 'isin', value: 'DE0005140008' });
    });

    it('extracts ISIN from filename with space separator', () => {
      const result = extractIdentifier('iShares MSCI World IE00B4L5Y983.csv');
      expect(result).toEqual({ type: 'isin', value: 'IE00B4L5Y983' });
    });

    it('extracts ISIN from filename with hyphen separator', () => {
      const result = extractIdentifier('US0378331005-daily.csv');
      expect(result).toEqual({ type: 'isin', value: 'US0378331005' });
    });

    it('extracts ISIN with dot separator in name', () => {
      const result = extractIdentifier('data.IE00B3RBWM25.csv');
      expect(result).toEqual({ type: 'isin', value: 'IE00B3RBWM25' });
    });
  });

  describe('WKN extraction', () => {
    it('extracts WKN from filename', () => {
      const result = extractIdentifier('514000-daily.csv');
      expect(result).toEqual({ type: 'wkn', value: '514000' });
    });

    it('extracts WKN with underscore separator', () => {
      const result = extractIdentifier('A1JX52_prices.csv');
      expect(result).toEqual({ type: 'wkn', value: 'A1JX52' });
    });
  });

  describe('priority', () => {
    it('prefers ISIN over WKN when both could match', () => {
      // ISIN should be found first since it's more specific
      const result = extractIdentifier('DE0005140008_514000.csv');
      expect(result).toEqual({ type: 'isin', value: 'DE0005140008' });
    });
  });

  describe('no match', () => {
    it('returns null for filename without identifiers', () => {
      expect(extractIdentifier('my-portfolio.csv')).toBeNull();
    });

    it('returns null for empty filename', () => {
      expect(extractIdentifier('')).toBeNull();
    });

    it('returns null for short tokens', () => {
      expect(extractIdentifier('abc.csv')).toBeNull();
    });

    it('returns null for WKN-like token without digits', () => {
      // 6 chars all letters - no digit, so not a WKN
      expect(extractIdentifier('ABCDEF.csv')).toBeNull();
    });
  });
});
