import { describe, it, expect } from 'vitest';
import { computeSunburstArcs } from './sunburst';
import type { StrategyGroupNode } from '$lib/types';

const TAU = Math.PI * 2;

describe('computeSunburstArcs', () => {
	it('returns empty array for a root with no children', () => {
		const root: StrategyGroupNode = {
			type: 'group',
			id: 'root',
			label: 'Root',
			weight: 1,
			children: []
		};

		const arcs = computeSunburstArcs(root);
		expect(arcs).toEqual([]);
	});

	it('computes correct angles for two children at depth 1', () => {
		const root: StrategyGroupNode = {
			type: 'group',
			id: 'root',
			label: 'Root',
			weight: 1,
			children: [
				{ type: 'leaf', id: 'a', assetId: 'asset-a', weight: 0.6 },
				{ type: 'leaf', id: 'b', assetId: 'asset-b', weight: 0.4 }
			]
		};

		const arcs = computeSunburstArcs(root);

		expect(arcs).toHaveLength(2);

		// First child: 0 to 0.6 * TAU
		expect(arcs[0].id).toBe('a');
		expect(arcs[0].depth).toBe(1);
		expect(arcs[0].startAngle).toBeCloseTo(0, 10);
		expect(arcs[0].endAngle).toBeCloseTo(0.6 * TAU, 10);
		expect(arcs[0].absoluteWeight).toBeCloseTo(0.6, 10);

		// Second child: 0.6*TAU to TAU
		expect(arcs[1].id).toBe('b');
		expect(arcs[1].depth).toBe(1);
		expect(arcs[1].startAngle).toBeCloseTo(0.6 * TAU, 10);
		expect(arcs[1].endAngle).toBeCloseTo(TAU, 10);
		expect(arcs[1].absoluteWeight).toBeCloseTo(0.4, 10);
	});

	it('computes correct angular spans for nested depth-2 arcs', () => {
		const root: StrategyGroupNode = {
			type: 'group',
			id: 'root',
			label: 'Root',
			weight: 1,
			children: [
				{
					type: 'group',
					id: 'g1',
					label: 'Group 1',
					weight: 0.5,
					children: [
						{ type: 'leaf', id: 'g1a', assetId: 'a1', weight: 0.6 },
						{ type: 'leaf', id: 'g1b', assetId: 'a2', weight: 0.4 }
					]
				},
				{ type: 'leaf', id: 'l1', assetId: 'a3', weight: 0.5 }
			]
		};

		const arcs = computeSunburstArcs(root);

		// Should have 3 arcs: g1 (depth 1), g1a (depth 2), g1b (depth 2), l1 (depth 1)
		expect(arcs).toHaveLength(4);

		const g1 = arcs.find((a) => a.id === 'g1')!;
		const g1a = arcs.find((a) => a.id === 'g1a')!;
		const g1b = arcs.find((a) => a.id === 'g1b')!;
		const l1 = arcs.find((a) => a.id === 'l1')!;

		// g1 occupies first half: 0 to π
		expect(g1.depth).toBe(1);
		expect(g1.startAngle).toBeCloseTo(0, 10);
		expect(g1.endAngle).toBeCloseTo(Math.PI, 10);
		expect(g1.absoluteWeight).toBeCloseTo(0.5, 10);

		// g1a: 60% of g1's span (0 to 0.6*π)
		expect(g1a.depth).toBe(2);
		expect(g1a.startAngle).toBeCloseTo(0, 10);
		expect(g1a.endAngle).toBeCloseTo(0.6 * Math.PI, 10);
		expect(g1a.absoluteWeight).toBeCloseTo(0.3, 10);

		// g1b: 40% of g1's span (0.6*π to π)
		expect(g1b.depth).toBe(2);
		expect(g1b.startAngle).toBeCloseTo(0.6 * Math.PI, 10);
		expect(g1b.endAngle).toBeCloseTo(Math.PI, 10);
		expect(g1b.absoluteWeight).toBeCloseTo(0.2, 10);

		// l1 occupies second half: π to 2π
		expect(l1.depth).toBe(1);
		expect(l1.startAngle).toBeCloseTo(Math.PI, 10);
		expect(l1.endAngle).toBeCloseTo(TAU, 10);
		expect(l1.absoluteWeight).toBeCloseTo(0.5, 10);
	});

	it('includes correct label and node references', () => {
		const root: StrategyGroupNode = {
			type: 'group',
			id: 'root',
			label: 'Root',
			weight: 1,
			children: [
				{
					type: 'group',
					id: 'g',
					label: 'Group',
					weight: 0.7,
					children: [
						{ type: 'leaf', id: 'leaf1', assetId: 'btc', weight: 1 }
					]
				},
				{ type: 'leaf', id: 'leaf2', assetId: 'eth', weight: 0.3 }
			]
		};

		const arcs = computeSunburstArcs(root);

		const groupArc = arcs.find((a) => a.id === 'g')!;
		expect(groupArc.label).toBe('Group');
		expect(groupArc.node.type).toBe('group');

		const leafArc = arcs.find((a) => a.id === 'leaf2')!;
		expect(leafArc.label).toBe('eth');
		expect(leafArc.node.type).toBe('leaf');
	});
});
