import { describe, expect, it } from 'vitest';
import {
	parseGermanDate,
	parseGermanNumber,
	parseParqetCSV,
	parqetToSweetfolioExport,
} from './parqet';
import { CURRENT_VERSION } from '$lib/io/schema';

const HEADER = 'Datum;Typ;Wertpapier;ISIN;Stück;Kurs;Währung;Betrag;Gebühren;Steuern;Notiz';

function csv(...rows: string[]): string {
	return [HEADER, ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// German number parsing
// ---------------------------------------------------------------------------

describe('parseGermanNumber', () => {
	it('parses simple decimal with comma', () => {
		expect(parseGermanNumber('200,00')).toBe(200);
	});

	it('parses thousands separator with dot', () => {
		expect(parseGermanNumber('1.234,56')).toBe(1234.56);
	});

	it('parses integer without separator', () => {
		expect(parseGermanNumber('5')).toBe(5);
	});

	it('parses fractional quantity', () => {
		expect(parseGermanNumber('5,000')).toBe(5);
	});

	it('returns null for empty string', () => {
		expect(parseGermanNumber('')).toBeNull();
	});

	it('returns null for non-numeric string', () => {
		expect(parseGermanNumber('abc')).toBeNull();
	});

	it('parses large number with multiple thousand separators', () => {
		expect(parseGermanNumber('1.000.000,99')).toBe(1000000.99);
	});
});

// ---------------------------------------------------------------------------
// German date parsing
// ---------------------------------------------------------------------------

describe('parseGermanDate', () => {
	it('parses DD.MM.YYYY to ISO date', () => {
		expect(parseGermanDate('15.01.2024')).toBe('2024-01-15');
	});

	it('pads single-digit day and month', () => {
		expect(parseGermanDate('1.2.2024')).toBe('2024-02-01');
	});

	it('returns null for invalid format', () => {
		expect(parseGermanDate('2024-01-15')).toBeNull();
	});

	it('returns null for invalid month', () => {
		expect(parseGermanDate('15.13.2024')).toBeNull();
	});

	it('returns null for empty string', () => {
		expect(parseGermanDate('')).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// parseParqetCSV — single rows
// ---------------------------------------------------------------------------

describe('parseParqetCSV', () => {
	it('parses a single buy row', () => {
		const result = parseParqetCSV(
			csv('15.01.2024;Kauf;iShares MSCI World;IE00B4L5Y983;5,000;200,00;EUR;1000,00;9,90;0,00;'),
		);

		expect(result.warnings).toHaveLength(0);
		expect(result.assets).toHaveLength(1);
		expect(result.assets[0].name).toBe('iShares MSCI World');
		expect(result.assets[0].isin).toBe('IE00B4L5Y983');
		expect(result.assets[0].currency).toBe('EUR');

		expect(result.transactions).toHaveLength(1);
		const tx = result.transactions[0];
		expect(tx.type).toBe('buy');
		expect(tx.date).toBe('2024-01-15');
		expect(tx.quantity).toBe(5);
		expect(tx.price).toBe(200);
		expect(tx.amount).toBe(1000);
		expect(tx.fee).toBe(9.9);
		expect(tx.withholdingTax).toBe(0);
		expect(tx.currency).toBe('EUR');
	});

	it('parses a dividend with empty quantity and price', () => {
		const result = parseParqetCSV(
			csv(
				'15.06.2024;Dividende;iShares MSCI World;IE00B4L5Y983;;;EUR;25,00;0,00;5,00;Quartalsdividende',
			),
		);

		expect(result.warnings).toHaveLength(0);
		expect(result.transactions).toHaveLength(1);
		const tx = result.transactions[0];
		expect(tx.type).toBe('dividend');
		expect(tx.quantity).toBeNull();
		expect(tx.price).toBeNull();
		expect(tx.amount).toBe(25);
		expect(tx.withholdingTax).toBe(5);
		expect(tx.notes).toBe('Quartalsdividende');
	});

	it('parses a sell transaction', () => {
		const result = parseParqetCSV(
			csv('01.02.2024;Verkauf;Apple Inc;US0378331005;2,000;180,50;USD;361,00;4,99;0,00;'),
		);

		expect(result.warnings).toHaveLength(0);
		expect(result.transactions).toHaveLength(1);
		const tx = result.transactions[0];
		expect(tx.type).toBe('sell');
		expect(tx.date).toBe('2024-02-01');
		expect(tx.quantity).toBe(2);
		expect(tx.price).toBe(180.5);
		expect(tx.amount).toBe(361);
		expect(tx.fee).toBe(4.99);
		expect(tx.currency).toBe('USD');
	});

	// -----------------------------------------------------------------------
	// Deduplication
	// -----------------------------------------------------------------------

	it('deduplicates assets by ISIN', () => {
		const result = parseParqetCSV(
			csv(
				'15.01.2024;Kauf;iShares MSCI World;IE00B4L5Y983;5,000;200,00;EUR;1000,00;9,90;0,00;',
				'15.06.2024;Dividende;iShares MSCI World;IE00B4L5Y983;;;EUR;25,00;0,00;5,00;',
			),
		);

		expect(result.assets).toHaveLength(1);
		expect(result.transactions).toHaveLength(2);
		// Both transactions should reference the same asset.
		expect(result.transactions[0].assetId).toBe(result.transactions[1].assetId);
	});

	// -----------------------------------------------------------------------
	// Transfers
	// -----------------------------------------------------------------------

	it('maps Einlieferung to buy with transfer note', () => {
		const result = parseParqetCSV(
			csv('10.03.2024;Einlieferung;Tesla Inc;US88160R1014;3,000;180,00;USD;540,00;0,00;0,00;'),
		);

		expect(result.warnings).toHaveLength(0);
		expect(result.transactions).toHaveLength(1);
		const tx = result.transactions[0];
		expect(tx.type).toBe('buy');
		expect(tx.notes).toBe('Transfer in');
	});

	it('maps Auslieferung to sell with transfer note', () => {
		const result = parseParqetCSV(
			csv(
				'10.03.2024;Auslieferung;Tesla Inc;US88160R1014;3,000;180,00;USD;540,00;0,00;0,00;Custom note',
			),
		);

		expect(result.warnings).toHaveLength(0);
		expect(result.transactions).toHaveLength(1);
		const tx = result.transactions[0];
		expect(tx.type).toBe('sell');
		expect(tx.notes).toBe('Transfer out \u2014 Custom note');
	});

	// -----------------------------------------------------------------------
	// Warnings & error handling
	// -----------------------------------------------------------------------

	it('warns on unknown transaction type', () => {
		const result = parseParqetCSV(csv('15.01.2024;Split;Apple Inc;US0378331005;2;100;USD;200;0;0;'));

		expect(result.transactions).toHaveLength(0);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain('unknown transaction type');
		expect(result.warnings[0]).toContain('Split');
	});

	it('handles empty CSV gracefully', () => {
		const result = parseParqetCSV('');
		expect(result.assets).toHaveLength(0);
		expect(result.transactions).toHaveLength(0);
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	it('handles malformed rows gracefully', () => {
		const result = parseParqetCSV(csv('not-a-date;Kauf;Foo;DE000;1;10;EUR;10;0;0;', ''));

		expect(result.transactions).toHaveLength(0);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain('could not parse date');
	});

	it('handles header-only CSV', () => {
		const result = parseParqetCSV(HEADER);
		expect(result.assets).toHaveLength(0);
		expect(result.transactions).toHaveLength(0);
		expect(result.warnings).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// parqetToSweetfolioExport
// ---------------------------------------------------------------------------

describe('parqetToSweetfolioExport', () => {
	it('converts ParqetImportResult to valid SweetfolioExport', () => {
		const parsed = parseParqetCSV(
			csv(
				'15.01.2024;Kauf;iShares MSCI World;IE00B4L5Y983;5,000;200,00;EUR;1000,00;9,90;0,00;',
				'15.06.2024;Dividende;iShares MSCI World;IE00B4L5Y983;;;EUR;25,00;0,00;5,00;Quartalsdividende',
			),
		);

		const exported = parqetToSweetfolioExport(parsed);

		expect(exported.format).toBe('sweetfolio');
		expect(exported.version).toBe(CURRENT_VERSION);
		expect(exported.scopes).toContain('assets');
		expect(exported.scopes).toContain('transactions');

		expect(exported.data.assets).toHaveLength(1);
		const asset = exported.data.assets![0];
		expect(asset.name).toBe('iShares MSCI World');
		expect(asset.isin).toBe('IE00B4L5Y983');
		expect(asset.wkn).toBeNull();
		expect(asset.classification).toBe('unknown');
		expect(asset.prices).toEqual([]);

		expect(exported.data.transactions).toHaveLength(2);
		const buyTx = exported.data.transactions!.find((t) => t.type === 'buy')!;
		expect(buyTx.assetId).toBe(asset.id);
		expect(buyTx.portfolioId).toBe('');
		expect(buyTx.date).toBe('2024-01-15');

		const divTx = exported.data.transactions!.find((t) => t.type === 'dividend')!;
		expect(divTx.withholdingTax).toBe(5);
		expect(divTx.notes).toBe('Quartalsdividende');
	});
});
