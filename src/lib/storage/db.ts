/**
 * IndexedDB initialization and version management.
 * Database name: "sweetfolio"
 */

const DB_NAME = 'sweetfolio';
const DB_VERSION = 2;

let dbInstance: IDBDatabase | null = null;

export function getDB(): Promise<IDBDatabase> {
  if (dbInstance && dbInstance.version >= DB_VERSION) return Promise.resolve(dbInstance);

  // Close stale connection before re-opening at new version
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onblocked = () => {
      // Another tab holds an older connection — warn but keep waiting
      console.warn('IndexedDB upgrade blocked. Close other Sweetfolio tabs and reload.');
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // assets store
      if (!db.objectStoreNames.contains('assets')) {
        const assetStore = db.createObjectStore('assets', { keyPath: 'id' });
        assetStore.createIndex('by-isin', 'isin', { unique: false });
        assetStore.createIndex('by-name', 'name', { unique: false });
        assetStore.createIndex('by-classification', 'classification', { unique: false });
      }

      // portfolios store
      if (!db.objectStoreNames.contains('portfolios')) {
        const portfolioStore = db.createObjectStore('portfolios', { keyPath: 'id' });
        portfolioStore.createIndex('by-name', 'name', { unique: false });
      }

      // currencies store
      if (!db.objectStoreNames.contains('currencies')) {
        db.createObjectStore('currencies', { keyPath: 'pair' });
      }

      // settings store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      // simulations store
      if (!db.objectStoreNames.contains('simulations')) {
        db.createObjectStore('simulations', { keyPath: 'id' });
      }

      // Migration v1 → v2: add classification to existing assets
      if (event.oldVersion >= 1 && event.oldVersion < 2) {
        const tx = (event.target as IDBOpenDBRequest).transaction!;
        const store = tx.objectStore('assets');
        store.createIndex('by-classification', 'classification', { unique: false });

        // Backfill existing assets with 'unknown'
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            const asset = cursor.value;
            if (!asset.classification) {
              asset.classification = 'unknown';
              cursor.update(asset);
            }
            cursor.continue();
          }
        };
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;

      dbInstance.onclose = () => {
        dbInstance = null;
      };

      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
      };

      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export function transaction(
  storeNames: string | string[],
  mode: IDBTransactionMode = 'readonly',
): Promise<IDBTransaction> {
  return getDB().then((db) => db.transaction(storeNames, mode));
}
