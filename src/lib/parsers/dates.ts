/** Localized date parsing for CSV imports (AM-2). */
import { DATE_FORMATS, type DateFormat, type ISODate } from '#lib/domain/types.ts';
import { isValidYMD, ymdToISO } from '#lib/core/dates.ts';

interface Pattern {
	format: DateFormat;
	regex: RegExp;
	order: 'dmy' | 'mdy' | 'ymd';
}

const PATTERNS: Pattern[] = [
	{ format: 'DD.MM.YYYY', regex: /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/, order: 'dmy' },
	{ format: 'DD-MM-YYYY', regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, order: 'dmy' },
	{ format: 'DD/MM/YYYY', regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: 'dmy' },
	{ format: 'YYYY-MM-DD', regex: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, order: 'ymd' },
	{ format: 'MM/DD/YYYY', regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: 'mdy' },
	{ format: 'MM-DD-YYYY', regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, order: 'mdy' }
];

/** Strip a trailing time component (`2024-01-02T10:00:00Z`, `02.01.2024 10:00`). */
function datePart(value: string): string {
	const v = value.trim().replace(/^"|"$/g, '');
	const t = v.search(/[T\s]\d{1,2}:\d{2}/);
	return t > 0 ? v.slice(0, t) : v;
}

export function parseDate(value: string, format: DateFormat): ISODate | null {
	const p = PATTERNS.find((x) => x.format === format);
	if (!p) return null;
	const m = p.regex.exec(datePart(value));
	if (!m) return null;
	const a = +m[1]!;
	const b = +m[2]!;
	let c = +m[3]!;
	let y: number, mo: number, d: number;
	if (p.order === 'ymd') [y, mo, d] = [a, b, c];
	else {
		if (m[3]!.length === 2) c += c < 70 ? 2000 : 1900;
		[y, mo, d] = p.order === 'dmy' ? [c, b, a] : [c, a, b];
	}
	if (y < 1900 || y > 2200 || !isValidYMD(y, mo, d)) return null;
	return ymdToISO(y, mo, d);
}

/** Share of values that parse with a format (0…1). */
export function dateFormatScore(values: readonly string[], format: DateFormat): number {
	const nonEmpty = values.filter((v) => v.trim() !== '');
	if (nonEmpty.length === 0) return 0;
	return nonEmpty.filter((v) => parseDate(v, format) !== null).length / nonEmpty.length;
}

/** Best date format for a column; EU formats win ties. `ambiguous` when DMY and MDY both fit. */
export function detectDateFormat(values: readonly string[]): { format: DateFormat; score: number; ambiguous: boolean } | null {
	let best: { format: DateFormat; score: number } | null = null;
	const scores = new Map<DateFormat, number>();
	for (const f of DATE_FORMATS) {
		const s = dateFormatScore(values, f);
		scores.set(f, s);
		if (s > 0 && (!best || s > best.score)) best = { format: f, score: s };
	}
	if (!best) return null;
	const top = [...scores.entries()].filter(([, s]) => s === best!.score).map(([f]) => f);
	const ambiguous = top.some((f) => f.startsWith('DD')) && top.some((f) => f.startsWith('MM'));
	return { ...best, ambiguous };
}
