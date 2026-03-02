import { writable, get } from 'svelte/store';
import type { Portfolio } from '$lib/types';
import * as db from '$lib/storage/portfolios';
import { removePortfolioFromStrategies } from './strategies';
import { removeTransactionsByPortfolio } from './transactions';

export const portfolios = writable<Portfolio[]>([]);

export async function loadPortfolios(): Promise<void> {
  portfolios.set(await db.getAll());
}

export async function addPortfolio(portfolio: Portfolio): Promise<void> {
  await db.put(portfolio);
  portfolios.update((list) => [...list, portfolio]);
}

export async function updatePortfolio(portfolio: Portfolio): Promise<void> {
  await db.put(portfolio);
  portfolios.update((list) => list.map((p) => (p.id === portfolio.id ? portfolio : p)));
}

export async function removePortfolio(id: string): Promise<void> {
  await db.remove(id);
  portfolios.update((list) => list.filter((p) => p.id !== id));
  // Unlink from any strategy's generatedPortfolioIds
  await removePortfolioFromStrategies(id);
  await removeTransactionsByPortfolio(id);
}

export async function unlinkPortfoliosFromStrategy(portfolioIds: string[]): Promise<void> {
  const current = get(portfolios);
  for (const pid of portfolioIds) {
    const portfolio = current.find((p) => p.id === pid);
    if (portfolio && portfolio.sourceStrategyId) {
      const updated = { ...portfolio, sourceStrategyId: null, updatedAt: new Date().toISOString() };
      await db.put(updated);
      portfolios.update((list) => list.map((p) => (p.id === pid ? updated : p)));
    }
  }
}

/**
 * Remove an asset from all portfolios that reference it.
 * If a portfolio has no remaining allocations after removal, delete it entirely.
 */
export async function removeAssetFromPortfolios(assetId: string): Promise<void> {
  const current = get(portfolios);
  for (const portfolio of current) {
    const hasAsset = portfolio.allocations.some((a) => a.assetId === assetId);
    if (!hasAsset) continue;

    const remaining = portfolio.allocations.filter((a) => a.assetId !== assetId);
    if (remaining.length === 0) {
      // No allocations left — delete the portfolio
      await db.remove(portfolio.id);
      portfolios.update((list) => list.filter((p) => p.id !== portfolio.id));
    } else {
      // Re-normalize remaining weights
      const totalWeight = remaining.reduce((sum, a) => sum + a.weight, 0);
      const normalized = remaining.map((a) => ({
        ...a,
        weight: totalWeight > 0 ? a.weight / totalWeight : 1 / remaining.length,
      }));
      const updated: Portfolio = {
        ...portfolio,
        allocations: normalized,
        updatedAt: new Date().toISOString(),
      };
      await db.put(updated);
      portfolios.update((list) => list.map((p) => (p.id === portfolio.id ? updated : p)));
    }
  }
}
