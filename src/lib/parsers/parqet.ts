/**
 * Parqet CSV import parser.
 *
 * Parqet is a German portfolio tracker. Its CSV export uses semicolons as
 * delimiters, commas as decimal separators, and German column headers.
 *
 * Expected columns:
 *   Datum;Typ;Wertpapier;ISIN;Stück;Kurs;Währung;Betrag;Gebühren;Steuern;Notiz
 */

import { CURRENT_VERSION, type SweetfolioExport } from '$lib/io/schema';
import type { Asset, Transaction } from '$lib/types';
import { parseCSVRows } from './csv';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ParqetImportResult {
	assets: Array<{
		id: string;
		name: string;
		isin: string | null;
		currency: string;
	}>;
	transactions: Array<{
		id: string;
		assetId: string;
		type: 'buy' | 'sell' | 'dividend';
		date: string; // ISO format YYYY-MM-DD
		quantity: number | null;
		price: number | null;
		fee: number;
		amount: number | null;
		withholdingTax: number;
		currency: string;
		notes: string;
	}>;
	warnings: string[];
}

// ---------------------------------------------------------------------------
// Column indices (based on the expected Parqet header order)
// ---------------------------------------------------------------------------

const EXPECTED_HEADERS = [
	'datum',
	'typ',
	'wertpapier',
	'isin',
	'stück',
	'kurs',
	'währung',
	'betrag',
	'gebühren',
	'steuern',
	'notiz',
];

