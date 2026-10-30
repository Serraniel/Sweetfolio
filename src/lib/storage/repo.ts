/** Typed CRUD helpers over the object stores. Values must be plain (structured-cloneable) objects. */
import { done, openDB, req, type StoreMap, type StoreName } from './db.ts';

export async function getAll<S extends StoreName>(store: S): Promise<StoreMap[S][]> {
	const db = await openDB();
	return req(db.transaction(store).objectStore(store).getAll()) as Promise<StoreMap[S][]>;
}

export async function get<S extends StoreName>(store: S, key: string): Promise<StoreMap[S] | undefined> {
	const db = await openDB();
	return req(db.transaction(store).objectStore(store).get(key)) as Promise<StoreMap[S] | undefined>;
}

export async function put<S extends StoreName>(store: S, value: StoreMap[S]): Promise<void> {
	await putMany(store, [value]);
}

export async function putMany<S extends StoreName>(store: S, values: readonly StoreMap[S][]): Promise<void> {
	if (values.length === 0) return;
	const db = await openDB();
	const tx = db.transaction(store, 'readwrite');
	const os = tx.objectStore(store);
	for (const v of values) os.put(v);
	await done(tx);
}

export async function remove(store: StoreName, keys: string | readonly string[]): Promise<void> {
	const list = typeof keys === 'string' ? [keys] : keys;
	if (list.length === 0) return;
	const db = await openDB();
	const tx = db.transaction(store, 'readwrite');
	for (const k of list) tx.objectStore(store).delete(k);
	await done(tx);
}

/** Apply several writes atomically across stores. */
export async function batch(ops: Array<{ store: StoreName; put?: readonly unknown[]; delete?: readonly string[] }>): Promise<void> {
	const names = [...new Set(ops.map((o) => o.store))];
	if (names.length === 0) return;
	const db = await openDB();
	const tx = db.transaction(names, 'readwrite');
	for (const op of ops) {
		const os = tx.objectStore(op.store);
		for (const v of op.put ?? []) os.put(v);
		for (const k of op.delete ?? []) os.delete(k);
	}
	await done(tx);
}

export async function clearAll(): Promise<void> {
	const db = await openDB();
	const names = Array.from(db.objectStoreNames);
	const tx = db.transaction(names, 'readwrite');
	for (const n of names) tx.objectStore(n).clear();
	await done(tx);
}

export async function getSettings(): Promise<Record<string, unknown>> {
	const rows = await getAll('settings');
	return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setSettings(values: Record<string, unknown>): Promise<void> {
	await putMany(
		'settings',
		Object.entries(values).map(([key, value]) => ({ key, value }))
	);
}

/** Iterate a store one record at a time (memory-friendly export, DP-2). */
export async function forEach<S extends StoreName>(store: S, fn: (value: StoreMap[S]) => void): Promise<void> {
	const db = await openDB();
	const tx = db.transaction(store);
	await new Promise<void>((resolve, reject) => {
		const c = tx.objectStore(store).openCursor();
		c.onsuccess = () => {
			const cursor = c.result;
			if (!cursor) return resolve();
			fn(cursor.value as StoreMap[S]);
			cursor.continue();
		};
		c.onerror = () => reject(c.error);
	});
}
