import type { ISODate } from '#lib/domain/types.ts';
import { subtractMonths, subtractYears } from '#lib/core/dates.ts';

/** `max`: longest period all series cover (comparable); `all`: every series' full history. */
export type RangeKey = '1m' | '3m' | '6m' | 'ytd' | '1y' | '3y' | '5y' | '10y' | 'max' | 'all';

export const RANGES: Array<{ value: RangeKey; label: string }> = [
	{ value: '1m', label: '1M' },
	{ value: '3m', label: '3M' },
	{ value: '6m', label: '6M' },
	{ value: 'ytd', label: 'YTD' },
	{ value: '1y', label: '1Y' },
	{ value: '3y', label: '3Y' },
	{ value: '5y', label: '5Y' },
	{ value: '10y', label: '10Y' },
	{ value: 'max', label: 'Max' },
	{ value: 'all', label: 'All' }
];

export function rangeStart(key: RangeKey, end: ISODate): ISODate | null {
	switch (key) {
		case '1m':
			return subtractMonths(end, 1);
		case '3m':
			return subtractMonths(end, 3);
		case '6m':
			return subtractMonths(end, 6);
		case 'ytd':
			return `${end.slice(0, 4)}-01-01`;
		case 'max':
		case 'all':
			return null;
		default:
			return subtractYears(end, Number.parseInt(key, 10));
	}
}

/**
 * Ranges that fit into the common history (`first` = latest series start).
 * `all` is offered only when some series start earlier (`earliest`).
 */
export function availableRanges(first: ISODate | undefined, last: ISODate | undefined, earliest: ISODate | undefined = first): RangeKey[] {
	if (!first || !last) return ['max'];
	return RANGES.map((r) => r.value).filter((k) => {
		if (k === 'all') return !!earliest && earliest < first;
		const s = rangeStart(k, last);
		return s === null || s >= first;
	});
}
