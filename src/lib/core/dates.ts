/**
 * Timezone-safe calendar date helpers. Dates are ISO strings (`YYYY-MM-DD`)
 * and arithmetic is done on UTC day numbers, so results never depend on the
 * user's local timezone.
 */
import type { ISODate } from '#lib/domain/types.ts';

const MS_PER_DAY = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidYMD(y: number, m: number, d: number): boolean {
	if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
	if (m < 1 || m > 12 || d < 1) return false;
	return d <= daysInMonth(y, m);
}

export function daysInMonth(y: number, m: number): number {
	return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function ymdToISO(y: number, m: number, d: number): ISODate {
	return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function isISODate(value: string): boolean {
	const m = ISO_RE.exec(value);
	return !!m && isValidYMD(+m[1]!, +m[2]!, +m[3]!);
}

/** Days since 1970-01-01 (UTC). */
export function toDayNumber(date: ISODate): number {
	const m = ISO_RE.exec(date);
	if (!m) throw new Error(`Invalid ISO date: ${date}`);
	return Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!) / MS_PER_DAY;
}

export function fromDayNumber(day: number): ISODate {
	const d = new Date(day * MS_PER_DAY);
	return ymdToISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(day: number): number {
	return (((day + 4) % 7) + 7) % 7;
}

export function isWeekend(day: number): boolean {
	const w = dayOfWeek(day);
	return w === 0 || w === 6;
}

export function daysBetween(start: ISODate, end: ISODate): number {
	return toDayNumber(end) - toDayNumber(start);
}

export function addDays(date: ISODate, days: number): ISODate {
	return fromDayNumber(toDayNumber(date) + days);
}

/** Subtract whole years, clamping Feb 29 to Feb 28. */
export function subtractYears(date: ISODate, years: number): ISODate {
	const [y, m, d] = date.split('-').map(Number) as [number, number, number];
	const ty = y - years;
	return ymdToISO(ty, m, Math.min(d, daysInMonth(ty, m)));
}

export function subtractMonths(date: ISODate, months: number): ISODate {
	const [y, m, d] = date.split('-').map(Number) as [number, number, number];
	const total = y * 12 + (m - 1) - months;
	const ty = Math.floor(total / 12);
	const tm = (total % 12) + 1;
	return ymdToISO(ty, tm, Math.min(d, daysInMonth(ty, tm)));
}

/** Today's date in the user's local calendar. */
export function todayISO(now: Date = new Date()): ISODate {
	return ymdToISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

const berlinFormatter = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Europe/Berlin',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});

/** Calendar date of an instant in the Europe/Berlin timezone (exchange-local for Onvista). */
export function instantToBerlinDate(ms: number): ISODate {
	return berlinFormatter.format(new Date(ms));
}

/** Calendar date of an instant in UTC. */
export function instantToUTCDate(ms: number): ISODate {
	return new Date(ms).toISOString().slice(0, 10);
}

/** Unix timestamp in ms of an ISO date at 00:00 UTC (used for chart x-axes). */
export function toEpochSeconds(date: ISODate): number {
	return toDayNumber(date) * 86_400;
}
