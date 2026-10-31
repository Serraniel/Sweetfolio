/** CSV price-file import workflow (AM-1, AM-3a, AM-3b). */
import type { Asset } from '#lib/domain/types.ts';
import { newAsset } from '#lib/domain/factories.ts';
import { isConfident, parsePriceCSV, type PriceParseResult } from '#lib/parsers/price-csv.ts';
import { identifierFromFilename } from '#lib/parsers/identifiers.ts';
import { onvista } from '#lib/fetchers/market-data.ts';
import { app } from './app.svelte.ts';

export interface PendingFile {
	name: string;
	text: string;
}

export async function resolveFromFilename(fileName: string) {
	const id = identifierFromFilename(fileName);
	if (!id) return null;
	try {
		return await onvista.lookupInfo(id.value, { timeoutMs: 8000 });
	} catch {
		return null;
	}
}

export function assetFromParse(result: PriceParseResult, text: string, meta: Partial<Asset> & { name: string }): Asset {
	return newAsset({ ...meta, prices: result.prices, formatConfig: result.format, rawCSV: text, rawCSVStoredAt: new Date().toISOString() });
}

/**
 * Import confident files directly (when auto-import is on) and return the
 * files that need the format dialog.
 */
export async function importPriceFiles(files: File[]): Promise<{ imported: Asset[]; pending: PendingFile[] }> {
	const imported: Asset[] = [];
	const pending: PendingFile[] = [];
	for (const file of files) {
		const text = await file.text();
		const result = parsePriceCSV(text);
		if (!app.settings.autoImportMode || !isConfident(result)) {
			pending.push({ name: file.name, text });
			continue;
		}
		let meta: Partial<Asset> & { name: string } = { name: file.name.replace(/\.[^.]+$/, '') };
		if (app.settings.autoResolveNames) {
			const info = await resolveFromFilename(file.name);
			if (info)
				meta = {
					name: info.name,
					isin: info.isin,
					wkn: info.wkn,
					currency: info.currency ?? 'EUR',
					classification: info.classification ?? 'unknown'
				};
		}
		imported.push(assetFromParse(result, text, meta));
	}
	if (imported.length) await app.saveAssets(imported);
	return { imported, pending };
}
