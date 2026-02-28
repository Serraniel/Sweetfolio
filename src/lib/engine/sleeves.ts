import type {
  StrategyGroupNode,
  StrategyLeafNode,
  StrategyNode,
} from '$lib/types';
import { flattenStrategy } from './strategy';

export type SleeveMode = 'top-level' | 'per-branch' | 'flat';

export interface Sleeve {
  label: string;
  nodeId: string;
  allocations: Array<{ assetId: string; weight: number }>;
}

export function generateSleeves(
  root: StrategyGroupNode,
  mode: SleeveMode,
): Sleeve[] {
  switch (mode) {
    case 'flat':
      return generateFlat(root);
    case 'top-level':
      return generateTopLevel(root);
    case 'per-branch':
      return generatePerBranch(root);
  }
}

function generateFlat(root: StrategyGroupNode): Sleeve[] {
  return [
    {
      label: root.label,
      nodeId: root.id,
      allocations: flattenStrategy(root),
    },
  ];
}

function flattenSubtree(
  group: StrategyGroupNode,
): Array<{ assetId: string; weight: number }> {
  // Flatten a group's children relative to the group itself (ignoring the group's own weight).
  return group.children.flatMap((child) => flattenStrategy(child));
}

function generateTopLevel(root: StrategyGroupNode): Sleeve[] {
  return root.children.map((child) => {
    if (child.type === 'leaf') {
      return leafToSleeve(child);
    }
    return {
      label: child.label,
      nodeId: child.id,
      allocations: flattenSubtree(child),
    };
  });
}

function leafToSleeve(leaf: StrategyLeafNode): Sleeve {
  return {
    label: leaf.assetId,
    nodeId: leaf.id,
    allocations: [{ assetId: leaf.assetId, weight: leaf.weight }],
  };
}

/**
 * Find the deepest group nodes that contain ONLY leaves (no nested groups).
 * Each such terminal group becomes a sleeve with its leaves' direct weights.
 */
function generatePerBranch(root: StrategyGroupNode): Sleeve[] {
  const sleeves: Sleeve[] = [];
  collectTerminalGroups(root, sleeves);
  return sleeves;
}

function isTerminalGroup(node: StrategyGroupNode): boolean {
  return node.children.every((child) => child.type === 'leaf');
}

function collectTerminalGroups(
  node: StrategyNode,
  result: Sleeve[],
): void {
  if (node.type === 'leaf') return;

  if (isTerminalGroup(node)) {
    result.push({
      label: node.label,
      nodeId: node.id,
      allocations: node.children.map((child) => ({
        assetId: (child as StrategyLeafNode).assetId,
        weight: child.weight,
      })),
    });
    return;
  }

  for (const child of node.children) {
    collectTerminalGroups(child, result);
  }
}
