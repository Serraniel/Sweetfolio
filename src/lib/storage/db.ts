/**
 * IndexedDB access (DP-1). Database `sweetfolio`, schema v6.
 * Upgrades are additive and idempotent: missing stores/indexes are created and
 * records from older versions are back-filled.
 *   v1 → classification on assets (v0.5)
 *   v2 → (v0.5.x current)
 *   v3/v4 → strategies, transactions, portfolio mode fields (epic branch)
 *   v5 → rewrite; normalizes all of the above
 *   v6 → crisisData (index histories for the crisis tester; not part of backups)
 */
import type { Asset, CurrencyRate, Portfolio, Strategy, StoredSimulation, Transaction } from '#lib/domain/types.ts';
import type { ProxyIndexData } from '#lib/core/proxies.ts';

export const DB_NAME = 'sweetfolio';
export const DB_VERSION = 6;

export interface StoreMap {
	assets: Asset;
	portfolios: Portfolio;
	strategies: Strategy;
	transactions: Transaction;
	currencies: CurrencyRate;
	settings: { key: string; value: unknown };
	simulations: StoredSimulation;
	crisisData: ProxyIndexData;
}
export type StoreName = keyof StoreMap;
export const STORE_NAMES: StoreName[] = [
	'assets',
	'portfolios',
	'strategies',
	'transactions',
	'currencies',
	'settings',
	'simulations',
	'crisisData'
];

const SCHEMA: Record<StoreName, { keyPath: string; indexes: Array<[string, string]> }> = {
	assets: {
		keyPath: 'id',
		indexes: [
			['by-isin', 'isin'],
			['by-name', 'name'],
			['by-classification', 'classification']
		]
	},
	portfolios: { keyPath: 'id', indexes: [['by-name', 'name']] },
	strategies: { keyPath: 'id', indexes: [['by-name', 'name']] },
	transactions: {
		keyPath: 'id',
		indexes: [
			['by-portfolioId', 'portfolioId'],
			['by-date', 'date'],
			['by-assetId', 'assetId']
		]
	},
	currencies: { keyPath: 'pair', indexes: [] },
	settings: { keyPath: 'key', indexes: [] },
	simulations: { keyPath: 'id', indexes: [] },
	crisisData: { keyPath: 'key', indexes: [] }
};

export function req<T>(r: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error);
	});
}

export function done(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
	});
}

function backfill(store: IDBObjectStore, patch: (value: Record<string, unknown>) => boolean): void {
	const cursorReq = store.openCursor();
	cursorReq.onsuccess = () => {
		const cursor = cursorReq.result;
		if (!cursor) return;
		const value = cursor.value as Record<string, unknown>;
		if (patch(value)) cursor.update(value);
		cursor.continue();
	};
}

function upgrade(db: IDBDatabase, tx: IDBTransaction, oldVersion: number): void {
	for (const name of STORE_NAMES) {
		const def = SCHEMA[name];
		const store = db.objectStoreNames.contains(name) ? tx.objectStore(name) : db.createObjectStore(name, { keyPath: def.keyPath });
		for (const [idx, key] of def.indexes) if (!store.indexNames.contains(idx)) store.createIndex(idx, key, { unique: false });
	}
	if (oldVersion > 0 && oldVersion < 5) {
		backfill(tx.objectStore('assets'), (a) => {
			if (a.classification) return false;
			a.classification = 'unknown';
			return true;
		});
		backfill(tx.objectStore('portfolios'), (p) => {
			if (p.mode) return false;
			p.mode = 'model';
			p.trackCash = false;
			p.cashCurrency = 'EUR';
			p.sourceStrategyId = p.sourceStrategyId ?? null;
			return true;
		});
	}
}

export interface OpenOptions {
	/** Called when another tab upgrades the database; this connection is closed. */
	onVersionChange?: () => void;
	onBlocked?: () => void;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(options: OpenOptions = {}): Promise<IDBDatabase> {
	if (dbPromise) return dbPromise;
	dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = (e) => upgrade(request.result, request.transaction!, e.oldVersion);
		request.onblocked = () => options.onBlocked?.();
		request.onerror = () => {
			dbPromise = null;
			reject(request.error);
		};
		request.onsuccess = () => {
			const db = request.result;
			db.onversionchange = () => {
				db.close();
				dbPromise = null;
				options.onVersionChange?.();
			};
			db.onclose = () => {
				dbPromise = null;
			};
			resolve(db);
		};
	});
	return dbPromise;
}

/** Close and forget the cached connection (tests, clear-all). */
export async function closeDB(): Promise<void> {
	if (!dbPromise) return;
	const db = await dbPromise.catch(() => null);
	db?.close();
	dbPromise = null;
}

export async function deleteDatabase(): Promise<void> {
	await closeDB();
	await req(indexedDB.deleteDatabase(DB_NAME) as unknown as IDBRequest<unknown>);
}
