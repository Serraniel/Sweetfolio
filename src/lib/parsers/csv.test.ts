import { describe, expect, it } from 'vitest';
import { detectDelimiter, guessDecimal, parseCSV, parseNumber } from './csv.ts';
import { detectDateFormat, parseDate } from './dates.ts';
import { detectIdentifier, identifierFromFilename, isValidISIN, isValidWKN } from './identifiers.ts';

describe('AM-1 CSV tokenizer', () => {
	it('handles quotes, escaped quotes, quoted newlines, BOM, CRLF and empty rows', () => {
		const text = '﻿a;b\r\n"x;1";"say ""hi"""\r\n\r\n"multi\nline";2\n;\n';
		expect(parseCSV(text, ';')).toEqual([
			['a', 'b'],
			['x;1', 'say "hi"'],
			['multi\nline', '2']
		]);
	});
	it('detects delimiters', () => {
		expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
		expect(detectDelimiter('a,b\n1,2')).toBe(',');
		expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
		expect(detectDelimiter('Datum;Kurs\n01.01.2024;1,5')).toBe(';');
	});
});

describe('AM-2 numbers', () => {
	it('parses EU and US formats', () => {
		expect(parseNumber('1.234,56', ',')).toBe(1234.56);
		expect(parseNumber('1,234.56', '.')).toBe(1234.56);
		expect(parseNumber('-12,5', ',')).toBe(-12.5);
		expect(parseNumber('12,50 €', ',')).toBe(12.5);
		expect(parseNumber('1 234,5', ',')).toBe(1234.5);
		expect(parseNumber('5-', ',')).toBe(-5);
		expect(parseNumber('abc', '.')).toBeNull();
		expect(parseNumber('', '.')).toBeNull();
	});
	it('guesses decimal separators', () => {
		expect(guessDecimal('1.234,5')).toBe(',');
		expect(guessDecimal('12,34')).toBe(',');
		expect(guessDecimal('1,234.5')).toBe('.');
		expect(guessDecimal('12.34')).toBe('.');
		expect(guessDecimal('1234')).toBeNull();
	});
});

describe('AM-2 dates', () => {
	it('parses all supported formats and rejects impossible dates', () => {
		expect(parseDate('31.12.2024', 'DD.MM.YYYY')).toBe('2024-12-31');
		expect(parseDate('31.02.2024', 'DD.MM.YYYY')).toBeNull();
		expect(parseDate('2024-01-05T10:00:00Z', 'YYYY-MM-DD')).toBe('2024-01-05');
		expect(parseDate('12/31/2024', 'MM/DD/YYYY')).toBe('2024-12-31');
		expect(parseDate('05.01.24', 'DD.MM.YYYY')).toBe('2024-01-05');
	});
	it('prefers EU formats and flags ambiguity', () => {
		const amb = detectDateFormat(['01/02/2024', '03/04/2024']);
		expect(amb).toMatchObject({ format: 'DD/MM/YYYY', ambiguous: true });
		const us = detectDateFormat(['12/31/2024', '01/15/2024']);
		expect(us).toMatchObject({ format: 'MM/DD/YYYY', ambiguous: false });
	});
});

describe('AM-4 identifiers', () => {
	it('validates ISIN check digits and WKN', () => {
		expect(isValidISIN('IE00B4L5Y983')).toBe(true);
		expect(isValidISIN('DE0005140008')).toBe(true);
		expect(isValidISIN('US0378331005')).toBe(true);
		expect(isValidISIN('IE00B4L5Y984')).toBe(false);
		expect(isValidWKN('A0RPWH')).toBe(true);
		expect(isValidWKN('ABCDEF')).toBe(false);
	});
	it('detects identifier types (AM-7)', () => {
		expect(detectIdentifier('ie00b4l5y983')).toBe('isin');
		expect(detectIdentifier('A0RPWH')).toBe('wkn');
		expect(detectIdentifier('BTC')).toBe('ticker');
		expect(detectIdentifier('!')).toBeNull();
	});
	it('extracts identifiers from filenames (AM-3b)', () => {
		expect(identifierFromFilename('iShares MSCI World IE00B4L5Y983.csv')).toEqual({ type: 'isin', value: 'IE00B4L5Y983' });
		expect(identifierFromFilename('514000-daily.csv')).toEqual({ type: 'wkn', value: '514000' });
		expect(identifierFromFilename('prices.csv')).toBeNull();
	});
});
