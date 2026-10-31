import { describe, expect, it } from 'vitest';
import {
	addDays,
	dayOfWeek,
	daysBetween,
	fromDayNumber,
	instantToBerlinDate,
	isISODate,
	isValidYMD,
	subtractMonths,
	subtractYears,
	toDayNumber
} from './dates.ts';

describe('dates (timezone-safe)', () => {
	it('round-trips day numbers', () => {
		expect(toDayNumber('1970-01-01')).toBe(0);
		expect(fromDayNumber(toDayNumber('2024-02-29'))).toBe('2024-02-29');
	});
	it('computes weekdays independent of local timezone', () => {
		expect(dayOfWeek(toDayNumber('2024-06-01'))).toBe(6); // Saturday
		expect(dayOfWeek(toDayNumber('2024-06-03'))).toBe(1); // Monday
	});
	it('validates calendar dates', () => {
		expect(isValidYMD(2024, 2, 29)).toBe(true);
		expect(isValidYMD(2023, 2, 29)).toBe(false);
		expect(isValidYMD(2023, 4, 31)).toBe(false);
		expect(isISODate('2023-02-31')).toBe(false);
	});
	it('does date arithmetic', () => {
		expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366);
		expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
		expect(subtractYears('2024-02-29', 1)).toBe('2023-02-28');
		expect(subtractMonths('2024-03-31', 1)).toBe('2024-02-29');
		expect(subtractMonths('2024-01-15', 13)).toBe('2022-12-15');
	});
	it('maps exchange timestamps to Berlin calendar dates (SC-1)', () => {
		// Midnight CET is 23:00 UTC on the previous day.
		expect(instantToBerlinDate(Date.UTC(2024, 0, 14, 23, 0))).toBe('2024-01-15');
		// Midnight UTC is still the same day in Berlin.
		expect(instantToBerlinDate(Date.UTC(2024, 0, 15, 0, 0))).toBe('2024-01-15');
	});
});
