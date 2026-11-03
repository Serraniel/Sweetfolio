import { describe, expect, it } from 'vitest';
import { series } from '#test/fixtures.ts';
import type { PricePoint } from '#lib/domain/types.ts';
import { exposure } from './exposure.ts';
import {
	bondIndex,
	buildProxy,
	cashIndex,
	convertLongRun,
	decodeSeries,
	extendWithProxy,
	leveragedIndex,
	proxyChain,
	spliceBackwards,
	type CrisisRates,
	type ProxyIndexData
} from './proxies.ts';

const flat = (start: string, days: number, value: number): PricePoint[] => series(start, days, 0, value);

describe('CR-3 proxy models', () => {
	it('decodes delta-encoded series', () => {
		expect(decodeSeries({ start: '2020-01-01', scale: 100, d: [0, 1, 3], v: [406, -6, 10] })).toEqual([
			{ date: '2020-01-01', close: 4.06 },
			{ date: '2020-01-02', close: 4 },
			{ date: '2020-01-05', close: 4.1 }
		]);
	});

	it('bond index earns the yield when yields are flat and loses about duration × Δy when they rise', () => {
		const flatYield = bondIndex(flat('2000-01-03', 261, 5), 10);
		const years = (Date.parse(flatYield.at(-1)!.date) - Date.parse(flatYield[0]!.date)) / (365.25 * 864e5);
		expect(flatYield.at(-1)!.close / 100 - 1).toBeCloseTo(0.05 * years, 2);
		const jump = bondIndex(
			[
				{ date: '2000-01-03', close: 5 },
				{ date: '2000-01-04', close: 6 }
			],
			10
		);
		// Modified duration of a 10y par bond at 5 % ≈ 7.8.
		expect(jump[1]!.close / 100 - 1).toBeLessThan(-0.07);
		expect(jump[1]!.close / 100 - 1).toBeGreaterThan(-0.08);
		const long = bondIndex(
			[
				{ date: '2000-01-03', close: 5 },
				{ date: '2000-01-04', close: 6 }
			],
			25
		);
		expect(long[1]!.close).toBeLessThan(jump[1]!.close);
	});

	it('cash index accrues the t-bill rate', () => {
		const c = cashIndex(flat('2000-01-03', 261, 3.6));
		expect(c.at(-1)!.close).toBeGreaterThan(103.5);
		expect(c.at(-1)!.close).toBeLessThan(103.8);
	});

	it('daily leverage doubles daily moves and decays in sideways markets', () => {
		const up = [
			{ date: '2020-01-01', close: 100 },
			{ date: '2020-01-02', close: 110 }
		];
		const rates = flat('2019-12-01', 60, 0);
		expect(leveragedIndex(up, 2, rates)[1]!.close).toBeCloseTo(120, 0);
		const zigzag = series('2020-01-01', 201, (i) => (i % 2 ? -0.05 : 0.05263157894736842));
		const lev = leveragedIndex(zigzag, 2, rates);
		expect(zigzag.at(-1)!.close).toBeCloseTo(100, 0);
		expect(lev.at(-1)!.close).toBeLessThan(80);
		expect(leveragedIndex(up, -1, rates)[1]!.close).toBeCloseTo(90, 0);
	});

	it('splices older data scaled to meet the recent series', () => {
		const recent = series('2020-01-06', 5, 0.01, 50);
		const older = series('2019-12-02', 40, 0.001, 1000);
		const s = spliceBackwards(recent, older);
		expect(s[0]!.date).toBe('2019-12-02');
		const at = s.findIndex((p) => p.date === '2020-01-06');
		expect(s[at]!.close).toBe(50);
		expect(s[at - 1]!.close / s[at]!.close).toBeCloseTo(1 / 1.001, 6);
	});

	it('converts USD to EUR with the long-run rate', () => {
		const usdeur = [
			{ date: '1973-01-01', close: 1.6 },
			{ date: '1974-01-01', close: 1.4 }
		];
		const r = convertLongRun(
			[
				{ date: '1973-06-01', close: 100 },
				{ date: '1974-06-01', close: 100 }
			],
			'USD',
			'EUR',
			usdeur
		)!;
		expect(r.map((p) => p.close)).toEqual([160, 140]);
		expect(convertLongRun([], 'USD', 'GBP', usdeur)).toBeNull();
	});
});

describe('CR-3 proxy chains', () => {
	it('picks sources by exposure', () => {
		expect(proxyChain(exposure('equity', { region: 'us', style: 'tech' })).map((s) => s.key)).toEqual(['nasdaq100', 'sp500']);
		expect(proxyChain(exposure('equity', { region: 'world' })).map((s) => s.key)).toEqual(['msciWorld', 'sp500']);
		expect(proxyChain(exposure('govBond', { region: 'us', maturity: 'long' }))).toEqual([
			{ key: 'bond:long', kind: 'bond', approximate: false }
		]);
		expect(proxyChain(exposure('corpBond'))[0]!.approximate).toBe(true);
		expect(proxyChain(exposure('crypto'))).toEqual([]);
	});

	it('chains sources newest first and records segments', () => {
		const indices = new Map<string, ProxyIndexData>([
			['msciWorld', { key: 'msciWorld', currency: 'USD', prices: series('1995-01-02', 300, 0.001), fetchedAt: '' }],
			['sp500', { key: 'sp500', currency: 'USD', prices: series('1990-01-01', 2000, 0.0005), fetchedAt: '' }]
		]);
		const rates: CrisisRates = {
			source: '',
			tbill: [],
			short: [],
			intermediate: [],
			long: [],
			usdeur: [{ date: '1950-01-01', close: 1 }]
		};
		const p = buildProxy(exposure('equity', { region: 'world' }), { rates, indices, currency: 'EUR', convert: () => null })!;
		expect(p.prices[0]!.date).toBe('1990-01-01');
		expect(p.segments.map((s) => [s.key, s.from, s.approximate])).toEqual([
			['sp500', '1990-01-01', true],
			['msciWorld', '1995-01-02', false]
		]);
		const real = series('1995-06-01', 100, 0.002);
		const ext = extendWithProxy(real, p);
		expect(ext.prices[0]!.date).toBe('1990-01-01');
		expect(ext.segments.at(-1)!.to).toBe('1995-06-01');
	});
});
