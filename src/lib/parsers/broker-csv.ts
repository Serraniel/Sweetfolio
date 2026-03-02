/**
 * Generic broker CSV import parser with auto-detection for common German broker formats.
 * Supports: Trade Republic, Scalable Capital, ING DiBa.
 */

import { parseCSVRows } from './csv';
import { CURRENT_VERSION, type SweetfolioExport } from '$lib/io/schema';

// --- Public Types ---

export type BrokerType = 'trade-republic' | 'scalable-capital' | 'ing-diba' | 'unknown';

export interface BrokerCSVImportResult {
	broker: BrokerType;
	assets: Array<{
		id: string;
		name: string;
		isin: string | null;
		wkn: string | null;
		currency: string;
	}>;
	transactions: Array<{
		id: string;
		assetId: string;
		type: 'buy' | 'sell' | 'dividend';
		date: string; // YYYY-MM-DD
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

// --- Helpers ---

/** Parse German-formatted number: "1.000,50" -> 1000.5, empty string -> NaN */
export function parseGermanNumber(s: string): number {
	const trimmed = s.trim();
	if (trimmed === '') return NaN;
	// Remove thousand separators (dots), replace decimal comma with dot
	return parseFloat(trimmed.replace(/\./g, '').replace(',', '.'));
}

/** Parse German date "DD.MM.YYYY" -> "YYYY-MM-DD" */
export function parseGermanDate(s: string): string {
	const trimmed = s.trim();
	const match = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
	if (!match) return '';
	return `${match[3]}-${match[2]}-${match[1]}`;
}

/** Parse English-formatted number: "1000.50" -> 1000.5 */
function parseEnglishNumber(s: string): number {
	const trimmed = s.trim();
	if (trimmed === '') return NaN;
	return parseFloat(trimmed);
}

/** Generate a deterministic ID from components */
function generateId(...parts: string[]): string {
	// Simple hash-like ID from the concatenated parts
	let hash = 0;
	const str = parts.join('|');
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash + char) | 0;
	}
	return Math.abs(hash).toString(36).padStart(8, '0');
}

// --- Broker Detection ---

export function detectBroker(csvString: string): BrokerType {
	const firstLine = csvString.split(/\r?\n/)[0]?.trim() ?? '';
	const columns = firstLine.split(';').map((c) => c.trim());

	// Trade Republic: Datum;Typ;Wertpapier;ISIN;Stück;Kurs;Betrag;Gebühren
	if (
		columns.includes('Datum') &&
		columns.includes('Typ') &&
		columns.includes('Stück') &&
		columns.includes('Gebühren')
	) {
		return 'trade-republic';
	}

	// Scalable Capital: Datum;Ordertyp;Name;ISIN;Stücke;Kurs;Wert;Kosten
	if (columns.includes('Ordertyp') && columns.includes('Stücke')) {
		return 'scalable-capital';
	}

	// ING DiBa: Buchungstag;Wertpapier;ISIN;WKN;Transaktionstyp;Stück;Kurs;Betrag;Ordergebühren
	if (
		columns.includes('Buchungstag') &&
		columns.includes('Transaktionstyp') &&
		columns.includes('WKN') &&
		columns.includes('Ordergebühren')
	) {
		return 'ing-diba';
	}

	return 'unknown';
}

// --- Broker-Specific Parsers ---

type TransactionType = 'buy' | 'sell' | 'dividend';

function mapGermanType(typ: string): TransactionType | null {
	const lower = typ.toLowerCase().trim();
	if (lower === 'kauf') return 'buy';
	if (lower === 'verkauf') return 'sell';
	if (lower === 'dividende') return 'dividend';
	return null;
}

function mapEnglishType(typ: string): TransactionType | null {
	const lower = typ.toLowerCase().trim();
	if (lower === 'buy') return 'buy';
	if (lower === 'sell') return 'sell';
	if (lower === 'dividend') return 'dividend';
	return null;
}

interface AssetMap {
	[isin: string]: {
		id: string;
		name: string;
		isin: string | null;
		wkn: string | null;
		currency: string;
	};
}

function getOrCreateAsset(
	assets: AssetMap,
	isin: string,
	name: string,
	wkn: string | null,
): string {
	if (assets[isin]) return assets[isin].id;
	const id = generateId('asset', isin);
	assets[isin] = { id, name, isin: isin || null, wkn, currency: 'EUR' };
	return id;
}

