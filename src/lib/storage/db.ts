/**
 * IndexedDB initialization and version management.
 * Database name: "sweetfolio"
 */

const DB_NAME = 'sweetfolio';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

export function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // assets store
      if (!db.objectStoreNames.contains('assets')) {
        const assetStore = db.createObjectStore('assets', { keyPath: 'id' });
        assetStore.createIndex('by-isin', 'isin', { unique: false });
        assetStore.createIndex('by-name', 'name', { unique: false });
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
