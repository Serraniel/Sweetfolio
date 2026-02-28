import { describe, it, expect } from 'vitest';
import type { StrategyGroupNode, StrategyLeafNode, StrategyNode } from '$lib/types';
import {
  flattenStrategy,
  computeAbsoluteWeights,
  getLeafCount,
  getMaxDepth,
  normalizeChildren,
  removeNodeById,
  detectTreeShape,
} from './strategy';

// --- Test tree factory ---
// Root
// ├── Core (0.8)
// │   ├── World (leaf, asset-world, 0.7)
// │   └── EM (leaf, asset-em, 0.3)
// └── Satellite (0.2)
//     ├── China (0.5)
//     │   ├── General (leaf, asset-cn-gen, 0.6)
//     │   └── Tech (leaf, asset-cn-tech, 0.4)
//     └── Crypto (0.5)
//         ├── BTC (leaf, asset-btc, 0.5)
//         └── ETH (leaf, asset-eth, 0.5)

function makeTestTree(): StrategyGroupNode {
  return {
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
              { type: 'leaf', id: 'cn-gen', assetId: 'asset-cn-gen', weight: 0.6 },
              { type: 'leaf', id: 'cn-tech', assetId: 'asset-cn-tech', weight: 0.4 },
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
}

function makeSingleLeafTree(): StrategyGroupNode {
  return {
    type: 'group',
    id: 'root',
    label: 'Root',
    weight: 1,
    children: [{ type: 'leaf', id: 'only', assetId: 'asset-only', weight: 1 }],
  };
}

describe('flattenStrategy', () => {
  it('flattens the test tree into leaf allocations with absolute weights', () => {
    const root = makeTestTree();
    const result = flattenStrategy(root);

    expect(result).toHaveLength(6);

    const byAsset = new Map(result.map((r) => [r.assetId, r.weight]));

    // Core: 1 * 0.8 * 0.7 = 0.56
    expect(byAsset.get('asset-world')).toBeCloseTo(0.56, 10);
    // Core: 1 * 0.8 * 0.3 = 0.24
    expect(byAsset.get('asset-em')).toBeCloseTo(0.24, 10);
    // Satellite > China > General: 1 * 0.2 * 0.5 * 0.6 = 0.06
    expect(byAsset.get('asset-cn-gen')).toBeCloseTo(0.06, 10);
    // Satellite > China > Tech: 1 * 0.2 * 0.5 * 0.4 = 0.04
    expect(byAsset.get('asset-cn-tech')).toBeCloseTo(0.04, 10);
    // Satellite > Crypto > BTC: 1 * 0.2 * 0.5 * 0.5 = 0.05
    expect(byAsset.get('asset-btc')).toBeCloseTo(0.05, 10);
    // Satellite > Crypto > ETH: 1 * 0.2 * 0.5 * 0.5 = 0.05
    expect(byAsset.get('asset-eth')).toBeCloseTo(0.05, 10);
  });

  it('weights sum to 1', () => {
    const root = makeTestTree();
    const result = flattenStrategy(root);
    const total = result.reduce((sum, r) => sum + r.weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('handles a single leaf under root', () => {
    const root = makeSingleLeafTree();
    const result = flattenStrategy(root);
    expect(result).toEqual([{ assetId: 'asset-only', weight: 1 }]);
  });

  it('applies parentWeight parameter', () => {
    const root = makeTestTree();
    const result = flattenStrategy(root, 0.5);
    const total = result.reduce((sum, r) => sum + r.weight, 0);
    expect(total).toBeCloseTo(0.5, 10);
  });
});

describe('computeAbsoluteWeights', () => {
  it('computes absolute weight for every node in the tree', () => {
    const root = makeTestTree();
    const weights = computeAbsoluteWeights(root);

    expect(weights.get('root')).toBeCloseTo(1, 10);
    expect(weights.get('core')).toBeCloseTo(0.8, 10);
    expect(weights.get('satellite')).toBeCloseTo(0.2, 10);
    expect(weights.get('world')).toBeCloseTo(0.56, 10);
    expect(weights.get('em')).toBeCloseTo(0.24, 10);
    expect(weights.get('china')).toBeCloseTo(0.1, 10);
    expect(weights.get('crypto')).toBeCloseTo(0.1, 10);
    expect(weights.get('cn-gen')).toBeCloseTo(0.06, 10);
    expect(weights.get('cn-tech')).toBeCloseTo(0.04, 10);
    expect(weights.get('btc')).toBeCloseTo(0.05, 10);
    expect(weights.get('eth')).toBeCloseTo(0.05, 10);
  });

  it('includes all 11 nodes', () => {
    const root = makeTestTree();
    const weights = computeAbsoluteWeights(root);
    expect(weights.size).toBe(11);
  });

  it('applies parentWeight parameter', () => {
    const root = makeTestTree();
    const weights = computeAbsoluteWeights(root, 0.5);
    expect(weights.get('root')).toBeCloseTo(0.5, 10);
    expect(weights.get('core')).toBeCloseTo(0.4, 10);
  });
});

describe('getLeafCount', () => {
  it('counts 6 leaves in the test tree', () => {
    expect(getLeafCount(makeTestTree())).toBe(6);
  });

  it('counts 1 leaf in a single-leaf tree', () => {
    expect(getLeafCount(makeSingleLeafTree())).toBe(1);
  });

  it('counts a bare leaf node as 1', () => {
    const leaf: StrategyLeafNode = { type: 'leaf', id: 'x', assetId: 'a', weight: 1 };
    expect(getLeafCount(leaf)).toBe(1);
  });
});

describe('getMaxDepth', () => {
  it('returns 3 for the test tree (root=0, Core/Satellite=1, China/Crypto=2, leaves=3)', () => {
    expect(getMaxDepth(makeTestTree())).toBe(3);
  });

  it('returns 1 for a single-leaf tree', () => {
    expect(getMaxDepth(makeSingleLeafTree())).toBe(1);
  });

  it('returns 0 for a bare leaf', () => {
    const leaf: StrategyLeafNode = { type: 'leaf', id: 'x', assetId: 'a', weight: 1 };
    expect(getMaxDepth(leaf)).toBe(0);
  });

  it('accepts a starting depth parameter', () => {
    const leaf: StrategyLeafNode = { type: 'leaf', id: 'x', assetId: 'a', weight: 1 };
    expect(getMaxDepth(leaf, 5)).toBe(5);
  });
});

describe('normalizeChildren', () => {
  it('normalizes weights to sum to 1', () => {
    const children: StrategyNode[] = [
      { type: 'leaf', id: 'a', assetId: 'x', weight: 3 },
      { type: 'leaf', id: 'b', assetId: 'y', weight: 7 },
    ];
    const result = normalizeChildren(children);
    expect(result[0].weight).toBeCloseTo(0.3, 10);
    expect(result[1].weight).toBeCloseTo(0.7, 10);
  });

  it('returns new array (does not mutate input)', () => {
    const children: StrategyNode[] = [
      { type: 'leaf', id: 'a', assetId: 'x', weight: 2 },
      { type: 'leaf', id: 'b', assetId: 'y', weight: 2 },
    ];
    const result = normalizeChildren(children);
    expect(result).not.toBe(children);
    expect(children[0].weight).toBe(2); // original unchanged
    expect(result[0].weight).toBeCloseTo(0.5, 10);
  });

  it('handles already-normalized children', () => {
    const children: StrategyNode[] = [
      { type: 'leaf', id: 'a', assetId: 'x', weight: 0.5 },
      { type: 'leaf', id: 'b', assetId: 'y', weight: 0.5 },
    ];
    const result = normalizeChildren(children);
    expect(result[0].weight).toBeCloseTo(0.5, 10);
    expect(result[1].weight).toBeCloseTo(0.5, 10);
  });

  it('handles a single child', () => {
    const children: StrategyNode[] = [{ type: 'leaf', id: 'a', assetId: 'x', weight: 0.3 }];
    const result = normalizeChildren(children);
    expect(result[0].weight).toBeCloseTo(1, 10);
  });

  it('returns empty array for empty input', () => {
    expect(normalizeChildren([])).toEqual([]);
  });
});

describe('removeNodeById', () => {
  it('removes a leaf and renormalizes siblings', () => {
    const root = makeTestTree();
    const updated = removeNodeById(root, 'em');

    expect(updated).not.toBeNull();
    // Core should now have only World with weight 1
    const core = updated!.children.find((c) => c.id === 'core') as StrategyGroupNode;
    expect(core.children).toHaveLength(1);
    expect(core.children[0].id).toBe('world');
    expect(core.children[0].weight).toBeCloseTo(1, 10);
  });

  it('removes a group node and renormalizes siblings', () => {
    const root = makeTestTree();
    const updated = removeNodeById(root, 'china');

    expect(updated).not.toBeNull();
    const satellite = updated!.children.find((c) => c.id === 'satellite') as StrategyGroupNode;
    expect(satellite.children).toHaveLength(1);
    expect(satellite.children[0].id).toBe('crypto');
    expect(satellite.children[0].weight).toBeCloseTo(1, 10);
  });

  it('returns null when removing the root node', () => {
    const root = makeTestTree();
    const result = removeNodeById(root, 'root');
    expect(result).toBeNull();
  });

  it('recursively removes empty parent groups', () => {
    // Create a tree where a group has only one leaf
    const root: StrategyGroupNode = {
      type: 'group',
      id: 'root',
      label: 'Root',
      weight: 1,
      children: [
        {
          type: 'group',
          id: 'g1',
          label: 'G1',
          weight: 0.5,
          children: [{ type: 'leaf', id: 'leaf1', assetId: 'a1', weight: 1 }],
        },
        { type: 'leaf', id: 'leaf2', assetId: 'a2', weight: 0.5 },
      ],
    };

    const updated = removeNodeById(root, 'leaf1');
    expect(updated).not.toBeNull();
    // g1 should be gone (was emptied), only leaf2 remains
    expect(updated!.children).toHaveLength(1);
    expect(updated!.children[0].id).toBe('leaf2');
    expect(updated!.children[0].weight).toBeCloseTo(1, 10);
  });

  it('returns null if removing the only leaf empties the root', () => {
    const root = makeSingleLeafTree();
    const result = removeNodeById(root, 'only');
    expect(result).toBeNull();
  });

  it('does not mutate the original tree', () => {
    const root = makeTestTree();
    const coreChildCount = (root.children[0] as StrategyGroupNode).children.length;
    removeNodeById(root, 'em');
    expect((root.children[0] as StrategyGroupNode).children.length).toBe(coreChildCount);
  });

  it('returns unchanged tree if target ID not found', () => {
    const root = makeTestTree();
    const updated = removeNodeById(root, 'nonexistent');
    expect(updated).not.toBeNull();
    expect(getLeafCount(updated!)).toBe(6);
  });
});

describe('detectTreeShape', () => {
  it('returns "mixed" for the test tree (leaves at depths 2 and 3)', () => {
    expect(detectTreeShape(makeTestTree())).toBe('mixed');
  });

  it('returns "uniform" when all leaves are at the same depth', () => {
    const uniform: StrategyGroupNode = {
      type: 'group',
      id: 'root',
      label: 'Root',
      weight: 1,
      children: [
        { type: 'leaf', id: 'a', assetId: 'x', weight: 0.5 },
        { type: 'leaf', id: 'b', assetId: 'y', weight: 0.5 },
      ],
    };
    expect(detectTreeShape(uniform)).toBe('uniform');
  });

  it('returns "uniform" for a single-leaf tree', () => {
    expect(detectTreeShape(makeSingleLeafTree())).toBe('uniform');
  });

  it('returns "uniform" for a bare leaf node', () => {
    const leaf: StrategyLeafNode = { type: 'leaf', id: 'x', assetId: 'a', weight: 1 };
    expect(detectTreeShape(leaf)).toBe('uniform');
  });
});