interface ColMap {
	datum: number;
	typ: number;
	wertpapier: number;
	isin: number;
	stueck: number;
	kurs: number;
	waehrung: number;
	betrag: number;
	gebuehren: number;
	steuern: number;
	notiz: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a German-formatted number string. Returns null for empty/invalid. */
export function parseGermanNumber(value: string): number | null {
	const v = value.trim();
	if (!v) return null;
	// Remove thousands separator (dots), then replace decimal comma with dot.
	const normalized = v.replace(/\./g, '').replace(',', '.');
	const n = parseFloat(normalized);
	return isNaN(n) ? null : n;
}

/** Parse DD.MM.YYYY into ISO YYYY-MM-DD. Returns null on failure. */
export function parseGermanDate(value: string): string | null {
	const v = value.trim();
	const m = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
	if (!m) return null;
	const day = parseInt(m[1], 10);
	const month = parseInt(m[2], 10);
	const year = parseInt(m[3], 10);
	if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const TYPE_MAP: Record<string, 'buy' | 'sell' | 'dividend' | 'transfer-in' | 'transfer-out'> = {
	kauf: 'buy',
	verkauf: 'sell',
	dividende: 'dividend',
	einlieferung: 'transfer-in',
	auslieferung: 'transfer-out',
};

/** Simple UUID v4 generator (good enough for import IDs). */
function uuid(): string {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseParqetCSV(csvString: string): ParqetImportResult {
	const warnings: string[] = [];
	const rows = parseCSVRows(csvString, ';');

	if (rows.length === 0) {
		return { assets: [], transactions: [], warnings: ['CSV is empty'] };
	}

	// Resolve column mapping from header row.
	const colMap = resolveColumns(rows[0], warnings);
	if (!colMap) {
		return { assets: [], transactions: [], warnings };
	}

	// Track unique assets by ISIN (or by name if ISIN is missing).
	const assetByKey = new Map<string, ParqetImportResult['assets'][0]>();
	const transactions: ParqetImportResult['transactions'] = [];

	for (let i = 1; i < rows.length; i++) {
		const row = rows[i];
		// Skip empty / malformed rows.
		if (row.length <= 1 && (row[0] ?? '').trim() === '') continue;

		// --- Date ---
		const dateRaw = row[colMap.datum] ?? '';
		const date = parseGermanDate(dateRaw);
		if (!date) {
			warnings.push(`Row ${i + 1}: could not parse date "${dateRaw}"`);
			continue;
		}

		// --- Transaction type ---
		const typRaw = (row[colMap.typ] ?? '').trim().toLowerCase();
		const mappedType = TYPE_MAP[typRaw];
		if (!mappedType) {
			warnings.push(`Row ${i + 1}: unknown transaction type "${row[colMap.typ]?.trim()}"`);
			continue;
		}

		// --- Asset ---
		const name = (row[colMap.wertpapier] ?? '').trim();
		const isin = (row[colMap.isin] ?? '').trim() || null;
		const currency = (row[colMap.waehrung] ?? '').trim() || 'EUR';

		const assetKey = isin ?? `name:${name}`;
		if (!assetByKey.has(assetKey)) {
			assetByKey.set(assetKey, { id: uuid(), name, isin, currency });
		}
		const asset = assetByKey.get(assetKey)!;

		// --- Numeric fields ---
		const quantity = parseGermanNumber(row[colMap.stueck] ?? '');
		const price = parseGermanNumber(row[colMap.kurs] ?? '');
		const amount = parseGermanNumber(row[colMap.betrag] ?? '');
		const fee = parseGermanNumber(row[colMap.gebuehren] ?? '') ?? 0;
		const withholdingTax = parseGermanNumber(row[colMap.steuern] ?? '') ?? 0;
		const notes = (row[colMap.notiz] ?? '').trim();

		// Determine effective type and notes for transfers.
		let txType: 'buy' | 'sell' | 'dividend';
		let txNotes = notes;
		if (mappedType === 'transfer-in') {
			txType = 'buy';
			txNotes = txNotes ? `Transfer in — ${txNotes}` : 'Transfer in';
		} else if (mappedType === 'transfer-out') {
			txType = 'sell';
			txNotes = txNotes ? `Transfer out — ${txNotes}` : 'Transfer out';
		} else {
			txType = mappedType;
		}

		transactions.push({
			id: uuid(),
			assetId: asset.id,
			type: txType,
			date,
			quantity,
			price,
			fee,
			amount,
			withholdingTax,
			currency,
			notes: txNotes,
		});
	}

	return {
		assets: [...assetByKey.values()],
		transactions,
		warnings,
	};
}

// ---------------------------------------------------------------------------
// Column resolution
// ---------------------------------------------------------------------------

function resolveColumns(headerRow: string[], warnings: string[]): ColMap | null {
	const headers = headerRow.map((h) => h.toLowerCase().trim());

	const find = (candidates: string[]): number => {
		for (const c of candidates) {
			const idx = headers.indexOf(c);
			if (idx !== -1) return idx;
		}
		return -1;
	};

	const datum = find(['datum', 'date']);
	const typ = find(['typ', 'type']);
	const wertpapier = find(['wertpapier', 'security', 'name']);
	const isin = find(['isin']);
	const stueck = find(['stück', 'stueck', 'stk', 'quantity', 'shares']);
	const kurs = find(['kurs', 'price']);
	const waehrung = find(['währung', 'waehrung', 'currency']);
	const betrag = find(['betrag', 'amount']);
	const gebuehren = find(['gebühren', 'gebuehren', 'fees', 'fee']);
	const steuern = find(['steuern', 'taxes', 'tax']);
	const notiz = find(['notiz', 'note', 'notes']);

	// Datum and Typ are mandatory.
	if (datum === -1 || typ === -1) {
		warnings.push(
			`Could not identify required columns. Expected Parqet headers: ${EXPECTED_HEADERS.join(', ')}`,
		);
		return null;
	}

	return {
		datum,
		typ,
		wertpapier: wertpapier === -1 ? 2 : wertpapier,
		isin: isin === -1 ? 3 : isin,
		stueck: stueck === -1 ? 4 : stueck,
		kurs: kurs === -1 ? 5 : kurs,
		waehrung: waehrung === -1 ? 6 : waehrung,
		betrag: betrag === -1 ? 7 : betrag,
		gebuehren: gebuehren === -1 ? 8 : gebuehren,
		steuern: steuern === -1 ? 9 : steuern,
		notiz: notiz === -1 ? 10 : notiz,
	};
}

// ---------------------------------------------------------------------------
// Converter to SweetfolioExport
// ---------------------------------------------------------------------------

export function parqetToSweetfolioExport(result: ParqetImportResult): SweetfolioExport {
	const now = new Date().toISOString();

	const assets: Asset[] = result.assets.map((a) => ({
		id: a.id,
		name: a.name,
		isin: a.isin,
		wkn: null,
		currency: a.currency,
		classification: 'unknown' as const,
		prices: [],
		formatConfig: null,
		rawCSV: null,
		rawCSVStoredAt: null,
		createdAt: now,
		updatedAt: now,
		lastRefreshedAt: null,
	}));

	const transactions: Transaction[] = result.transactions.map((t) => ({
		id: t.id,
		portfolioId: '', // no portfolio context from Parqet CSV
		type: t.type,
		assetId: t.assetId,
		date: t.date,
		quantity: t.quantity,
		price: t.price,
		fee: t.fee,
		amount: t.amount,
		withholdingTax: t.withholdingTax,
		currency: t.currency,
		notes: t.notes,
		createdAt: now,
		updatedAt: now,
	}));

	return {
		format: 'sweetfolio',
		version: CURRENT_VERSION,
		exportedAt: now,
		scopes: ['assets', 'transactions'],
		data: {
			assets,
			transactions,
		},
	};
}
