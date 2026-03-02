import type { Transaction } from '$lib/types';
import { getDB } from './db';

const STORE = 'transactions';

export async function getAll(): Promise<Transaction[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getByPortfolioId(portfolioId: string): Promise<Transaction[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const request = store.index('by-portfolioId').getAll(portfolioId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getByAssetId(assetId: string): Promise<Transaction[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const request = store.index('by-assetId').getAll(assetId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function put(tx: Transaction): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const idbTx = db.transaction(STORE, 'readwrite');
    const store = idbTx.objectStore(STORE);
    const request = store.put(tx);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function remove(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function removeByPortfolioId(portfolioId: string): Promise<void> {
  const txs = await getByPortfolioId(portfolioId);
  if (txs.length === 0) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const idbTx = db.transaction(STORE, 'readwrite');
    const store = idbTx.objectStore(STORE);
    for (const t of txs) {
      store.delete(t.id);
    }
    idbTx.oncomplete = () => resolve();
    idbTx.onerror = () => reject(idbTx.error);
  });
}
