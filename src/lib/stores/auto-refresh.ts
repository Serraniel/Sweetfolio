import { writable, get } from 'svelte/store';
import type { Asset } from '$lib/types';
import { assets, updateAsset } from './assets';
import { settings } from './settings';
import { fetchByISIN, fetchByWKN } from '$lib/scraper/index';
import { mergePrices, type PriceConflict } from '$lib/engine/price-merge';

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface RefreshProgress {
  active: boolean;
  current: number;
  total: number;
  currentAssetName: string;
  errors: Array<{ assetName: string; message: string }>;
  conflicts: Array<{ assetId: string; assetName: string; conflicts: PriceConflict[] }>;
}

export const refreshProgress = writable<RefreshProgress>({
  active: false,
  current: 0,
  total: 0,
  currentAssetName: '',
  errors: [],
  conflicts: [],
});

export function isAssetStale(asset: Asset): boolean {
  if (!asset.isin && !asset.wkn) return false;
  if (!asset.lastRefreshedAt) return true;
  const elapsed = Date.now() - new Date(asset.lastRefreshedAt).getTime();
  return elapsed > STALE_THRESHOLD_MS;
}

export function getRefreshableAssets(allAssets: Asset[]): Asset[] {
  return allAssets.filter(isAssetStale);
}

export async function autoRefreshAssets(): Promise<void> {
  const s = get(settings);
  if (s.autoRefreshAssets === false) return;

  const allAssets = get(assets);
  const stale = getRefreshableAssets(allAssets);
  if (stale.length === 0) return;

  const progress: RefreshProgress = {
    active: true,
    current: 0,
    total: stale.length,
    currentAssetName: '',
    errors: [],
    conflicts: [],
  };
  refreshProgress.set({ ...progress });

  for (const asset of stale) {
    progress.current++;
    progress.currentAssetName = asset.name;
    refreshProgress.set({ ...progress });

    try {
      const outcome = asset.isin
        ? await fetchByISIN(asset.isin)
        : asset.wkn
          ? await fetchByWKN(asset.wkn)
          : null;

      if (!outcome || !outcome.success) {
        const msg = outcome && !outcome.success ? outcome.error.message : 'No identifier available';
        progress.errors.push({ assetName: asset.name, message: msg });
        continue;
      }

      const mergeResult = mergePrices(asset.prices, outcome.data.prices);

      if (mergeResult.conflicts.length > 0) {
        progress.conflicts.push({
          assetId: asset.id,
          assetName: asset.name,
          conflicts: mergeResult.conflicts,
        });
      }

      if (mergeResult.addedCount > 0 || mergeResult.conflicts.length === 0) {
        await updateAsset({
          ...asset,
          prices: mergeResult.merged,
          updatedAt: new Date().toISOString(),
          lastRefreshedAt: new Date().toISOString(),
        });
      }
    } catch {
      progress.errors.push({ assetName: asset.name, message: 'Unexpected error during refresh' });
    }
  }

  progress.active = false;
  refreshProgress.set({ ...progress });
}

/**
 * Apply user's conflict resolution choices.
 * For each asset, replace prices on conflicting dates where the user chose "use new".
 */
export async function resolveConflicts(
  resolutions: Array<{
    assetId: string;
    resolved: Array<{ date: string; useNew: boolean; newClose: number }>;
  }>,
): Promise<void> {
  const allAssets = get(assets);

  for (const resolution of resolutions) {
    const asset = allAssets.find((a) => a.id === resolution.assetId);
    if (!asset) continue;

    const updatedPrices = asset.prices.map((p) => {
      const match = resolution.resolved.find((r) => r.date === p.date && r.useNew);
      if (match) {
        return { ...p, close: match.newClose };
      }
      return p;
    });

    await updateAsset({
      ...asset,
      prices: updatedPrices,
      updatedAt: new Date().toISOString(),
      lastRefreshedAt: new Date().toISOString(),
    });
  }

  // Clear conflicts from progress
  refreshProgress.update((p) => ({ ...p, conflicts: [] }));
}
