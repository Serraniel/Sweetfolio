import { describe, it, expect } from 'vitest';
import { generateSleeves } from './sleeves';
import type { StrategyGroupNode } from '$lib/types';

const root: StrategyGroupNode = {
  type: 'group',
  id: 'root',
  label: 'Root',
  weight: 1,
  children: [
    {
      type: 'group',
      id: 'core',
      label: 'Core',
      weight: 0.8,
      children: [
        { type: 'leaf', id: 'world', assetId: 'asset-world', weight: 0.7 },
        { type: 'leaf', id: 'em', assetId: 'asset-em', weight: 0.3 },
      ],
    },
    {
      type: 'group',
      id: 'satellite',
      label: 'Satellite',
      weight: 0.2,
      children: [
        {
          type: 'group',
          id: 'china',
          label: 'China',
          weight: 0.5,
          children: [
            {
              type: 'leaf',
              id: 'cn-gen',
              assetId: 'asset-cn-gen',
              weight: 0.6,
            },
            {
              type: 'leaf',
              id: 'cn-tech',
              assetId: 'asset-cn-tech',
              weight: 0.4,
            },
          ],
        },
        {
          type: 'group',
          id: 'crypto',
          label: 'Crypto',
          weight: 0.5,
          children: [
            { type: 'leaf', id: 'btc', assetId: 'asset-btc', weight: 0.5 },
            { type: 'leaf', id: 'eth', assetId: 'asset-eth', weight: 0.5 },
          ],
        },
      ],
    },
  ],
};

describe('generateSleeves', () => {
  describe('flat mode', () => {
    it('returns a single sleeve with all leaves flattened to absolute weights', () => {
      const sleeves = generateSleeves(root, 'flat');
      expect(sleeves).toHaveLength(1);
      expect(sleeves[0].label).toBe('Root');
      expect(sleeves[0].nodeId).toBe('root');

      const allocs = sleeves[0].allocations;
      expect(allocs).toHaveLength(6);

      const byAsset = Object.fromEntries(
        allocs.map((a) => [a.assetId, a.weight]),
      );
      expect(byAsset['asset-world']).toBeCloseTo(0.56);
      expect(byAsset['asset-em']).toBeCloseTo(0.24);
      expect(byAsset['asset-cn-gen']).toBeCloseTo(0.06);
      expect(byAsset['asset-cn-tech']).toBeCloseTo(0.04);
      expect(byAsset['asset-btc']).toBeCloseTo(0.05);
      expect(byAsset['asset-eth']).toBeCloseTo(0.05);
    });
  });

  describe('top-level mode', () => {
    it('returns one sleeve per direct child of root', () => {
      const sleeves = generateSleeves(root, 'top-level');
      expect(sleeves).toHaveLength(2);

      const core = sleeves.find((s) => s.label === 'Core')!;
      expect(core).toBeDefined();
      expect(core.nodeId).toBe('core');
      expect(core.allocations).toHaveLength(2);

      const coreByAsset = Object.fromEntries(
        core.allocations.map((a) => [a.assetId, a.weight]),
      );
      expect(coreByAsset['asset-world']).toBeCloseTo(0.7);
      expect(coreByAsset['asset-em']).toBeCloseTo(0.3);

      const satellite = sleeves.find((s) => s.label === 'Satellite')!;
      expect(satellite).toBeDefined();
      expect(satellite.nodeId).toBe('satellite');
      expect(satellite.allocations).toHaveLength(4);

      // Satellite sub-tree flattened: cn-gen = 0.5*0.6=0.3, cn-tech = 0.5*0.4=0.2, btc = 0.5*0.5=0.25, eth = 0.5*0.5=0.25
      const satByAsset = Object.fromEntries(
        satellite.allocations.map((a) => [a.assetId, a.weight]),
      );
      expect(satByAsset['asset-cn-gen']).toBeCloseTo(0.3);
      expect(satByAsset['asset-cn-tech']).toBeCloseTo(0.2);
      expect(satByAsset['asset-btc']).toBeCloseTo(0.25);
      expect(satByAsset['asset-eth']).toBeCloseTo(0.25);
    });

    it('handles a top-level leaf child as its own sleeve', () => {
      const rootWithLeaf: StrategyGroupNode = {
        type: 'group',
        id: 'root',
        label: 'Root',
        weight: 1,
        children: [
          {
            type: 'leaf',
            id: 'single',
            assetId: 'asset-single',
            weight: 1,
          },
        ],
      };
      const sleeves = generateSleeves(rootWithLeaf, 'top-level');
      expect(sleeves).toHaveLength(1);
      expect(sleeves[0].nodeId).toBe('single');
      expect(sleeves[0].allocations).toEqual([
        { assetId: 'asset-single', weight: 1 },
      ]);
    });
  });

  describe('per-branch mode', () => {
    it('returns one sleeve per terminal group (deepest groups with only leaves)', () => {
      const sleeves = generateSleeves(root, 'per-branch');
      expect(sleeves).toHaveLength(3);

      const core = sleeves.find((s) => s.label === 'Core')!;
      expect(core).toBeDefined();
      expect(core.nodeId).toBe('core');
      const coreByAsset = Object.fromEntries(
        core.allocations.map((a) => [a.assetId, a.weight]),
      );
      expect(coreByAsset['asset-world']).toBeCloseTo(0.7);
      expect(coreByAsset['asset-em']).toBeCloseTo(0.3);

      const china = sleeves.find((s) => s.label === 'China')!;
      expect(china).toBeDefined();
      expect(china.nodeId).toBe('china');
      const chinaByAsset = Object.fromEntries(
        china.allocations.map((a) => [a.assetId, a.weight]),
      );
      expect(chinaByAsset['asset-cn-gen']).toBeCloseTo(0.6);
      expect(chinaByAsset['asset-cn-tech']).toBeCloseTo(0.4);

      const crypto = sleeves.find((s) => s.label === 'Crypto')!;
      expect(crypto).toBeDefined();
      expect(crypto.nodeId).toBe('crypto');
      const cryptoByAsset = Object.fromEntries(
        crypto.allocations.map((a) => [a.assetId, a.weight]),
      );
      expect(cryptoByAsset['asset-btc']).toBeCloseTo(0.5);
      expect(cryptoByAsset['asset-eth']).toBeCloseTo(0.5);
    });
  });
});
