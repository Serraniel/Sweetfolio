import type { SweetfolioExport, SweetfolioScope } from './schema';
import type { Asset, StoredSimulation } from '$lib/types';
import { CURRENT_VERSION } from './schema';
import * as assetsDb from '$lib/storage/assets';
import * as portfoliosDb from '$lib/storage/portfolios';
import * as settingsDb from '$lib/storage/settings';
import * as currenciesDb from '$lib/storage/currencies';
import * as simulationsDb from '$lib/storage/simulations';

/**
 * Strip bulky regenerable fields from assets to keep export lean.
 * rawCSV is the original CSV text stored as a cache — prices are already parsed.
 */
function stripAssetBulk(asset: Asset): Omit<Asset, 'rawCSV' | 'rawCSVStoredAt'> & { rawCSV: null; rawCSVStoredAt: null } {
  return { ...asset, rawCSV: null, rawCSVStoredAt: null };
}

/**
 * Strip scatter plot arrays from simulations.
 * These Float64Arrays can be 10K+ entries each and are re-generable by re-running
 * the simulation. We keep config + efficient frontier (the useful summary).
 */
function stripSimulationBulk(sim: StoredSimulation): StoredSimulation {
  return {
    ...sim,
    results: {
      ...sim.results,
      scatterVolatilities: new Float64Array(0),
      scatterReturns: new Float64Array(0),
      portfolioCount: sim.results.portfolioCount,
    },
  };
}

export async function buildExport(scopes: SweetfolioScope[]): Promise<SweetfolioExport> {
  const data: SweetfolioExport['data'] = {};

  if (scopes.includes('assets')) {
    const assets = await assetsDb.getAll();
    data.assets = assets.map(stripAssetBulk);
  }
  if (scopes.includes('portfolios')) data.portfolios = await portfoliosDb.getAll();
  if (scopes.includes('settings')) data.settings = await settingsDb.getAll();
  if (scopes.includes('currencies')) data.currencies = await currenciesDb.getAll();
  if (scopes.includes('simulations')) {
    const sims = await simulationsDb.getAll();
    data.simulations = sims.map(stripSimulationBulk);
  }

  return {
    format: 'sweetfolio',
    version: CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    scopes,
    data,
  };
}
