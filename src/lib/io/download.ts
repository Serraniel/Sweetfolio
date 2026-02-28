import type { SweetfolioScope } from './schema';
import type { Asset, StoredSimulation } from '$lib/types';
import { CURRENT_VERSION } from './schema';
import { getDB } from '$lib/storage/db';

/**
 * Convert Float64Array/Float32Array to regular arrays for JSON.
 */
function typedArrayReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Float64Array || value instanceof Float32Array) {
    return Array.from(value);
  }
  return value;
}

/**
 * Iterate an IndexedDB store one record at a time via cursor.
 * Keeps only one record in memory at any time.
 */
function forEachRecord<T>(
  db: IDBDatabase,
  storeName: string,
  callback: (record: T) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        callback(cursor.value as T);
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get all records from a small store (portfolios, settings, currencies).
 * Only use for stores where total data is guaranteed small.
 */
function getAllSmall<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

/** Strip bulky regenerable fields from a single asset. */
function stripAsset(asset: Asset): Record<string, unknown> {
  return { ...asset, rawCSV: null, rawCSVStoredAt: null };
}

/** Strip scatter Float64Arrays from a single simulation. */
function stripSimulation(sim: StoredSimulation): Record<string, unknown> {
  return {
    ...sim,
    results: {
      ...sim.results,
      scatterVolatilities: [],
      scatterReturns: [],
      portfolioCount: sim.results.portfolioCount,
    },
  };
}

/**
 * Stream records from an IndexedDB store into Blob parts, one at a time.
 * Each record is: read via cursor → transform → JSON.stringify → push to parts.
 * Previous records are GC-eligible after each iteration.
 */
async function streamStoreToParts(
  db: IDBDatabase,
  storeName: string,
  parts: string[],
  transform?: (record: unknown) => unknown,
): Promise<void> {
  let first = true;
  parts.push('[');

  await forEachRecord(db, storeName, (record: unknown) => {
    const transformed = transform ? transform(record) : record;
    if (!first) parts.push(',');
    first = false;
    parts.push(JSON.stringify(transformed, typedArrayReplacer));
  });

  parts.push(']');
}

/**
 * Stream export data directly from IndexedDB to a downloadable Blob.
 *
 * Memory strategy:
 * - Large stores (assets, simulations) use cursor iteration — one record at a time
 * - Each record is stringified individually, then the record object is GC-eligible
 * - Small stores (portfolios, settings, currencies) use getAll() since they're tiny
 * - Peak memory ≈ largest single record + its JSON string
 */
export async function streamExport(
  scopes: SweetfolioScope[],
  onPhase?: (phase: string) => void,
): Promise<void> {
  const db = await getDB();
  const parts: string[] = [];

  // Envelope header
  const envelope = {
    format: 'sweetfolio',
    version: CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    scopes,
  };
  const envelopeJson = JSON.stringify(envelope);
  // Remove trailing } and open "data" object
  parts.push(envelopeJson.slice(0, -1) + ',"data":{');

  let firstScope = true;

  // Assets — streamed one at a time (can have huge rawCSV)
  if (scopes.includes('assets')) {
    onPhase?.('Exporting assets...');
    if (!firstScope) parts.push(',');
    firstScope = false;
    parts.push('"assets":');
    await streamStoreToParts(db, 'assets', parts, (r) => stripAsset(r as Asset));
  }

  // Simulations — streamed one at a time (Float64Arrays)
  if (scopes.includes('simulations')) {
    onPhase?.('Exporting simulations...');
    if (!firstScope) parts.push(',');
    firstScope = false;
    parts.push('"simulations":');
    await streamStoreToParts(db, 'simulations', parts, (r) => stripSimulation(r as StoredSimulation));
  }

  // Portfolios — small, getAll is fine
  if (scopes.includes('portfolios')) {
    onPhase?.('Exporting portfolios...');
    if (!firstScope) parts.push(',');
    firstScope = false;
    const portfolios = await getAllSmall(db, 'portfolios');
    parts.push('"portfolios":' + JSON.stringify(portfolios));
  }

  // Settings — small
  if (scopes.includes('settings')) {
    onPhase?.('Exporting settings...');
    if (!firstScope) parts.push(',');
    firstScope = false;
    // Settings store uses key-value pairs, reconstruct as object
    const entries = await getAllSmall<{ key: string; value: unknown }>(db, 'settings');
    const settingsObj: Record<string, unknown> = {};
    for (const entry of entries) {
      settingsObj[entry.key] = entry.value;
    }
    parts.push('"settings":' + JSON.stringify(settingsObj));
  }

  // Currencies — small
  if (scopes.includes('currencies')) {
    onPhase?.('Exporting exchange rates...');
    if (!firstScope) parts.push(',');
    firstScope = false;
    const currencies = await getAllSmall(db, 'currencies');
    parts.push('"currencies":' + JSON.stringify(currencies));
  }

  // Close data object and envelope
  parts.push('}}');

  onPhase?.('Preparing download...');
  const blob = new Blob(parts, { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);

  const a = document.createElement('a');
  a.href = url;
  a.download = `sweetfolio-export-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
