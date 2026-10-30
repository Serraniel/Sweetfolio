/**
 * Memory-friendly backup export (DP-2): records are serialized one at a time
 * into string chunks; raw CSV and simulation scatter data are stripped.
 */
import type { Asset } from '#lib/domain/types.ts';
import { forEach, getSettings } from '#lib/storage/repo.ts';
import { CURRENT_VERSION, PRIVATE_SETTINGS, type Scope } from './schema.ts';

function leanAsset(a: Asset): Asset {
	return { ...a, rawCSV: null, rawCSVStoredAt: null };
}

/** Produce the backup JSON as a sequence of chunks. */
export async function* backupChunks(scopes: readonly Scope[]): AsyncGenerator<string> {
	yield `{"format":"sweetfolio","version":${CURRENT_VERSION},"exportedAt":${JSON.stringify(new Date().toISOString())},"scopes":${JSON.stringify(scopes)},"data":{`;
	let firstScope = true;
	for (const scope of scopes) {
		yield `${firstScope ? '' : ','}${JSON.stringify(scope)}:`;
		firstScope = false;
		if (scope === 'settings') {
			const s = await getSettings();
			for (const k of PRIVATE_SETTINGS) delete s[k];
			yield JSON.stringify(s);
			continue;
		}
		const parts: string[] = [];
		await forEach(scope, (value) => {
			if (scope === 'assets') parts.push(JSON.stringify(leanAsset(value as Asset)));
			else if (scope === 'simulations') {
				const v = value as { results?: unknown };
				parts.push(JSON.stringify({ ...v, results: null }));
			} else parts.push(JSON.stringify(value));
		});
		yield '[';
		for (let i = 0; i < parts.length; i++) yield (i ? ',' : '') + parts[i];
		yield ']';
	}
	yield '}}';
}

export async function backupBlob(scopes: readonly Scope[]): Promise<Blob> {
	const parts: string[] = [];
	for await (const chunk of backupChunks(scopes)) parts.push(chunk);
	return new Blob(parts, { type: 'application/json' });
}
