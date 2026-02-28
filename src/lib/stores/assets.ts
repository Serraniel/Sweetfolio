import { writable } from 'svelte/store';
import type { Asset } from '$lib/types';
import * as db from '$lib/storage/assets';
import { removeAssetFromPortfolios } from '$lib/stores/portfolios';

export const assets = writable<Asset[]>([]);

export async function loadAssets(): Promise<void> {
  assets.set(await db.getAll());
}

export async function addAsset(asset: Asset): Promise<void> {
  await db.put(asset);
  assets.update((list) => [...list, asset]);
}

export async function updateAsset(asset: Asset): Promise<void> {
  await db.put(asset);
  assets.update((list) => list.map((a) => (a.id === asset.id ? asset : a)));
}

export async function removeAsset(id: string): Promise<void> {
  await db.remove(id);
  assets.update((list) => list.filter((a) => a.id !== id));
  // Cascade: remove this asset from all portfolios that reference it
  await removeAssetFromPortfolios(id);
}
