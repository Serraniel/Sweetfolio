import { writable } from 'svelte/store';
import * as db from '$lib/storage/settings';

export const settings = writable<Record<string, unknown>>({});

export async function loadSettings(): Promise<void> {
  settings.set(await db.getAll());
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.set(key, value);
  settings.update((s) => ({ ...s, [key]: value }));
}

export async function removeSetting(key: string): Promise<void> {
  await db.remove(key);
  settings.update((s) => {
    const updated = { ...s };
    delete updated[key];
    return updated;
  });
}
