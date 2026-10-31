import { describe, expect, it } from 'vitest';
import type { StrategyGroupNode } from '#lib/domain/types.ts';
import {
	absoluteWeights,
	flattenStrategy,
	generateSleeves,
	maxDepth,
	normalizeGroup,
	partitionLayout,
	removeAsset,
	removeNode,
	unbalancedGroups
} from './strategy.ts';

const tree: StrategyGroupNode = {
	type: 'group',
	id: 'root',
	label: 'All',
	weight: 1,
	children: [
		{
			type: 'group',
			id: 'eq',
			label: 'Equity',
			weight: 0.8,
			children: [
				{ type: 'leaf', id: 'l1', assetId: 'world', weight: 0.75 },
				{ type: 'leaf', id: 'l2', assetId: 'em', weight: 0.25 }
			]
		},
		{
			type: 'group',
			id: 'safe',
			label: 'Safe',
			weight: 0.2,
			children: [{ type: 'leaf', id: 'l3', assetId: 'bonds', weight: 1 }]
		}
	]
};

describe('ST-1 strategy tree', () => {
	it('flattens to absolute weights', () => {
		const f = Object.fromEntries(flattenStrategy(tree).map((a) => [a.assetId, a.weight]));
		expect(f.world).toBeCloseTo(0.6);
		expect(f.em).toBeCloseTo(0.2);
		expect(f.bonds).toBeCloseTo(0.2);
		expect(absoluteWeights(tree).get('l2')).toBeCloseTo(0.2);
		expect(maxDepth(tree)).toBe(2);
	});
	it('removes nodes, re-normalizes siblings and drops empty groups', () => {
		const r = removeNode(tree, 'l2')!;
		expect(flattenStrategy(r).find((a) => a.assetId === 'world')!.weight).toBeCloseTo(0.8);
		const r2 = removeAsset(tree, 'bonds')!;
		expect(r2.children).toHaveLength(1);
		expect(r2.children[0]!.weight).toBeCloseTo(1);
		expect(removeNode(tree, 'root')).toBeNull();
	});
	it('normalizes groups and detects unbalanced groups', () => {
		const bad: StrategyGroupNode = {
			...tree,
			children: [
				{ ...tree.children[0]!, weight: 2 },
				{ ...tree.children[1]!, weight: 2 }
			]
		};
		expect(unbalancedGroups(bad).map((g) => g.id)).toEqual(['root']);
		expect(unbalancedGroups(normalizeGroup(bad))).toEqual([]);
	});
});

describe('ST-4 sleeves', () => {
	it('flat', () => {
		const s = generateSleeves(tree, 'flat');
		expect(s).toHaveLength(1);
		expect(s[0]!.allocations.reduce((a, b) => a + b.weight, 0)).toBeCloseTo(1);
	});
	it('top-level normalizes each sleeve', () => {
		const s = generateSleeves(tree, 'top-level');
		expect(s.map((x) => x.label)).toEqual(['Equity', 'Safe']);
		expect(s[0]!.allocations.find((a) => a.assetId === 'world')!.weight).toBeCloseTo(0.75);
	});
	it('per-branch creates one sleeve per group with leaves', () => {
		expect(generateSleeves(tree, 'per-branch').map((x) => x.label)).toEqual(['Equity', 'Safe']);
	});
});

describe('ST-3 layout', () => {
	it('partitions the unit interval', () => {
		const l = partitionLayout(tree);
		const depth1 = l.filter((n) => n.depth === 1);
		expect(depth1.at(-1)!.end).toBeCloseTo(1);
		expect(l.find((n) => n.id === 'l2')!.weight).toBeCloseTo(0.2);
	});
});
