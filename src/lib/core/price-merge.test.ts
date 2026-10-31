import { describe, expect, it } from 'vitest';
import { applyPriceResolutions, mergePrices } from './price-merge.ts';

describe('SC-5 price merge', () => {
	it('adds new dates and reports >1 % deviations as conflicts', () => {
		const r = mergePrices(
			[
				{ date: '2024-01-01', close: 100 },
				{ date: '2024-01-02', close: 100 }
			],
			[
				{ date: '2024-01-02', close: 105 },
				{ date: '2024-01-01', close: 100.5 },
				{ date: '2024-01-03', close: 101 }
			]
		);
		expect(r.addedCount).toBe(1);
		expect(r.conflicts).toEqual([{ date: '2024-01-02', existingClose: 100, fetchedClose: 105 }]);
		expect(r.merged.map((p) => p.close)).toEqual([100, 100, 101]);
		expect(applyPriceResolutions(r.merged, new Map([['2024-01-02', 105]]))[1]!.close).toBe(105);
	});
});
