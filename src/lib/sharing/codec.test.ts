import { describe, it, expect } from 'vitest';
import { encodePortfolio, encodeAssetList, decodeSharePayload } from './codec';

describe('codec', () => {
  describe('encodePortfolio / decodeSharePayload round-trip', () => {
    it('encodes and decodes a portfolio with multiple allocations', () => {
      const hash = encodePortfolio('My Portfolio', [
        { isin: 'DE0001234567', weight: 0.6 },
        { isin: 'US0378331005', weight: 0.4 },
      ]);

      expect(hash).toMatch(/^#share=.+/);

      const payload = decodeSharePayload(hash);
      expect(payload).toEqual({
        type: 'portfolio',
        name: 'My Portfolio',
        allocations: [
          { isin: 'DE0001234567', weight: 0.6 },
          { isin: 'US0378331005', weight: 0.4 },
        ],
      });
    });

    it('handles a single-asset portfolio', () => {
      const hash = encodePortfolio('Solo', [{ isin: 'IE00B4L5Y983', weight: 1 }]);
      const payload = decodeSharePayload(hash);
      expect(payload).toEqual({
        type: 'portfolio',
        name: 'Solo',
        allocations: [{ isin: 'IE00B4L5Y983', weight: 1 }],
      });
    });

    it('preserves portfolio name with special characters', () => {
      const hash = encodePortfolio('70/30 World & EM', [
        { isin: 'IE00BK5BQT80', weight: 0.7 },
        { isin: 'IE00BKM4GZ66', weight: 0.3 },
      ]);
      const payload = decodeSharePayload(hash);
      expect(payload?.type).toBe('portfolio');
      if (payload?.type === 'portfolio') {
        expect(payload.name).toBe('70/30 World & EM');
      }
    });
  });

  describe('encodeAssetList / decodeSharePayload round-trip', () => {
    it('encodes and decodes an asset list', () => {
      const isins = ['DE0001234567', 'US0378331005', 'IE00B4L5Y983'];
      const hash = encodeAssetList(isins);

      expect(hash).toMatch(/^#share=.+/);

      const payload = decodeSharePayload(hash);
      expect(payload).toEqual({ type: 'assets', isins });
    });

    it('handles a single ISIN', () => {
      const hash = encodeAssetList(['LU0290358497']);
      const payload = decodeSharePayload(hash);
      expect(payload).toEqual({ type: 'assets', isins: ['LU0290358497'] });
    });
  });

  describe('decodeSharePayload edge cases', () => {
    it('returns null for empty hash', () => {
      expect(decodeSharePayload('')).toBeNull();
    });

    it('returns null for hash without share prefix', () => {
      expect(decodeSharePayload('#section')).toBeNull();
    });

    it('returns null for invalid compressed data', () => {
      expect(decodeSharePayload('#share=!!invalid!!')).toBeNull();
    });

    it('handles hash with leading #', () => {
      const hash = encodePortfolio('Test', [{ isin: 'DE0001234567', weight: 1 }]);
      // Ensure it works both with and without #
      const withHash = decodeSharePayload(hash);
      const withoutHash = decodeSharePayload(hash.slice(1));
      expect(withHash).toEqual(withoutHash);
    });
  });
});
