import { describe, expect, it } from 'vitest';
import snapshots from '#test/onvista-snapshots.json' with { type: 'json' };
import { exposureFromSnapshot, guessExposure, leverageFromText, mergeExposure, exposure } from './exposure.ts';
import type { ExposureSnapshot } from './exposure.ts';

const snap = (isin: string) => exposureFromSnapshot((snapshots as Record<string, ExposureSnapshot>)[isin]!);

describe('CR-1 exposure from Onvista snapshots', () => {
	it.each([
		['IE00B3RBWM25', { assetClass: 'equity', region: 'world', style: 'broad', leverage: 1 }],
		['FR0010755611', { assetClass: 'equity', region: 'us', leverage: 2 }],
		['IE00BSKRJZ44', { assetClass: 'govBond', region: 'us', maturity: 'long' }],
		['IE00B1FZS798', { assetClass: 'govBond', region: 'us', maturity: 'intermediate' }],
		['DE000A0S9GB0', { assetClass: 'gold', leverage: 1 }],
		['DE000A27Z304', { assetClass: 'crypto' }],
		['IE00B5BMR087', { assetClass: 'equity', region: 'us', style: 'broad' }],
		['IE00B53SZB19', { assetClass: 'equity', region: 'us', style: 'tech' }],
		['DE000A0F5UF5', { assetClass: 'equity', region: 'us', style: 'tech' }],
		['IE00BKM4GZ66', { assetClass: 'equity', region: 'emerging' }],
		['IE00B3F81R35', { assetClass: 'corpBond', region: 'europe' }],
		['IE00BZ163G84', { assetClass: 'corpBond', region: 'europe' }],
		['US0378331005', { assetClass: 'equity', region: 'us' }],
		['LU0274208692', { assetClass: 'equity', region: 'world' }],
		['IE00B4L5Y983', { assetClass: 'equity', region: 'world' }],
		['IE00BYZK4552', { assetClass: 'equity', style: 'tech' }]
	])('%s', (isin, expected) => {
		expect(snap(isin)).toMatchObject({ ...expected, source: 'auto' });
	});
});

describe('CR-1 leverage and guesses', () => {
	it('parses leverage factors', () => {
		expect(leverageFromText('MSCI USA LEVERAGED 2X DAILY')).toBe(2);
		expect(leverageFromText('WISDOMTREE NASDAQ 100 3X DAILY LEVERAGED')).toBe(3);
		expect(leverageFromText('LYXOR DAILY SHORTDAX X2')).toBe(-2);
		expect(leverageFromText('S&P 500 3X SHORT DAILY')).toBe(-3);
		expect(leverageFromText('ISHARES CORE MSCI WORLD')).toBe(1);
		expect(leverageFromText('ICE US TREASURY 20+ YEAR INDEX')).toBe(1);
	});

	it('guesses from names and marks the guess', () => {
		expect(guessExposure({ name: 'Xetra Gold', classification: 'etc' })).toMatchObject({ assetClass: 'gold', source: 'guess' });
		expect(guessExposure({ name: 'Amundi MSCI World', classification: 'etf' })).toMatchObject({ assetClass: 'equity', region: 'world' });
		expect(guessExposure({ name: 'Bitcoin', classification: 'crypto' })).toMatchObject({ assetClass: 'crypto' });
		expect(guessExposure({ name: 'Alpha', classification: 'unknown' })).toMatchObject({ assetClass: 'unknown' });
	});

	it('keeps manual exposures when refreshed', () => {
		const manual = exposure('gold', { source: 'manual' });
		expect(mergeExposure(manual, exposure('equity'))).toBe(manual);
		expect(mergeExposure(exposure('equity', { source: 'guess' }), exposure('gold'))!.assetClass).toBe('gold');
		expect(mergeExposure(exposure('gold'), null)!.assetClass).toBe('gold');
	});
});
