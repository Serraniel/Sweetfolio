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

// ISIN: 2 uppercase letters + 9 alphanumeric + 1 check digit
const ISIN_PATTERN = /\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/;

// WKN: exactly 6 alphanumeric, not all letters (to avoid matching random words)
const WKN_PATTERN = /\b([A-Z0-9]{6})\b/;

/**
 * Extract an ISIN or WKN from a filename string.
 * ISIN takes priority over WKN if both are found.
 * Returns null if no identifier is found.
 */
export function extractIdentifier(filename: string): FilenameIdentifier | null {
	// Strip file extension
	const name = filename.replace(/\.[^.]+$/, '');
	const upper = name.toUpperCase();

	// Try ISIN first (more specific pattern)
	const isinMatch = upper.match(ISIN_PATTERN);
	if (isinMatch) {
		return { type: 'isin', value: isinMatch[1] };
	}

	// Try WKN (6-char alphanumeric that contains at least one digit)
	const wknCandidates = upper.matchAll(/\b([A-Z0-9]{6})\b/g);
	for (const match of wknCandidates) {
		const candidate = match[1];
		// WKN must have at least one digit to avoid matching plain words
		if (/\d/.test(candidate)) {
			return { type: 'wkn', value: candidate };
		}
	}

	return null;
}