function parseTradeRepublic(rows: string[][], warnings: string[]): BrokerCSVImportResult {
	const header = rows[0];
	const colIdx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
	const assets: AssetMap = {};
	const transactions: BrokerCSVImportResult['transactions'] = [];

	for (let i = 1; i < rows.length; i++) {
		const row = rows[i];
		if (row.length < header.length) continue;

		const dateRaw = row[colIdx['Datum']] ?? '';
		const typ = row[colIdx['Typ']] ?? '';
		const name = row[colIdx['Wertpapier']] ?? '';
		const isin = row[colIdx['ISIN']] ?? '';
		const stueckRaw = row[colIdx['Stück']] ?? '';
		const kursRaw = row[colIdx['Kurs']] ?? '';
		const betragRaw = row[colIdx['Betrag']] ?? '';
		const gebuehrenRaw = row[colIdx['Gebühren']] ?? '';

		const txType = mapGermanType(typ);
		if (!txType) {
			warnings.push(`Row ${i + 1}: unknown transaction type "${typ}"`);
			continue;
		}

		const date = parseGermanDate(dateRaw);
		if (!date) {
			warnings.push(`Row ${i + 1}: could not parse date "${dateRaw}"`);
			continue;
		}

		const assetId = getOrCreateAsset(assets, isin, name, null);
		const quantity = stueckRaw ? parseGermanNumber(stueckRaw) : null;
		const price = kursRaw ? parseGermanNumber(kursRaw) : null;
		const amount = betragRaw ? parseGermanNumber(betragRaw) : null;
		const fee = gebuehrenRaw ? parseGermanNumber(gebuehrenRaw) : 0;

		transactions.push({
			id: generateId('tx', isin, date, txType, String(i)),
			assetId,
			type: txType,
			date,
			quantity: quantity !== null && !isNaN(quantity) ? quantity : null,
			price: price !== null && !isNaN(price) ? price : null,
			fee: !isNaN(fee) ? Math.abs(fee) : 0,
			amount: amount !== null && !isNaN(amount) ? amount : null,
			withholdingTax: 0,
			currency: 'EUR',
			notes: `Trade Republic ${typ}`,
		});
	}

	return { broker: 'trade-republic', assets: Object.values(assets), transactions, warnings };
}

function parseScalableCapital(rows: string[][], warnings: string[]): BrokerCSVImportResult {
	const header = rows[0];
	const colIdx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
	const assets: AssetMap = {};
	const transactions: BrokerCSVImportResult['transactions'] = [];

	for (let i = 1; i < rows.length; i++) {
		const row = rows[i];
		if (row.length < header.length) continue;

		const dateRaw = row[colIdx['Datum']] ?? '';
		const typ = row[colIdx['Ordertyp']] ?? '';
		const name = row[colIdx['Name']] ?? '';
		const isin = row[colIdx['ISIN']] ?? '';
		const stueckeRaw = row[colIdx['Stücke']] ?? '';
		const kursRaw = row[colIdx['Kurs']] ?? '';
		const wertRaw = row[colIdx['Wert']] ?? '';
		const kostenRaw = row[colIdx['Kosten']] ?? '';

		const txType = mapEnglishType(typ);
		if (!txType) {
			warnings.push(`Row ${i + 1}: unknown transaction type "${typ}"`);
			continue;
		}

		// Scalable uses YYYY-MM-DD dates
		const date = dateRaw.trim();
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			warnings.push(`Row ${i + 1}: could not parse date "${dateRaw}"`);
			continue;
		}

		const assetId = getOrCreateAsset(assets, isin, name, null);
		const quantity = stueckeRaw ? parseEnglishNumber(stueckeRaw) : null;
		const price = kursRaw ? parseEnglishNumber(kursRaw) : null;
		const amount = wertRaw ? parseEnglishNumber(wertRaw) : null;
		const fee = kostenRaw ? parseEnglishNumber(kostenRaw) : 0;

		transactions.push({
			id: generateId('tx', isin, date, txType, String(i)),
			assetId,
			type: txType,
			date,
			quantity: quantity !== null && !isNaN(quantity) ? quantity : null,
			price: price !== null && !isNaN(price) ? price : null,
			fee: !isNaN(fee) ? Math.abs(fee) : 0,
			amount: amount !== null && !isNaN(amount) ? amount : null,
			withholdingTax: 0,
			currency: 'EUR',
			notes: `Scalable Capital ${typ}`,
		});
	}

	return { broker: 'scalable-capital', assets: Object.values(assets), transactions, warnings };
}

