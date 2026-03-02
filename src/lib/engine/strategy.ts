import type { StrategyGroupNode, StrategyNode } from '$lib/types';

/**
 * Flatten a strategy tree into leaf allocations with absolute weights.
 * Multiplies weights down the path from root to each leaf.
 */
export function flattenStrategy(
  node: StrategyNode,
  parentWeight = 1,
): Array<{ assetId: string; weight: number }> {
  const absWeight = node.weight * parentWeight;

  if (node.type === 'leaf') {
    return [{ assetId: node.assetId, weight: absWeight }];
  }

  return node.children.flatMap((child) => flattenStrategy(child, absWeight));
}

/**
 * Return a Map from every node ID to its absolute weight in the tree.
 */
export function computeAbsoluteWeights(
  node: StrategyNode,
  parentWeight = 1,
): Map<string, number> {
  const absWeight = node.weight * parentWeight;
  const result = new Map<string, number>();
  result.set(node.id, absWeight);

  if (node.type === 'group') {
    for (const child of node.children) {
      for (const [id, w] of computeAbsoluteWeights(child, absWeight)) {
        result.set(id, w);
      }
    }
  }

  return result;
}

/**
 * Count leaf nodes in a strategy tree.
 */
export function getLeafCount(node: StrategyNode): number {
  if (node.type === 'leaf') return 1;
  return node.children.reduce((sum, child) => sum + getLeafCount(child), 0);
}

/**
 * Get maximum depth of the tree. Root = 0, root's children = 1, etc.
 */
export function getMaxDepth(node: StrategyNode, depth = 0): number {
  if (node.type === 'leaf') return depth;
  return Math.max(...node.children.map((child) => getMaxDepth(child, depth + 1)));
}

/**
 * Normalize weights of children to sum to 1. Returns a new array (does not mutate).
 */
export function normalizeChildren(children: StrategyNode[]): StrategyNode[] {
  if (children.length === 0) return [];

  const total = children.reduce((sum, c) => sum + c.weight, 0);
  return children.map((c) => ({ ...c, weight: c.weight / total }));
}

/**
 * Remove a node by ID, renormalize siblings.
 * Returns updated root or null if root becomes empty.
 * If removing a leaf empties its parent group, recursively removes the empty group.
 */
export function removeNodeById(
  root: StrategyGroupNode,
  targetId: string,
): StrategyGroupNode | null {
  if (root.id === targetId) return null;

  return removeInGroup(root, targetId);
}

function removeInGroup(
  group: StrategyGroupNode,
  targetId: string,
): StrategyGroupNode | null {
  const filtered = group.children.filter((child) => child.id !== targetId);

  let newChildren: StrategyNode[];

  if (filtered.length !== group.children.length) {
    // Target was a direct child — it's been removed
    newChildren = filtered;
  } else {
    // Recurse into group children
    newChildren = group.children.map((child) => {
      if (child.type === 'group') {
        const updated = removeInGroup(child, targetId);
        return updated as StrategyNode; // null handled below
      }
      return child;
    });
  }

  // Remove any group children that became null (emptied) or have no children
  newChildren = newChildren.filter(
    (child) => child != null && !(child.type === 'group' && child.children.length === 0),
  );

  if (newChildren.length === 0) return null;

  return {
    ...group,
    children: normalizeChildren(newChildren),
  };
}

/**
 * Returns 'uniform' if all leaf depths are the same, 'mixed' otherwise.
 */
export function detectTreeShape(root: StrategyNode): 'uniform' | 'mixed' {
  const depths = collectLeafDepths(root, 0);
  const unique = new Set(depths);
  return unique.size <= 1 ? 'uniform' : 'mixed';
}

function collectLeafDepths(node: StrategyNode, depth: number): number[] {
  if (node.type === 'leaf') return [depth];
  return node.children.flatMap((child) => collectLeafDepths(child, depth + 1));
}
