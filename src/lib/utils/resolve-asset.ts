/**
 * Resolve asset metadata (name, ISIN, WKN, currency) from an identifier
 * extracted from a filename, using the Onvista search API.
 */

import { searchInstrument, getSnapshot } from '$lib/fetchers/onvista';
import { extractIdentifier } from './filename';

export interface ResolvedAssetInfo {
	name: string;
	isin: string | null;
	wkn: string | null;
	currency: string | null;
}

/**
 * Try to resolve asset metadata from a filename.
 * Extracts ISIN/WKN from the filename, then looks it up via Onvista.
 * Returns null if no identifier is found or if the lookup fails.
 */
export async function resolveAssetFromFilename(
	filename: string
): Promise<ResolvedAssetInfo | null> {
	const identifier = extractIdentifier(filename);
	if (!identifier) return null;

	try {
		const instrument = await searchInstrument(identifier.value);
		if (!instrument) return null;

		// Get snapshot for richer metadata (currency, WKN)
		try {
			const snapshot = await getSnapshot(instrument.entityType, instrument.isin);
			return {
				name: snapshot.name ?? instrument.name,
				isin: snapshot.isin ?? instrument.isin ?? null,
				wkn: snapshot.wkn ?? null,
				currency: snapshot.isoCurrency ?? null
			};
		} catch {
			// Snapshot failed, use search result data
			return {
				name: instrument.name,
				isin: instrument.isin ?? null,
				wkn: null,
				currency: null
			};
		}
	} catch {
		return null;
	}
}
