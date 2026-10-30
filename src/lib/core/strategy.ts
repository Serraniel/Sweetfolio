/** Strategy allocation trees and sleeve generation (ST-1 … ST-4). */
import type { Allocation, StrategyGroupNode, StrategyLeafNode, StrategyNode } from '#lib/domain/types.ts';

export function newId(): string {
	return crypto.randomUUID();
}

export function createRoot(label = 'Strategy'): StrategyGroupNode {
	return { type: 'group', id: newId(), label, weight: 1, children: [] };
}

/** Absolute leaf weights of a (sub)tree, merged per asset. The group's own weight is ignored. */
export function flattenStrategy(group: StrategyGroupNode): Allocation[] {
	const map = new Map<string, number>();
	const walk = (n: StrategyNode, w: number) => {
		const abs = n.weight * w;
		if (n.type === 'leaf') map.set(n.assetId, (map.get(n.assetId) ?? 0) + abs);
		else for (const c of n.children) walk(c, abs);
	};
	for (const c of group.children) walk(c, 1);
	return [...map.entries()].map(([assetId, weight]) => ({ assetId, weight }));
}

/** Absolute weight of every node by id (the root counts as 1). */
export function absoluteWeights(root: StrategyGroupNode): Map<string, number> {
	const out = new Map<string, number>();
	out.set(root.id, 1);
	const walk = (n: StrategyGroupNode, w: number) => {
		for (const c of n.children) {
			const abs = c.weight * w;
			out.set(c.id, abs);
			if (c.type === 'group') walk(c, abs);
		}
	};
	walk(root, 1);
	return out;
}

export function childWeightSum(group: StrategyGroupNode): number {
	return group.children.reduce((s, c) => s + c.weight, 0);
}

export function normalizeChildren<T extends StrategyNode>(children: readonly T[]): T[] {
	const total = children.reduce((s, c) => s + c.weight, 0);
	if (children.length === 0) return [];
	return children.map((c) => ({ ...c, weight: total > 0 ? c.weight / total : 1 / children.length }));
}

export function normalizeGroup(group: StrategyGroupNode, deep = false): StrategyGroupNode {
	const children = normalizeChildren(group.children).map((c) => (deep && c.type === 'group' ? normalizeGroup(c, true) : c));
	return { ...group, children };
}

export function findNode(root: StrategyNode, id: string): StrategyNode | null {
	if (root.id === id) return root;
	if (root.type === 'group') {
		for (const c of root.children) {
			const f = findNode(c, id);
			if (f) return f;
		}
	}
	return null;
}

export function updateNode(root: StrategyGroupNode, id: string, patch: (n: StrategyNode) => StrategyNode): StrategyGroupNode {
	const walk = (n: StrategyNode): StrategyNode => {
		if (n.id === id) return patch(n);
		if (n.type === 'group') return { ...n, children: n.children.map(walk) };
		return n;
	};
	return walk(root) as StrategyGroupNode;
}

export function addChild(root: StrategyGroupNode, parentId: string, child: StrategyNode): StrategyGroupNode {
	return updateNode(root, parentId, (n) => (n.type === 'group' ? { ...n, children: [...n.children, child] } : n));
}

/**
 * Remove a node; siblings are re-normalized and groups left empty are removed.
 * Returns null when the root itself becomes empty.
 */
export function removeNode(root: StrategyGroupNode, id: string): StrategyGroupNode | null {
	if (root.id === id) return null;
	const walk = (g: StrategyGroupNode): StrategyGroupNode | null => {
		let changed = false;
		const kids: StrategyNode[] = [];
		for (const c of g.children) {
			if (c.id === id) {
				changed = true;
				continue;
			}
			if (c.type === 'group') {
				const next = walk(c);
				if (next !== c) changed = true;
				if (next) kids.push(next);
			} else kids.push(c);
		}
		if (!changed) return g;
		if (kids.length === 0) return null;
		return { ...g, children: normalizeChildren(kids) };
	};
	return walk(root);
}

export function leafIdsForAsset(node: StrategyNode, assetId: string): string[] {
	if (node.type === 'leaf') return node.assetId === assetId ? [node.id] : [];
	return node.children.flatMap((c) => leafIdsForAsset(c, assetId));
}

