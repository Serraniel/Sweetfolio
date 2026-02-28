import type { StrategyNode } from '$lib/types';

export function flattenStrategy(
  node: StrategyNode,
  parentWeight = 1,
): Array<{ assetId: string; weight: number }> {
  const absWeight = parentWeight * node.weight;
  if (node.type === 'leaf') {
    return [{ assetId: node.assetId, weight: absWeight }];
  }
  return node.children.flatMap((child) => flattenStrategy(child, absWeight));
}
