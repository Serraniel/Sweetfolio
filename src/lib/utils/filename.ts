/**
 * Extract potential ISIN or WKN identifiers from a filename.
 *
 * Looks for patterns matching:
 * - ISIN: 12-char alphanumeric starting with 2-letter country code (e.g. DE0005140008)
 * - WKN: 6-char alphanumeric (e.g. 514000)
 *
 * Common filenames from brokers/data providers:
 * - "DE0005140008_history.csv"
 * - "514000-daily.csv"
 * - "iShares MSCI World IE00B4L5Y983.csv"
 */

/** Result of parsing a filename for identifiers. */
export interface FilenameIdentifier {
	type: 'isin' | 'wkn';
	value: string;
}

/**
 * Extract an ISIN or WKN from a filename string.
 * ISIN takes priority over WKN if both are found.
 * Returns null if no identifier is found.
 */
export function extractIdentifier(filename: string): FilenameIdentifier | null {
	// Strip file extension and split on common separators (underscore, hyphen, space, dot)
	const name = filename.replace(/\.[^.]+$/, '');
	const tokens = name.toUpperCase().split(/[_\-\s.]+/);

	// Try ISIN first (more specific pattern)
	for (const token of tokens) {
		const isinMatch = token.match(/^([A-Z]{2}[A-Z0-9]{9}[0-9])$/);
		if (isinMatch) {
			return { type: 'isin', value: isinMatch[1] };
		}
	}

	// Try WKN (6-char alphanumeric that contains at least one digit)
	for (const token of tokens) {
		if (/^[A-Z0-9]{6}$/.test(token) && /\d/.test(token)) {
			return { type: 'wkn', value: token };
		}
	}

	return null;
}