export function removeAsset(root: StrategyGroupNode, assetId: string): StrategyGroupNode | null {
	let current: StrategyGroupNode | null = root;
	for (const id of leafIdsForAsset(root, assetId)) {
		if (!current) break;
		current = removeNode(current, id);
	}
	return current;
}

export function leafCount(node: StrategyNode): number {
	return node.type === 'leaf' ? 1 : node.children.reduce((s, c) => s + leafCount(c), 0);
}

export function maxDepth(node: StrategyNode, depth = 0): number {
	if (node.type === 'leaf' || node.children.length === 0) return depth;
	return Math.max(...node.children.map((c) => maxDepth(c, depth + 1)));
}

/** Validation issues: groups whose child weights do not sum to 100 %. */
export function unbalancedGroups(root: StrategyGroupNode): StrategyGroupNode[] {
	const out: StrategyGroupNode[] = [];
	const walk = (g: StrategyGroupNode) => {
		if (g.children.length && Math.abs(childWeightSum(g) - 1) > 1e-6) out.push(g);
		for (const c of g.children) if (c.type === 'group') walk(c);
	};
	walk(root);
	return out;
}

/** Fresh ids for every node (used when importing a shared strategy). */
export function reId<T extends StrategyNode>(node: T): T {
	if (node.type === 'leaf') return { ...node, id: newId() };
	return { ...node, id: newId(), children: node.children.map(reId) } as T;
}

export type SleeveMode = 'flat' | 'top-level' | 'per-branch';

export interface Sleeve {
	nodeId: string;
	label: string;
	allocations: Allocation[];
}

function normalizedAllocations(allocations: Allocation[]): Allocation[] {
	const total = allocations.reduce((s, a) => s + a.weight, 0);
	return allocations.filter((a) => a.weight > 0).map((a) => ({ assetId: a.assetId, weight: total > 0 ? a.weight / total : 0 }));
}

export function generateSleeves(
	root: StrategyGroupNode,
	mode: SleeveMode,
	labelForAsset: (assetId: string) => string = (id) => id
): Sleeve[] {
	if (mode === 'flat') {
		return [{ nodeId: root.id, label: root.label, allocations: normalizedAllocations(flattenStrategy(root)) }];
	}
	if (mode === 'top-level') {
		return root.children.map((c) =>
			c.type === 'leaf'
				? { nodeId: c.id, label: labelForAsset(c.assetId), allocations: [{ assetId: c.assetId, weight: 1 }] }
				: { nodeId: c.id, label: c.label, allocations: normalizedAllocations(flattenStrategy(c)) }
		);
	}
	const sleeves: Sleeve[] = [];
	const walk = (g: StrategyGroupNode, path: string[]) => {
		const leaves = g.children.filter((c): c is StrategyLeafNode => c.type === 'leaf');
		const groups = g.children.filter((c): c is StrategyGroupNode => c.type === 'group');
		if (leaves.length > 0) {
			sleeves.push({
				nodeId: g.id,
				label: path.length ? path.join(' › ') : g.label,
				allocations: normalizedAllocations(leaves.map((l) => ({ assetId: l.assetId, weight: l.weight })))
			});
		}
		for (const sub of groups) walk(sub, [...path, sub.label]);
	};
	walk(root, []);
	return sleeves;
}

export interface TreeLayoutNode {
	id: string;
	label: string;
	depth: number;
	/** Start and end as fractions of the whole (0…1). */
	start: number;
	end: number;
	weight: number;
	node: StrategyNode;
}

/** Partition layout shared by sunburst (angles) and icicle (x positions). */
export function partitionLayout(root: StrategyGroupNode, labelForAsset: (id: string) => string = (id) => id): TreeLayoutNode[] {
	const out: TreeLayoutNode[] = [];
	const walk = (g: StrategyGroupNode, start: number, span: number, depth: number) => {
		const total = childWeightSum(g) || 1;
		let cursor = start;
		for (const c of g.children) {
			const childSpan = (span * c.weight) / total;
			out.push({
				id: c.id,
				label: c.type === 'group' ? c.label : labelForAsset(c.assetId),
				depth,
				start: cursor,
				end: cursor + childSpan,
				weight: childSpan,
				node: c
			});
			if (c.type === 'group') walk(c, cursor, childSpan, depth + 1);
			cursor += childSpan;
		}
	};
	walk(root, 0, 1, 1);
	return out;
}