function parseIngDiba(rows: string[][], warnings: string[]): BrokerCSVImportResult {
	const header = rows[0];
	const colIdx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
	const assets: AssetMap = {};
	const transactions: BrokerCSVImportResult['transactions'] = [];

	for (let i = 1; i < rows.length; i++) {
		const row = rows[i];
		if (row.length < header.length) continue;

		const dateRaw = row[colIdx['Buchungstag']] ?? '';
		const name = row[colIdx['Wertpapier']] ?? '';
		const isin = row[colIdx['ISIN']] ?? '';
		const wkn = row[colIdx['WKN']] ?? '';
		const typ = row[colIdx['Transaktionstyp']] ?? '';
		const stueckRaw = row[colIdx['Stück']] ?? '';
		const kursRaw = row[colIdx['Kurs']] ?? '';
		const betragRaw = row[colIdx['Betrag']] ?? '';
		const gebuehrenRaw = row[colIdx['Ordergebühren']] ?? '';

		const txType = mapGermanType(typ);
		if (!txType) {
			warnings.push(`Row ${i + 1}: unknown transaction type "${typ}"`);
			continue;
		}

		const date = parseGermanDate(dateRaw);
		if (!date) {
			warnings.push(`Row ${i + 1}: could not parse date "${dateRaw}"`);
			continue;
		}

		const assetId = getOrCreateAsset(assets, isin, name, wkn || null);
		const quantity = stueckRaw ? parseGermanNumber(stueckRaw) : null;
		const price = kursRaw ? parseGermanNumber(kursRaw) : null;
		const amount = betragRaw ? parseGermanNumber(betragRaw) : null;
		const fee = gebuehrenRaw ? parseGermanNumber(gebuehrenRaw) : 0;

		transactions.push({
			id: generateId('tx', isin, date, txType, String(i)),
			assetId,
			type: txType,
			date,
			quantity: quantity !== null && !isNaN(quantity) ? quantity : null,
			price: price !== null && !isNaN(price) ? price : null,
			fee: !isNaN(fee) ? Math.abs(fee) : 0,
			amount: amount !== null && !isNaN(amount) ? amount : null,
			withholdingTax: 0,
			currency: 'EUR',
			notes: `ING DiBa ${typ}`,
		});
	}

	return { broker: 'ing-diba', assets: Object.values(assets), transactions, warnings };
}

// --- Main Entry Point ---

export function parseBrokerCSV(csvString: string): BrokerCSVImportResult {
	const broker = detectBroker(csvString);

	if (broker === 'unknown') {
		return {
			broker: 'unknown',
			assets: [],
			transactions: [],
			warnings: ['Could not detect broker format. Supported brokers: Trade Republic, Scalable Capital, ING DiBa.'],
		};
	}

	const rows = parseCSVRows(csvString, ';');
	if (rows.length < 2) {
		return {
			broker,
			assets: [],
			transactions: [],
			warnings: ['CSV file contains no data rows.'],
		};
	}

	const warnings: string[] = [];

	switch (broker) {
		case 'trade-republic':
			return parseTradeRepublic(rows, warnings);
		case 'scalable-capital':
			return parseScalableCapital(rows, warnings);
		case 'ing-diba':
			return parseIngDiba(rows, warnings);
	}
}

// --- Converter to SweetfolioExport ---

export function brokerCSVToSweetfolioExport(result: BrokerCSVImportResult): SweetfolioExport {
	const now = new Date().toISOString();

	return {
		format: 'sweetfolio',
		version: CURRENT_VERSION,
		exportedAt: now,
		scopes: ['assets', 'transactions'],
		data: {
			assets: result.assets.map((a) => ({
				id: a.id,
				name: a.name,
				isin: a.isin,
				wkn: a.wkn,
				currency: a.currency,
				classification: 'unknown' as const,
				prices: [],
				formatConfig: null,
				rawCSV: null,
				rawCSVStoredAt: null,
				createdAt: now,
				updatedAt: now,
				lastRefreshedAt: null,
			})),
			transactions: result.transactions.map((t) => ({
				id: t.id,
				portfolioId: '',
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
			})),
		},
	};
}
