import type { StrategyGroupNode, StrategyNode } from '$lib/types';

export interface IcicleRect {
	id: string;
	label: string;
	depth: number;
	x: number;
	width: number;
	absoluteWeight: number;
	node: StrategyNode;
}

/**
 * Compute a flat list of rectangles for an icicle chart layout.
 *
 * The root node (depth 0) is NOT included in the output.
 * Children at depth 1 split the full `totalWidth`.
 * Each child's width = parent's width * child.weight.
 * Children are placed sequentially with no gaps.
 */
export function computeIcicleLayout(
	root: StrategyGroupNode,
	totalWidth: number
): IcicleRect[] {
	const rects: IcicleRect[] = [];

	function walk(node: StrategyGroupNode, x: number, width: number, depth: number): void {
		let cursor = x;
		for (const child of node.children) {
			const childWidth = width * child.weight;
			const label = child.type === 'group' ? child.label : child.id;
			rects.push({
				id: child.id,
				label,
				depth,
				x: cursor,
				width: childWidth,
				absoluteWeight: childWidth / totalWidth,
				node: child
			});
			if (child.type === 'group') {
				walk(child, cursor, childWidth, depth + 1);
			}
			cursor += childWidth;
		}
	}

	walk(root, 0, totalWidth, 1);
	return rects;
}
