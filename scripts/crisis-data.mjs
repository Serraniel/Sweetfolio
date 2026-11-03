#!/usr/bin/env node
/**
 * Builds static/data/crisis-rates.json for the crisis tester (CR-3) from
 * public-domain FRED series (Board of Governors of the Federal Reserve System):
 *   node scripts/crisis-data.mjs
 *
 * Series (yields and rates in percent, FX in EUR per USD):
 *   tbill        DTB3                    3-month treasury bill, 1954+
 *   short        DGS2, before 1976 DGS1  2-year (1-year) treasury
 *   intermediate DGS10                   10-year treasury, 1962+
 *   long         DGS30, gaps DGS20, then DGS10
 *   usdeur       DEXUSEU (1999+); before: EXGEUS (DEM per USD, monthly, 1971–2001) / 1.95583;
 *                before 1971 the Bretton Woods parities
 *
 * Each series is stored as { start, d: day deltas, v: value deltas } with
 * values scaled to integers (yields × 100, FX × 10000) so the file stays small.
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const FRED = (id) => `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`;
const DEM_PER_EUR = 1.95583;

async function fred(id) {
	const res = await fetch(FRED(id));
	if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
	const text = await res.text();
	const map = new Map();
	for (const line of text.trim().split('\n').slice(1)) {
		const [date, value] = line.split(',');
		const v = Number(value);
		if (/^\d{4}-\d{2}-\d{2}$/.test(date) && value !== '' && value !== '.' && Number.isFinite(v)) map.set(date, v);
	}
	if (map.size === 0) throw new Error(`${id}: no data`);
	return map;
}

/** First series that has a value on a date wins. */
function chain(...maps) {
	const dates = [...new Set(maps.flatMap((m) => [...m.keys()]))].sort();
	const out = new Map();
	for (const d of dates) {
		const m = maps.find((x) => x.has(d));
		if (m) out.set(d, m.get(d));
	}
	return out;
}

const day = (iso) => Math.round(Date.parse(iso + 'T00:00:00Z') / 864e5);

function encode(map, scale) {
	const entries = [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
	const d = [];
	const v = [];
	let prevDay = day(entries[0][0]);
	let prevValue = 0;
	for (const [date, value] of entries) {
		const n = day(date);
		const scaled = Math.round(value * scale);
		d.push(n - prevDay);
		v.push(scaled - prevValue);
		prevDay = n;
		prevValue = scaled;
	}
	return { start: entries[0][0], scale, d, v };
}

function usdEur(exgeus, dexuseu) {
	const out = new Map();
	// Bretton Woods parities (DEM per USD) until FRED's monthly series starts in 1971.
	const parities = [
		['1950-01-02', 4.2],
		['1961-03-06', 4.0],
		['1969-10-27', 3.66]
	];
	for (const [date, dem] of parities) out.set(date, dem / DEM_PER_EUR);
	for (const [date, dem] of exgeus) if (date < '1999-01-04') out.set(date, dem / DEM_PER_EUR);
	for (const [date, usdPerEur] of dexuseu) out.set(date, 1 / usdPerEur);
	return out;
}

const [dtb3, dgs1, dgs2, dgs10, dgs20, dgs30, exgeus, dexuseu] = await Promise.all(
	['DTB3', 'DGS1', 'DGS2', 'DGS10', 'DGS20', 'DGS30', 'EXGEUS', 'DEXUSEU'].map(fred)
);

const data = {
	source: 'FRED, Federal Reserve Bank of St. Louis; series DTB3, DGS1, DGS2, DGS10, DGS20, DGS30, EXGEUS, DEXUSEU (public domain)',
	generated: new Date().toISOString().slice(0, 10),
	series: {
		tbill: encode(dtb3, 100),
		short: encode(chain(dgs2, dgs1), 100),
		intermediate: encode(dgs10, 100),
		long: encode(chain(dgs30, dgs20, dgs10), 100),
		usdeur: encode(usdEur(exgeus, dexuseu), 10000)
	}
};

mkdirSync('static/data', { recursive: true });
const json = JSON.stringify(data);
writeFileSync('static/data/crisis-rates.json', json + '\n');
console.log(`static/data/crisis-rates.json: ${(json.length / 1024).toFixed(0)} KiB`);
for (const [k, s] of Object.entries(data.series)) console.log(`  ${k}: ${s.start}, ${s.d.length} points`);
