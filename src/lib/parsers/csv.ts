/** RFC 4180-style CSV tokenizer: quoted fields, escaped quotes, quoted newlines, BOM, CRLF. */

export function stripBom(text: string): string {
	return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Parse CSV text into rows. Rows consisting only of empty fields are dropped. Fields are trimmed. */
export function parseCSV(text: string, delimiter: string, maxRows = Infinity): string[][] {
	const src = stripBom(text);
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;
	let fieldQuoted = false;
	const pushField = () => {
		row.push(fieldQuoted ? field : field.trim());
		field = '';
		fieldQuoted = false;
	};
	const pushRow = () => {
		pushField();
		if (row.some((f) => f !== '')) rows.push(row);
		row = [];
	};
	for (let i = 0; i < src.length && rows.length < maxRows; i++) {
		const ch = src[i]!;
		if (inQuotes) {
			if (ch === '"') {
				if (src[i + 1] === '"') {
					field += '"';
					i++;
				} else inQuotes = false;
			} else field += ch;
			continue;
		}
		if (ch === '"' && field.trim() === '') {
			inQuotes = true;
			fieldQuoted = true;
			field = '';
		} else if (ch === delimiter) pushField();
		else if (ch === '\n' || ch === '\r') {
			if (ch === '\r' && src[i + 1] === '\n') i++;
			pushRow();
		} else field += ch;
	}
	if (rows.length < maxRows && (field !== '' || row.length > 0)) pushRow();
	return rows;
}

/** Count delimiter occurrences outside quotes in a line. */
export function countUnquoted(line: string, ch: string): number {
	let count = 0;
	let q = false;
	for (const c of line) {
		if (c === '"') q = !q;
		else if (c === ch && !q) count++;
	}
	return count;
}

export const DELIMITERS = [';', ',', '\t', '|'] as const;

/** Pick the delimiter that appears most consistently in the first lines. Semicolon wins ties (EU). */
export function detectDelimiter(text: string): string {
	const lines = stripBom(text)
		.split(/\r?\n/)
		.filter((l) => l.trim() !== '')
		.slice(0, 20);
	if (lines.length === 0) return ',';
	let best: string = ',';
	let bestScore = -1;
	for (const d of DELIMITERS) {
		const counts = lines.map((l) => countUnquoted(l, d));
		const min = Math.min(...counts);
		if (min === 0) continue;
		const consistent = counts.filter((c) => c === counts[0]).length / counts.length;
		const score = min * consistent + (d === ';' ? 0.01 : 0);
		if (score > bestScore) {
			bestScore = score;
			best = d;
		}
	}
	return best;
}

/**
 * Parse a localized number. `decimal` is the decimal separator; the other
 * separator (and spaces, apostrophes) is treated as grouping. Handles currency
 * symbols, percent signs, unicode minus and trailing minus.
 */
export function parseNumber(value: string | undefined | null, decimal: string): number | null {
	if (value == null) return null;
	let v = value.trim().replace(/−/g, '-');
	if (!v) return null;
	v = v
		.replace(/[€$£¥%\s ']/g, '')
		.replace(/^(EUR|USD|GBP|CHF)/i, '')
		.replace(/(EUR|USD|GBP|CHF)$/i, '');
	let negative = false;
	if (v.endsWith('-')) {
		negative = true;
		v = v.slice(0, -1);
	}
	if (v.startsWith('(') && v.endsWith(')')) {
		negative = true;
		v = v.slice(1, -1);
	}
	const group = decimal === ',' ? '.' : ',';
	v = v.split(group).join('');
	if (decimal === ',') v = v.replace(',', '.');
	if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(v)) return null;
	const n = Number(v);
	if (!Number.isFinite(n)) return null;
	return negative ? -n : n;
}

/** Guess decimal separator for a single value: ',' or '.' or null when undecidable. */
export function guessDecimal(value: string): ',' | '.' | null {
	const v = value.trim().replace(/[€$£%\s]/g, '');
	if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(v) || /^-?\d+,\d+$/.test(v)) return ',';
	if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(v)) return '.';
	if (/^-?\d{1,3}(\.\d{3})+$/.test(v)) return ',';
	if (/^-?\d{1,3}(,\d{3})+$/.test(v)) return '.';
	if (/^-?\d+\.\d+$/.test(v)) return '.';
	return null;
}
