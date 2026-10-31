import { describe, expect, it } from 'vitest';
import { detectPriceFormat, isConfident, parsePriceCSV } from './price-csv.ts';

describe('AM-2 price CSV detection', () => {
	it('German export with semicolons and decimal comma', () => {
		const csv =
			'Datum;Eröffnung;Hoch;Tief;Schlusskurs;Volumen\n02.01.2024;80,10;81,00;79,50;80,55;1.234\n03.01.2024;80,55;82,00;80,00;81,20;2.000\n';
		const f = detectPriceFormat(csv);
		expect(f).toMatchObject({
			delimiter: ';',
			decimalSeparator: ',',
			dateFormat: 'DD.MM.YYYY',
			hasHeader: true,
			dateColumn: 0,
			closeColumn: 4
		});
		const r = parsePriceCSV(csv);
		expect(r.prices).toEqual([
			{ date: '2024-01-02', close: 80.55 },
			{ date: '2024-01-03', close: 81.2 }
		]);
		expect(isConfident(r)).toBe(true);
	});
	it('Yahoo-style export prefers Adj Close', () => {
		const csv = 'Date,Open,High,Low,Close,Adj Close,Volume\n2024-01-02,1,2,0.5,1.5,1.4,100\n2024-01-03,1,2,0.5,1.6,1.5,100\n';
		const r = parsePriceCSV(csv);
		expect(r.format.closeColumn).toBe(5);
		expect(r.prices[0]!.close).toBe(1.4);
	});
	it('headerless two-column file, sorted and deduplicated', () => {
		const r = parsePriceCSV('2024-01-03,2\n2024-01-02,1\n2024-01-03,3\n');
		expect(r.format.hasHeader).toBe(false);
		expect(r.prices).toEqual([
			{ date: '2024-01-02', close: 1 },
			{ date: '2024-01-03', close: 3 }
		]);
		expect(r.warnings.some((w) => w.includes('duplicate'))).toBe(true);
	});
	it('ambiguous dates are not confident (AM-3)', () => {
		const r = parsePriceCSV('Date;Close\n01/02/2024;1\n03/04/2024;2\n');
		expect(r.format.ambiguous).toBe(true);
		expect(isConfident(r)).toBe(false);
	});
	it('overrides re-parse the data', () => {
		const r = parsePriceCSV('Date;Close\n01/02/2024;1\n03/04/2024;2\n', { dateFormat: 'MM/DD/YYYY' });
		expect(r.prices[0]!.date).toBe('2024-01-02');
	});
	it('reports invalid rows as warnings', () => {
		const r = parsePriceCSV('Date;Close\n2024-01-02;1\nfoo;2\n2024-01-04;x\n2024-01-05;3\n');
		expect(r.prices).toHaveLength(2);
		expect(r.warnings).toHaveLength(2);
	});
});
