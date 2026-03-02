import type { StrategyGroupNode, StrategyNode } from '$lib/types';

const TAU = Math.PI * 2;

export interface SunburstArc {
	id: string;
	label: string;
	depth: number;
	startAngle: number;
	endAngle: number;
	absoluteWeight: number;
	node: StrategyNode;
}

function getLabel(node: StrategyNode): string {
	return node.type === 'group' ? node.label : node.assetId;
}

function walk(
	children: StrategyNode[],
	depth: number,
	parentStart: number,
	parentSpan: number,
	out: SunburstArc[]
): void {
	let cursor = parentStart;

	for (const child of children) {
		const childSpan = parentSpan * child.weight;

		out.push({
			id: child.id,
			label: getLabel(child),
			depth,
			startAngle: cursor,
			endAngle: cursor + childSpan,
			absoluteWeight: childSpan / TAU,
			node: child
		});

		if (child.type === 'group' && child.children.length > 0) {
			walk(child.children, depth + 1, cursor, childSpan, out);
		}

		cursor += childSpan;
	}
}

export function computeSunburstArcs(root: StrategyGroupNode): SunburstArc[] {
	if (root.children.length === 0) return [];

	const arcs: SunburstArc[] = [];
	walk(root.children, 1, 0, TAU, arcs);
	return arcs;
}
