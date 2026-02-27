import type { SettingEntry } from '$lib/types';
import { getDB } from './db';

const STORE = 'settings';

export async function getAll(): Promise<Record<string, unknown>> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const entries = request.result as SettingEntry[];
      const result: Record<string, unknown> = {};
      for (const entry of entries) {
        result[entry.key] = entry.value;
      }
      resolve(result);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function get(key: string): Promise<unknown> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const request = store.get(key);
    request.onsuccess = () => {
      const entry = request.result as SettingEntry | undefined;
      resolve(entry?.value);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function set(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const request = store.put({ key, value });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function remove(key: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
