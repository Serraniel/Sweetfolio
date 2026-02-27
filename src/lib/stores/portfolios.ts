import { writable } from 'svelte/store';
import type { Portfolio } from '$lib/types';
import * as db from '$lib/storage/portfolios';

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
}
