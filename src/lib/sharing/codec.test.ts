import { describe, it, expect } from 'vitest';
import { encodePortfolio, encodeAssetList, encodeStrategy, decodeSharePayload } from './codec';
import type { StrategyGroupNode } from '$lib/types';

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

  describe('encodeStrategy / decodeSharePayload round-trip', () => {
    const sampleRoot: StrategyGroupNode = {
      type: 'group',
      id: 'root-1',
      label: 'Root',
      weight: 1,
      children: [
        {
          type: 'group',
          id: 'g1',
          label: 'Equities',
          weight: 0.7,
          children: [
            { type: 'leaf', id: 'l1', assetId: 'asset-1', weight: 0.6 },
            { type: 'leaf', id: 'l2', assetId: 'asset-2', weight: 0.4 },
          ],
        },
        { type: 'leaf', id: 'l3', assetId: 'asset-3', weight: 0.3 },
      ],
    };

    it('encodes and decodes a strategy with nested groups', () => {
      const hash = encodeStrategy('Core-Satellite', sampleRoot);

      expect(hash).toMatch(/^#share=.+/);

      const payload = decodeSharePayload(hash);
      expect(payload).not.toBeNull();
      expect(payload?.type).toBe('strategy');
      if (payload?.type === 'strategy') {
        expect(payload.name).toBe('Core-Satellite');
        expect(payload.root.type).toBe('group');
        expect(payload.root.label).toBe('Root');
        expect(payload.root.children).toHaveLength(2);
        const equities = payload.root.children[0];
        expect(equities.type).toBe('group');
        if (equities.type === 'group') {
          expect(equities.label).toBe('Equities');
          expect(equities.children).toHaveLength(2);
        }
      }
    });

    it('handles a strategy with empty root children', () => {
      const emptyRoot: StrategyGroupNode = {
        type: 'group',
        id: 'root',
        label: 'Empty',
        weight: 1,
        children: [],
      };
      const hash = encodeStrategy('Empty Strategy', emptyRoot);
      const payload = decodeSharePayload(hash);
      expect(payload?.type).toBe('strategy');
      if (payload?.type === 'strategy') {
        expect(payload.name).toBe('Empty Strategy');
        expect(payload.root.children).toHaveLength(0);
      }
    });

    it('preserves strategy name with special characters', () => {
      const root: StrategyGroupNode = {
        type: 'group',
        id: 'r',
        label: 'Root',
        weight: 1,
        children: [],
      };
      const hash = encodeStrategy('70/30 Core & Satellite', root);
      const payload = decodeSharePayload(hash);
      expect(payload?.type).toBe('strategy');
      if (payload?.type === 'strategy') {
        expect(payload.name).toBe('70/30 Core & Satellite');
      }
    });

    it('preserves all weight values exactly', () => {
      const hash = encodeStrategy('Precise', sampleRoot);
      const payload = decodeSharePayload(hash);
      if (payload?.type === 'strategy') {
        expect(payload.root.weight).toBe(1);
        expect(payload.root.children[0].weight).toBe(0.7);
        expect(payload.root.children[1].weight).toBe(0.3);
      }
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
