import { describe, it, expect } from 'vitest';
import { computeIcicleLayout } from './icicle';
import type { StrategyGroupNode } from '$lib/types';

describe('computeIcicleLayout', () => {
	it('splits two children at depth 1 proportionally', () => {
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

		const rects = computeIcicleLayout(root, 1000);

		expect(rects).toHaveLength(2);

		const a = rects.find((r) => r.id === 'a')!;
		const b = rects.find((r) => r.id === 'b')!;

		expect(a.depth).toBe(1);
		expect(b.depth).toBe(1);

		expect(a.x).toBeCloseTo(0);
		expect(a.width).toBeCloseTo(600);

		expect(b.x).toBeCloseTo(600);
		expect(b.width).toBeCloseTo(400);
	});

	it('computes correct positions for nested tree at depth 2', () => {
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
						{ type: 'leaf', id: 'c1', assetId: 'asset-c1', weight: 0.6 },
						{ type: 'leaf', id: 'c2', assetId: 'asset-c2', weight: 0.4 }
					]
				},
				{ type: 'leaf', id: 'l1', assetId: 'asset-l1', weight: 0.5 }
			]
		};

		const rects = computeIcicleLayout(root, 1000);

		// depth 1: g1 (width 500, x 0), l1 (width 500, x 500)
		const g1 = rects.find((r) => r.id === 'g1')!;
		const l1 = rects.find((r) => r.id === 'l1')!;

		expect(g1.x).toBeCloseTo(0);
		expect(g1.width).toBeCloseTo(500);
		expect(g1.depth).toBe(1);

		expect(l1.x).toBeCloseTo(500);
		expect(l1.width).toBeCloseTo(500);
		expect(l1.depth).toBe(1);

		// depth 2: c1 (60% of 500 = 300, x 0), c2 (40% of 500 = 200, x 300)
		const c1 = rects.find((r) => r.id === 'c1')!;
		const c2 = rects.find((r) => r.id === 'c2')!;

		expect(c1.depth).toBe(2);
		expect(c1.x).toBeCloseTo(0);
		expect(c1.width).toBeCloseTo(300);

		expect(c2.depth).toBe(2);
		expect(c2.x).toBeCloseTo(300);
		expect(c2.width).toBeCloseTo(200);
	});

	it('returns empty array for root with no children', () => {
		const root: StrategyGroupNode = {
			type: 'group',
			id: 'root',
			label: 'Root',
			weight: 1,
			children: []
		};

		const rects = computeIcicleLayout(root, 1000);
		expect(rects).toEqual([]);
	});
});
