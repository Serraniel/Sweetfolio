/** Locale-aware formatting helpers (UI-6). */
import type { ISODate } from '#lib/domain/types.ts';

const locale = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US';
const cache = new Map<string, Intl.NumberFormat>();

function nf(key: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
	let f = cache.get(key);
	if (!f) {
		f = new Intl.NumberFormat(locale, opts);
		cache.set(key, f);
	}
	return f;
}

const DASH = '–';

export function pct(v: number | null | undefined, digits = 2, signed = false): string {
	if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
	return nf(`p${digits}${signed}`, {
		style: 'percent',
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
		signDisplay: signed ? 'exceptZero' : 'auto'
	}).format(v);
}

export function num(v: number | null | undefined, digits = 2, min = digits): string {
	if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
	return nf(`n${digits}-${min}`, { minimumFractionDigits: min, maximumFractionDigits: digits }).format(v);
}

/** Up to 8 decimals for share quantities, trimmed. */
export function qty(v: number | null | undefined): string {
	return num(v, 6, 0);
}

export function money(v: number | null | undefined, currency = 'EUR', opts: { signed?: boolean; compact?: boolean } = {}): string {
	if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
	const key = `c${currency}${opts.signed}${opts.compact}`;
	try {
		return nf(key, {
			style: 'currency',
			currency,
			signDisplay: opts.signed ? 'exceptZero' : 'auto',
			notation: opts.compact ? 'compact' : 'standard',
			maximumFractionDigits: opts.compact ? 1 : 2
		}).format(v);
	} catch {
		return `${num(v)} ${currency}`;
	}
}

export function compact(v: number): string {
	return nf('compact', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

const dateFmt = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', timeZone: 'UTC' });

export function date(d: ISODate | null | undefined): string {
	if (!d) return DASH;
	const t = Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
	return Number.isNaN(t) ? d : dateFmt.format(t);
}

export function month(d: ISODate): string {
	return monthFmt.format(Date.parse(`${d.slice(0, 10)}T00:00:00Z`));
}

export function relativeTime(iso: string | null): string {
	if (!iso) return 'never';
	const diff = Date.now() - Date.parse(iso);
	const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
	const mins = Math.round(diff / 60000);
	if (Math.abs(mins) < 60) return rtf.format(-mins, 'minute');
	const hours = Math.round(mins / 60);
	if (Math.abs(hours) < 48) return rtf.format(-hours, 'hour');
	return rtf.format(-Math.round(hours / 24), 'day');
}

export function signClass(v: number | null | undefined): string {
	if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return '';
	return v > 0 ? 'pos' : 'neg';
}

/** Decimal separator of the user's locale (for numeric inputs). */
export const decimalSeparator = (1.5).toLocaleString(locale).includes(',') ? ',' : '.';

/** Parse a user-entered number accepting both `,` and `.` as decimal separator. */
export function parseInput(value: string): number | null {
	const v = value.trim().replace(/\s/g, '');
	if (!v) return null;
	const lastComma = v.lastIndexOf(',');
	const lastDot = v.lastIndexOf('.');
	let normalized = v;
	if (lastComma > lastDot) normalized = v.replace(/\./g, '').replace(',', '.');
	else if (lastDot > lastComma && lastComma >= 0) normalized = v.replace(/,/g, '');
	const n = Number(normalized);
	return Number.isFinite(n) ? n : null;
}
