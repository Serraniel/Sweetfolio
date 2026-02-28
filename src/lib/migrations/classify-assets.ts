import { get } from 'svelte/store';
import { assets, updateAsset } from '$lib/stores/assets';
import { fetchByISIN, fetchByWKN } from '$lib/scraper/index';
import { registerMigration, type MigrationResult } from './runner';

registerMigration({
  id: 'classify-assets-v1',
  label: 'Classifying assets',
  async run(onProgress): Promise<MigrationResult> {
    const allAssets = get(assets);
    const candidates = allAssets.filter(
      (a) => (a.classification === 'unknown' || !a.classification) && (a.isin || a.wkn),
    );

    if (candidates.length === 0) {
      return { changes: [], errors: [] };
    }

    const changes: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const asset = candidates[i];
      onProgress(i + 1, candidates.length, asset.name);

      try {
        const outcome = asset.isin
          ? await fetchByISIN(asset.isin)
          : asset.wkn
            ? await fetchByWKN(asset.wkn)
            : null;

        if (!outcome || !outcome.success) {
          errors.push(`${asset.name}: fetch failed`);
          continue;
        }

        const cls = outcome.data.classification;
        if (cls && cls !== 'unknown') {
          await updateAsset({
            ...asset,
            classification: cls,
            updatedAt: new Date().toISOString(),
          });
          changes.push(`${asset.name} → ${cls.toUpperCase()}`);
        }
      } catch {
        errors.push(`${asset.name}: unexpected error`);
      }
    }

    return { changes, errors };
  },
});
