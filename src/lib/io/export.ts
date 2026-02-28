import type { SweetfolioExport, SweetfolioScope } from './schema';
import { CURRENT_VERSION } from './schema';
import * as assetsDb from '$lib/storage/assets';
import * as portfoliosDb from '$lib/storage/portfolios';
import * as settingsDb from '$lib/storage/settings';
import * as currenciesDb from '$lib/storage/currencies';
import * as simulationsDb from '$lib/storage/simulations';

export async function buildExport(scopes: SweetfolioScope[]): Promise<SweetfolioExport> {
  const data: SweetfolioExport['data'] = {};

  if (scopes.includes('assets')) data.assets = await assetsDb.getAll();
  if (scopes.includes('portfolios')) data.portfolios = await portfoliosDb.getAll();
  if (scopes.includes('settings')) data.settings = await settingsDb.getAll();
  if (scopes.includes('currencies')) data.currencies = await currenciesDb.getAll();
  if (scopes.includes('simulations')) data.simulations = await simulationsDb.getAll();

  return {
    format: 'sweetfolio',
    version: CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    scopes,
    data,
  };
}
