/** Price-history CSV import: format detection and parsing (AM-1 … AM-3c). */
import type { DateFormat, DetectedFormat, PricePoint } from '#lib/domain/types.ts';
import { normalizeSeries } from '#lib/core/series.ts';
import { detectDelimiter, guessDecimal, parseCSV, parseNumber } from './csv.ts';
import { detectDateFormat, parseDate } from './dates.ts';

const SAMPLE = 30;
const CLOSE_KEYWORDS = [
	'adj close',
	'adj. close',
	'adjusted close',
	'schlusskurs',
	'schluss',
	'close',
	'last',
	'letzter',
	'kurs',
	'price',
	'preis',
	'nav',
	'value',
	'wert'
];
const DATE_KEYWORDS = ['date', 'datum', 'time', 'zeit', 'day', 'tag'];

export interface PriceParseResult {
	prices: PricePoint[];
	format: DetectedFormat;
	warnings: string[];
	rowCount: number;
	headers: string[] | null;
	preview: string[][];
}

function looksNumeric(v: string): boolean {
	return /^[+-]?[\d.,'\s]+$/.test(v.trim()) && /\d/.test(v);
}

function detectHeader(rows: string[][]): boolean {
	if (rows.length < 2) return false;
	const [first, second] = rows as [string[], string[]];
	const numFirst = first.filter(looksNumeric).length;
	const numSecond = second.filter(looksNumeric).length;
	const dateLikeFirst = first.some((c) => detectDateFormat([c]) !== null);
	return numSecond > numFirst || (!dateLikeFirst && first.some((c) => /[a-zäöü]/i.test(c)));
}

function detectDecimal(sample: string[][], skip: number, delimiter: string): ',' | '.' {
	let comma = 0;
	let dot = 0;
	for (const row of sample)
		row.forEach((cell, i) => {
			if (i === skip) return;
			const g = guessDecimal(cell);
			if (g === ',') comma++;
			else if (g === '.') dot++;
		});
	if (comma > dot) return ',';
	if (dot > comma) return '.';
	return delimiter === ';' ? ',' : '.';
}

export function detectPriceFormat(text: string): DetectedFormat {
	const delimiter = detectDelimiter(text);
	const rows = parseCSV(text, delimiter, SAMPLE + 1);
	const hasHeader = detectHeader(rows);
	const data = hasHeader ? rows.slice(1) : rows;
	const headers = hasHeader ? rows[0]!.map((h) => h.toLowerCase()) : [];
	const cols = Math.max(0, ...rows.map((r) => r.length));

	let dateColumn = 0;
	let dateFormat: DateFormat = 'YYYY-MM-DD';
	let ambiguous = false;
	let bestScore = -1;
	for (let c = 0; c < cols; c++) {
		const det = detectDateFormat(data.map((r) => r[c] ?? ''));
		if (!det) continue;
		const bonus = DATE_KEYWORDS.some((k) => headers[c]?.includes(k)) ? 0.001 : 0;
		if (det.score + bonus > bestScore) {
			bestScore = det.score + bonus;
			dateColumn = c;
			dateFormat = det.format;
			ambiguous = det.ambiguous;
		}
	}
	const decimalSeparator = detectDecimal(data, dateColumn, delimiter);

	let closeColumn = -1;
	if (hasHeader) {
		for (const k of CLOSE_KEYWORDS) {
			const idx = headers.findIndex((h, i) => i !== dateColumn && h.includes(k));
			if (idx >= 0) {
				closeColumn = idx;
				break;
			}
		}
	}
	if (closeColumn < 0) {
		for (let c = cols - 1; c >= 0; c--) {
			if (c === dateColumn) continue;
			const ok = data.filter((r) => parseNumber(r[c], decimalSeparator) !== null).length;
			if (data.length && ok >= data.length * 0.8) {
				closeColumn = c;
				break;
			}
		}
	}
	if (closeColumn < 0) closeColumn = dateColumn === 0 ? 1 : 0;
	return { delimiter, decimalSeparator, dateFormat, hasHeader, dateColumn, closeColumn, ambiguous };
}

export function parsePriceCSV(text: string, override?: Partial<DetectedFormat>): PriceParseResult {
	const format: DetectedFormat = { ...detectPriceFormat(text), ...override };
	const rows = parseCSV(text, format.delimiter);
	const headers = format.hasHeader && rows.length ? rows[0]! : null;
	const data = format.hasHeader ? rows.slice(1) : rows;
	const warnings: string[] = [];
	const prices: PricePoint[] = [];
	const lineOffset = format.hasHeader ? 2 : 1;
	data.forEach((row, i) => {
		const rawDate = row[format.dateColumn];
		const rawClose = row[format.closeColumn];
		if (!rawDate || !rawClose) {
			warnings.push(`Row ${i + lineOffset}: missing date or price`);
			return;
		}
		const date = parseDate(rawDate, format.dateFormat);
		if (!date) {
			warnings.push(`Row ${i + lineOffset}: invalid date "${rawDate}"`);
			return;
		}
		const close = parseNumber(rawClose, format.decimalSeparator);
		if (close === null) {
			warnings.push(`Row ${i + lineOffset}: invalid number "${rawClose}"`);
			return;
		}
		prices.push({ date, close });
	});
	const normalized = normalizeSeries(prices);
	if (normalized.length < prices.length) warnings.push(`${prices.length - normalized.length} duplicate date(s) — the last value was kept`);
	return { prices: normalized, format, warnings, rowCount: data.length, headers, preview: rows.slice(0, 11) };
}

/** Confident enough to import without asking (AM-3a). */
export function isConfident(result: PriceParseResult): boolean {
	if (result.format.ambiguous) return false;
	if (result.format.dateColumn === result.format.closeColumn) return false;
	if (result.rowCount < 2 || result.prices.length < 2) return false;
	return result.prices.length >= result.rowCount * 0.9;
}
