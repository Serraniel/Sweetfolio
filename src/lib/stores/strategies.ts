import { writable, get } from 'svelte/store';
import type { Strategy, StrategyNode } from '$lib/types';
import * as db from '$lib/storage/strategies';
import { removeNodeById } from '$lib/engine/strategy';
import { unlinkPortfoliosFromStrategy } from './portfolios';

export const strategies = writable<Strategy[]>([]);

export async function loadStrategies(): Promise<void> {
  strategies.set(await db.getAll());
}

export async function addStrategy(strategy: Strategy): Promise<void> {
  await db.put(strategy);
  strategies.update((list) => [...list, strategy]);
}

export async function updateStrategy(strategy: Strategy): Promise<void> {
  await db.put(strategy);
  strategies.update((list) => list.map((s) => (s.id === strategy.id ? strategy : s)));
}

export async function removeStrategy(id: string): Promise<void> {
  const current = get(strategies);
  const strategy = current.find((s) => s.id === id);
  if (strategy) {
    // Unlink generated portfolios (clear their sourceStrategyId)
    await unlinkPortfoliosFromStrategy(strategy.generatedPortfolioIds);
  }
  await db.remove(id);
  strategies.update((list) => list.filter((s) => s.id !== id));
}

/**
 * Remove an asset from all strategies that reference it as a leaf.
 * If removing the leaf empties the root, delete the entire strategy.
 */
export async function removeAssetFromStrategies(assetId: string): Promise<void> {
  const current = get(strategies);
  for (const strategy of current) {
    const leafIds = findLeafIdsByAssetId(strategy.root, assetId);
    if (leafIds.length === 0) continue;

    let newRoot = strategy.root;
    let deleted = false;
    for (const leafId of leafIds) {
      const result = removeNodeById(newRoot, leafId);
      if (result === null) {
        await db.remove(strategy.id);
        strategies.update((list) => list.filter((s) => s.id !== strategy.id));
        deleted = true;
        break;
      }
      newRoot = result;
    }
    if (!deleted) {
      const updated: Strategy = {
        ...strategy,
        root: newRoot,
        updatedAt: new Date().toISOString(),
      };
      await db.put(updated);
      strategies.update((list) => list.map((s) => (s.id === strategy.id ? updated : s)));
    }
  }
}

/**
 * Remove a portfolio ID from any strategy's generatedPortfolioIds.
 */
export async function removePortfolioFromStrategies(portfolioId: string): Promise<void> {
  const current = get(strategies);
  for (const strategy of current) {
    if (strategy.generatedPortfolioIds.includes(portfolioId)) {
      const updated: Strategy = {
        ...strategy,
        generatedPortfolioIds: strategy.generatedPortfolioIds.filter((id) => id !== portfolioId),
      };
      await db.put(updated);
      strategies.update((list) => list.map((s) => (s.id === strategy.id ? updated : s)));
    }
  }
}

function findLeafIdsByAssetId(node: StrategyNode, assetId: string): string[] {
  if (node.type === 'leaf') {
    return node.assetId === assetId ? [node.id] : [];
  }
  return node.children.flatMap((c) => findLeafIdsByAssetId(c, assetId));
}
