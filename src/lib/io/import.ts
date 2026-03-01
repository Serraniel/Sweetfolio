import type { SweetfolioExport } from './schema';
import type { StoredSimulation } from '$lib/types';
import { isValidExportEnvelope } from './schema';
import { migrateToLatest } from './migrations';

/**
 * Restore Float64Array fields on simulation results.
 * JSON serialization converts typed arrays to regular arrays;
 * this converts them back so IndexedDB stores them correctly.
 */
function restoreTypedArrays(data: SweetfolioExport): void {
  if (!data.data.simulations) return;
  for (const sim of data.data.simulations) {
    const results = sim.results;
    if (results.scatterVolatilities && !(results.scatterVolatilities instanceof Float64Array)) {
      results.scatterVolatilities = new Float64Array(results.scatterVolatilities as unknown as number[]);
    }
    if (results.scatterReturns && !(results.scatterReturns instanceof Float64Array)) {
      results.scatterReturns = new Float64Array(results.scatterReturns as unknown as number[]);
    }
  }
}

export async function parseImportFile(file: File): Promise<SweetfolioExport> {
  const text = await file.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON: the file could not be parsed.');
  }

  if (!isValidExportEnvelope(parsed)) {
    throw new Error('This is not a valid Sweetfolio export file.');
  }

  const migrated = migrateToLatest(parsed);
  restoreTypedArrays(migrated);
  return migrated;
}
