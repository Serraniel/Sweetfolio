import type { SweetfolioScope } from './schema';
import { CURRENT_VERSION } from './schema';
import { getDB } from '$lib/storage/db';

/** Fields to omit from assets — large caches that are regenerable. */
const ASSET_OMIT_KEYS = new Set(['rawCSV', 'rawCSVStoredAt']);

/** Fields to replace with empty arrays in simulations — large Float64Arrays. */
const SIM_SCATTER_KEYS = new Set(['scatterVolatilities', 'scatterReturns']);

/**
 * JSON replacer that strips bulky regenerable asset fields inline.
 * Avoids creating a shallow copy — the original record is never duplicated.
 */
function assetReplacer(key: string, value: unknown): unknown {
  if (ASSET_OMIT_KEYS.has(key)) return null;
  if (value instanceof Float64Array || value instanceof Float32Array) {
    return Array.from(value);
  }
  return value;
}

/**
 * JSON replacer that strips scatter Float64Arrays from simulations.
 * These are 10K+ entries each and re-generable by re-running the simulation.
 */
function simulationReplacer(key: string, value: unknown): unknown {
  if (SIM_SCATTER_KEYS.has(key)) return [];
  if (value instanceof Float64Array || value instanceof Float32Array) {
    return Array.from(value);
  }
  return value;
}

/** Default replacer for typed arrays only. */
function defaultReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Float64Array || value instanceof Float32Array) {
    return Array.from(value);
  }
  return value;
}

/** Yield to the event loop so the UI stays responsive. */
function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Iterate an IndexedDB store one record at a time via cursor.
 * Calls back with each record; previous records are GC-eligible after each step.
 */
function forEachRecord(
  db: IDBDatabase,
  storeName: string,
  callback: (record: unknown) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        callback(cursor.value);
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
 * Get all records from a small store.
 * Only for stores where total data is guaranteed small (portfolios, settings, currencies).
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

// ---------------------------------------------------------------------------
// Streaming writer abstraction
// ---------------------------------------------------------------------------

interface ExportWriter {
  write(chunk: string): Promise<void>;
  finish(): Promise<void>;
}

/**
 * Best path: File System Access API — writes directly to disk.
 * Peak memory: 1 record + its JSON string. Nothing accumulates.
 */
async function createFileWriter(filename: string): Promise<ExportWriter | null> {
  if (typeof window === 'undefined') return null;
  if (!('showSaveFilePicker' in window)) return null;

  try {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: filename,
      types: [
        {
          description: 'Sweetfolio Export',
          accept: { 'application/json': ['.json'] },
        },
      ],
    });
    const writable = await handle.createWritable();
    return {
      async write(chunk: string) {
        await writable.write(chunk);
      },
      async finish() {
        await writable.close();
      },
    };
  } catch (e: unknown) {
    // User cancelled the picker or API not available
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    return null;
  }
}

/**
 * Fallback: accumulate Blob parts.
 * Each JSON string is immediately wrapped in a Blob to move data from
 * the JS heap into native memory, keeping the heap footprint minimal.
 */
function createBlobWriter(filename: string): ExportWriter {
  const parts: BlobPart[] = [];
  return {
    async write(chunk: string) {
      // Wrap in Blob immediately — the string is copied into native memory
      // and becomes eligible for GC from the JS heap.
      parts.push(new Blob([chunk]));
    },
    async finish() {
      const blob = new Blob(parts, { type: 'application/json' });
      // Release sub-blobs — the final blob owns the data now
      parts.length = 0;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  };
}

// ---------------------------------------------------------------------------
// Core streaming export
// ---------------------------------------------------------------------------

/**
 * Stream records from a store through the writer, one at a time.
 * Each record: cursor read → JSON.stringify with replacer → write → GC eligible.
 * Yields to the event loop every 50 records to keep the UI responsive.
 */
async function streamStore(
  db: IDBDatabase,
  storeName: string,
  writer: ExportWriter,
  replacer: (key: string, value: unknown) => unknown,
): Promise<void> {
  let first = true;
  let count = 0;
  await writer.write('[');

  await forEachRecord(db, storeName, (record) => {
    if (!first) writer.write(',');
    first = false;
    writer.write(JSON.stringify(record, replacer));
    count++;
  });

  // Yield after the store is done to let GC + UI catch up
  if (count > 0) await yieldToUI();

  await writer.write(']');
}

/**
 * Export data directly from IndexedDB to a file download.
 *
 * Memory strategy:
 * 1. File System Access API (best): writes each chunk directly to disk.
 *    Peak memory = 1 record + its JSON string. Nothing accumulates.
 * 2. Blob fallback: each record's JSON is immediately wrapped in a sub-Blob,
 *    moving data from JS heap to native memory. Peak JS heap = 1 record + 1 string.
 *
 * No intermediate object copies — JSON replacer functions skip/transform
 * fields inline during serialization.
 */
export async function streamExport(
  scopes: SweetfolioScope[],
  onPhase?: (phase: string) => void,
): Promise<void> {
  const db = await getDB();
  const date = new Date().toISOString().slice(0, 10);
  const filename = `sweetfolio-export-${date}.json`;

  // Try direct-to-disk first, fall back to Blob accumulation
  onPhase?.('Preparing export...');
  const writer =
    (await createFileWriter(filename)) ?? createBlobWriter(filename);

  // Envelope header
  const envelope = JSON.stringify({
    format: 'sweetfolio',
    version: CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    scopes,
  });
  await writer.write(envelope.slice(0, -1) + ',"data":{');

  let firstScope = true;

  if (scopes.includes('assets')) {
    onPhase?.('Exporting assets...');
    if (!firstScope) await writer.write(',');
    firstScope = false;
    await writer.write('"assets":');
    await streamStore(db, 'assets', writer, assetReplacer);
  }

  if (scopes.includes('simulations')) {
    onPhase?.('Exporting simulations...');
    if (!firstScope) await writer.write(',');
    firstScope = false;
    await writer.write('"simulations":');
    await streamStore(db, 'simulations', writer, simulationReplacer);
  }

  if (scopes.includes('portfolios')) {
    onPhase?.('Exporting portfolios...');
    if (!firstScope) await writer.write(',');
    firstScope = false;
    const portfolios = await getAllSmall(db, 'portfolios');
    await writer.write('"portfolios":' + JSON.stringify(portfolios));
  }

  if (scopes.includes('settings')) {
    onPhase?.('Exporting settings...');
    if (!firstScope) await writer.write(',');
    firstScope = false;
    const entries = await getAllSmall<{ key: string; value: unknown }>(db, 'settings');
    const settingsObj: Record<string, unknown> = {};
    for (const entry of entries) settingsObj[entry.key] = entry.value;
    await writer.write('"settings":' + JSON.stringify(settingsObj));
  }

  if (scopes.includes('currencies')) {
    onPhase?.('Exporting exchange rates...');
    if (!firstScope) await writer.write(',');
    firstScope = false;
    const currencies = await getAllSmall(db, 'currencies');
    await writer.write('"currencies":' + JSON.stringify(currencies, defaultReplacer));
  }

  await writer.write('}}');
  onPhase?.('Saving file...');
  await writer.finish();
}
