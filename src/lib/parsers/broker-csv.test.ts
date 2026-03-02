import { describe, it, expect } from 'vitest';
import {
	detectBroker,
	parseBrokerCSV,
	parseGermanNumber,
	parseGermanDate,
	brokerCSVToSweetfolioExport,
} from './broker-csv';
import { CURRENT_VERSION } from '$lib/io/schema';

// --- Sample CSVs ---

const TRADE_REPUBLIC_CSV = `Datum;Typ;Wertpapier;ISIN;Stück;Kurs;Betrag;Gebühren
15.01.2024;Kauf;iShares MSCI World;IE00B4L5Y983;5,000;200,00;-1009,90;9,90
15.06.2024;Dividende;iShares MSCI World;IE00B4L5Y983;;;25,00;0,00`;

const SCALABLE_CAPITAL_CSV = `Datum;Ordertyp;Name;ISIN;Stücke;Kurs;Wert;Kosten
2024-01-15;Buy;iShares MSCI World;IE00B4L5Y983;5.000;200.00;1000.00;0.99
2024-06-15;Dividend;iShares MSCI World;IE00B4L5Y983;;;25.00;0.00`;

const ING_DIBA_CSV = `Buchungstag;Wertpapier;ISIN;WKN;Transaktionstyp;Stück;Kurs;Betrag;Ordergebühren
15.01.2024;iShares MSCI World;IE00B4L5Y983;A0RPWH;Kauf;5,000;200,00;-1.000,00;9,90`;

const UNKNOWN_CSV = `Date,Type,Amount
2024-01-15,Buy,1000`;

// --- Detection Tests ---

describe('detectBroker', () => {
	it('identifies Trade Republic', () => {
		expect(detectBroker(TRADE_REPUBLIC_CSV)).toBe('trade-republic');
	});

	it('identifies Scalable Capital', () => {
		expect(detectBroker(SCALABLE_CAPITAL_CSV)).toBe('scalable-capital');
	});

	it('identifies ING DiBa', () => {
		expect(detectBroker(ING_DIBA_CSV)).toBe('ing-diba');
	});

	it('returns unknown for unrecognized format', () => {
		expect(detectBroker(UNKNOWN_CSV)).toBe('unknown');
	});
});

// --- German Number Parsing ---

describe('parseGermanNumber', () => {
	it('parses simple number', () => {
		expect(parseGermanNumber('200,00')).toBe(200);
	});

	it('parses number with thousand separator', () => {
		expect(parseGermanNumber('1.000,50')).toBe(1000.5);
	});

	it('parses negative number', () => {
		expect(parseGermanNumber('-1.009,90')).toBe(-1009.9);
	});

	it('returns NaN for empty string', () => {
		expect(parseGermanNumber('')).toBeNaN();
	});
});

// --- German Date Parsing ---

describe('parseGermanDate', () => {
	it('parses DD.MM.YYYY to YYYY-MM-DD', () => {
		expect(parseGermanDate('15.01.2024')).toBe('2024-01-15');
	});

	it('returns empty string for invalid format', () => {
		expect(parseGermanDate('2024-01-15')).toBe('');
	});
});

// --- Trade Republic Parser ---

describe('parseBrokerCSV — Trade Republic', () => {
	it('parses buy transaction', () => {
		const result = parseBrokerCSV(TRADE_REPUBLIC_CSV);
		expect(result.broker).toBe('trade-republic');
		expect(result.warnings).toHaveLength(0);

		const buy = result.transactions.find((t) => t.type === 'buy');
		expect(buy).toBeDefined();
		expect(buy!.date).toBe('2024-01-15');
		expect(buy!.quantity).toBe(5);
		expect(buy!.price).toBe(200);
		expect(buy!.fee).toBe(9.9);
		expect(buy!.amount).toBe(-1009.9);
	});

	it('parses dividend transaction', () => {
		const result = parseBrokerCSV(TRADE_REPUBLIC_CSV);
		const div = result.transactions.find((t) => t.type === 'dividend');
		expect(div).toBeDefined();
		expect(div!.date).toBe('2024-06-15');
		expect(div!.quantity).toBeNull();
		expect(div!.price).toBeNull();
		expect(div!.amount).toBe(25);
		expect(div!.fee).toBe(0);
	});
});

