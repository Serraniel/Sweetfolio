/** ISIN / WKN / crypto ticker validation (AM-4, AM-7). */

/** ISIN: 2-letter country, 9 alphanumerics, Luhn check digit over the letter-expanded string. */
export function isValidISIN(value: string): boolean {
	const v = value.trim().toUpperCase();
	if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(v)) return false;
	const digits = v
		.split('')
		.map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c))
		.join('');
	let sum = 0;
	let double = false;
	for (let i = digits.length - 1; i >= 0; i--) {
		let d = +digits[i]!;
		if (double) {
			d *= 2;
			if (d > 9) d -= 9;
		}
		sum += d;
		double = !double;
	}
	return sum % 10 === 0;
}

/** WKN: 6 alphanumerics with at least one digit (German securities id). */
export function isValidWKN(value: string): boolean {
	const v = value.trim().toUpperCase();
	return /^[A-Z0-9]{6}$/.test(v) && /\d/.test(v);
}

export function isValidTicker(value: string): boolean {
	const v = value.trim().toUpperCase();
	return /^[A-Z0-9]{2,10}$/.test(v) && !isValidISIN(v) && !isValidWKN(v);
}

export type IdentifierType = 'isin' | 'wkn' | 'ticker';

export function detectIdentifier(value: string): IdentifierType | null {
	const v = value.trim().toUpperCase();
	if (isValidISIN(v)) return 'isin';
	if (isValidWKN(v)) return 'wkn';
	if (isValidTicker(v)) return 'ticker';
	return null;
}

/** ISIN (preferred) or WKN token in a filename such as `IE00B4L5Y983_history.csv`. */
export function identifierFromFilename(filename: string): { type: 'isin' | 'wkn'; value: string } | null {
	const tokens = filename
		.replace(/\.[^.]+$/, '')
		.toUpperCase()
		.split(/[_\-\s.()[\]]+/);
	for (const t of tokens) if (isValidISIN(t)) return { type: 'isin', value: t };
	for (const t of tokens) if (isValidWKN(t)) return { type: 'wkn', value: t };
	return null;
}
