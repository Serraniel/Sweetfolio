import { get } from 'svelte/store';
import { portfolios, updatePortfolio } from '$lib/stores/portfolios';
import { registerMigration, type MigrationResult } from './runner';

registerMigration({
  id: 'strip-zero-allocations-v1',
  label: 'Removing zero-weight allocations from portfolios',
  async run(onProgress): Promise<MigrationResult> {
    const allPortfolios = get(portfolios);
    const candidates = allPortfolios.filter((p) =>
      p.allocations.some((a) => a.weight === 0),
    );

    if (candidates.length === 0) {
      return { changes: [], errors: [] };
    }

    const changes: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const portfolio = candidates[i];
      onProgress(i + 1, candidates.length, portfolio.name);

      try {
        const cleaned = portfolio.allocations.filter((a) => a.weight > 0);
        await updatePortfolio({
          ...portfolio,
          allocations: cleaned,
          updatedAt: new Date().toISOString(),
        });
        const removed = portfolio.allocations.length - cleaned.length;
        changes.push(`${portfolio.name}: removed ${removed} zero-weight allocation${removed > 1 ? 's' : ''}`);
      } catch {
        errors.push(`${portfolio.name}: unexpected error`);
      }
    }

    return { changes, errors };
  },
});