// --- Scalable Capital Parser ---

describe('parseBrokerCSV — Scalable Capital', () => {
	it('parses buy with English types and dot decimals', () => {
		const result = parseBrokerCSV(SCALABLE_CAPITAL_CSV);
		expect(result.broker).toBe('scalable-capital');
		expect(result.warnings).toHaveLength(0);

		const buy = result.transactions.find((t) => t.type === 'buy');
		expect(buy).toBeDefined();
		expect(buy!.date).toBe('2024-01-15');
		expect(buy!.quantity).toBe(5);
		expect(buy!.price).toBe(200);
		expect(buy!.amount).toBe(1000);
		expect(buy!.fee).toBe(0.99);
	});
});

// --- ING DiBa Parser ---

describe('parseBrokerCSV — ING DiBa', () => {
	it('parses buy with WKN', () => {
		const result = parseBrokerCSV(ING_DIBA_CSV);
		expect(result.broker).toBe('ing-diba');
		expect(result.warnings).toHaveLength(0);

		expect(result.assets).toHaveLength(1);
		expect(result.assets[0].wkn).toBe('A0RPWH');
		expect(result.assets[0].isin).toBe('IE00B4L5Y983');

		const buy = result.transactions[0];
		expect(buy.type).toBe('buy');
		expect(buy.date).toBe('2024-01-15');
		expect(buy.quantity).toBe(5);
		expect(buy.price).toBe(200);
		expect(buy.fee).toBe(9.9);
		expect(buy.amount).toBe(-1000);
	});
});

// --- Asset Deduplication ---

describe('asset deduplication', () => {
	it('deduplicates assets by ISIN', () => {
		const result = parseBrokerCSV(TRADE_REPUBLIC_CSV);
		// Two rows but same ISIN -> one asset
		expect(result.assets).toHaveLength(1);
		expect(result.assets[0].isin).toBe('IE00B4L5Y983');
		// Both transactions reference the same asset
		const assetIds = new Set(result.transactions.map((t) => t.assetId));
		expect(assetIds.size).toBe(1);
	});
});

// --- Unknown Broker Warning ---

describe('unknown broker', () => {
	it('returns empty result with warning', () => {
		const result = parseBrokerCSV(UNKNOWN_CSV);
		expect(result.broker).toBe('unknown');
		expect(result.assets).toHaveLength(0);
		expect(result.transactions).toHaveLength(0);
		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.warnings[0]).toContain('Could not detect broker format');
	});
});

// --- Converter ---

describe('brokerCSVToSweetfolioExport', () => {
	it('converts to valid SweetfolioExport format', () => {
		const result = parseBrokerCSV(TRADE_REPUBLIC_CSV);
		const exported = brokerCSVToSweetfolioExport(result);

		expect(exported.format).toBe('sweetfolio');
		expect(exported.version).toBe(CURRENT_VERSION);
		expect(exported.scopes).toContain('assets');
		expect(exported.scopes).toContain('transactions');
		expect(exported.data.assets).toHaveLength(1);
		expect(exported.data.transactions).toHaveLength(2);

		// Assets have required fields
		const asset = exported.data.assets![0];
		expect(asset.id).toBeTruthy();
		expect(asset.name).toBe('iShares MSCI World');
		expect(asset.isin).toBe('IE00B4L5Y983');
		expect(asset.classification).toBe('unknown');
		expect(asset.prices).toEqual([]);
		expect(asset.createdAt).toBeTruthy();

		// Transactions have required fields
		const tx = exported.data.transactions![0];
		expect(tx.id).toBeTruthy();
		expect(tx.assetId).toBe(asset.id);
		expect(tx.portfolioId).toBe('');
		expect(tx.createdAt).toBeTruthy();
	});
});
