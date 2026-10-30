/**
 * Background jobs: asset auto refresh (SC-5), ECB currency fetch (CU-4) and
 * one-time data migrations (SC-6, PM-6, ECB rate direction fix).
 */
import type { Asset, CurrencyRate } from '#lib/domain/types.ts';
import { deriveCrossRate, mergeRates, neededEcbPairs } from '#lib/core/currency.ts';
import { mergePrices, type PriceConflict } from '#lib/core/price-merge.ts';
import { fetchEurRate } from '#lib/fetchers/ecb.ts';
import { fetchSecurity, onvista } from '#lib/fetchers/market-data.ts';
import { app } from './app.svelte.ts';
import { notify } from './toasts.svelte.ts';
import * as fmt from '#lib/format.ts';

const STALE_MS = 24 * 60 * 60 * 1000;

export interface AssetConflicts {
	assetId: string;
	assetName: string;
	conflicts: PriceConflict[];
}

class Jobs {
	refreshing = $state(false);
	fetchingRates = $state(false);
	conflicts = $state.raw<AssetConflicts[]>([]);

	isStale(a: Asset, now = Date.now()): boolean {
		if (!a.isin && !a.wkn) return false;
		return !a.lastRefreshedAt || now - Date.parse(a.lastRefreshedAt) > STALE_MS;
	}

	/** Refresh assets from market data. `force` ignores the 24 h staleness rule. */
	async refreshAssets(assets: Asset[] = app.assets.filter((a) => this.isStale(a)), options: { silent?: boolean } = {}) {
		if (this.refreshing || assets.length === 0) return;
		this.refreshing = true;
		const id = 'refresh';
		if (!options.silent || assets.length > 0) notify.startTask(id, 'Updating prices', assets.length);
		const errors: string[] = [];
		const found: AssetConflicts[] = [];
		let updated = 0;
		try {
			for (const [i, asset] of assets.entries()) {
				notify.updateTask(id, { current: i + 1, detail: asset.name });
				const outcome = await fetchSecurity(asset.isin ?? asset.wkn ?? '', app.settings);
				if (!outcome.ok) {
					errors.push(`${asset.name}: ${outcome.error}`);
					continue;
				}
				const latest = app.assetById.get(asset.id) ?? asset;
				const merge = mergePrices(latest.prices, outcome.data.prices);
				if (merge.conflicts.length) found.push({ assetId: asset.id, assetName: asset.name, conflicts: merge.conflicts });
				const cls =
					latest.classification === 'unknown' && outcome.data.classification ? outcome.data.classification : latest.classification;
				await app.saveAsset({
					...latest,
					prices: merge.merged,
					classification: cls,
					lastRefreshedAt: new Date().toISOString(),
					updatedAt: merge.addedCount ? new Date().toISOString() : latest.updatedAt
				});
				if (merge.addedCount) updated++;
			}
		} finally {
			this.refreshing = false;
			this.conflicts = [...this.conflicts.filter((c) => !found.some((f) => f.assetId === c.assetId)), ...found];
			notify.finishTask(id, updated ? `${updated} asset${updated === 1 ? '' : 's'} updated` : 'Prices are up to date', errors);
		}
		void this.fetchCurrencyRates();
	}

	async resolveConflicts(assetId: string, useFetched: Map<string, number>) {
		const asset = app.assetById.get(assetId);
		if (asset && useFetched.size) {
			await app.saveAsset({
				...asset,
				prices: asset.prices.map((p) => (useFetched.has(p.date) ? { date: p.date, close: useFetched.get(p.date)! } : p)),
				updatedAt: new Date().toISOString()
			});
		}
		this.conflicts = this.conflicts.filter((c) => c.assetId !== assetId);
	}

	/** Currencies used by assets and transactions. */
	usedCurrencies(): string[] {
		return [
			...new Set([
				...app.assets.map((a) => a.currency),
				...app.transactions.map((t) => t.currency),
				...app.portfolios.filter((p) => p.mode !== 'model').map((p) => p.cashCurrency)
			])
		];
	}

	/** `manual`: started from the button, so also report when there is nothing to do. */
	async fetchCurrencyRates(opts: { manual?: boolean } = {}) {
		if (this.fetchingRates) return;
		const main = app.settings.mainCurrency;
		const pairs = neededEcbPairs(this.usedCurrencies(), main);
		if (!pairs.length) {
			if (opts.manual)
				notify.show(`No exchange rates needed: all assets, transactions and cash accounts are in ${main} or have no ECB rates.`);
			return;
		}
		this.fetchingRates = true;
		const id = 'rates';
		notify.startTask(id, 'Fetching exchange rates', pairs.length);
		const errors: string[] = [];
		const fetched = new Map<string, CurrencyRate>();
		let added = 0;
		try {
			for (const [i, pair] of pairs.entries()) {
				notify.updateTask(id, { current: i + 1, detail: pair.slice(0, 3) });
				try {
					const existing = app.currencies.find((c) => c.pair === pair);
					const last = existing?.rates.at(-1)?.date;
					const rate = await fetchEurRate(pair.slice(0, 3), last);
					const merged = mergeRates(existing, rate);
					added += merged.rates.length - (existing?.rates.length ?? 0);
					fetched.set(pair, merged);
					await app.saveCurrencies([merged]);
				} catch (err) {
					errors.push(`${pair.slice(0, 3)}: ${err instanceof Error ? err.message : String(err)}`);
				}
			}
			if (main !== 'EUR') {
				const mainEur = fetched.get(`${main}EUR`) ?? app.currencies.find((c) => c.pair === `${main}EUR`);
				if (mainEur?.rates.length) {
					const cross: CurrencyRate[] = [];
					for (const [pair, eur] of fetched) {
						const ccy = pair.slice(0, 3);
						if (ccy === main) continue;
						const crossPair = `${ccy}${main}`;
						cross.push(
							mergeRates(
								app.currencies.find((c) => c.pair === crossPair),
								deriveCrossRate(eur, mainEur, crossPair)
							)
						);
					}
					// EUR itself → main currency is the inverse of MAINEUR and handled by inverse lookup.
					await app.saveCurrencies(cross);
				}
			}
		} finally {
			this.fetchingRates = false;
			const codes = pairs.map((p) => p.slice(0, 3)).join(', ');
			notify.finishTask(
				id,
				errors.length
					? undefined
					: added
						? `Exchange rates updated: ${fmt.num(added, 0)} new rates (${codes})`
						: `Exchange rates are up to date (${codes})`,
				errors
			);
		}
	}

	async runMigrations() {
		const done = new Set(app.settings.completedMigrations);
		for (const m of MIGRATIONS) {
			if (done.has(m.id)) continue;
			try {
				const ok = await m.run();
				if (ok) await app.updateSettings({ completedMigrations: [...app.settings.completedMigrations, m.id] });
			} catch (err) {
				notify.error(`${m.label} failed: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	}

	/** Startup sequence after the data has loaded. */
	async startup() {
		await this.runMigrations();
		if (app.settings.autoRefreshAssets) await this.refreshAssets(undefined, { silent: true });
		else await this.fetchCurrencyRates();
	}
}

export const jobs = new Jobs();

interface Migration {
	id: string;
	label: string;
	/** Return false to retry on the next start (e.g. offline). */
	run: () => Promise<boolean>;
}

const MIGRATIONS: Migration[] = [
	{
		id: 'strip-zero-allocations-v1',
		label: 'Removing zero-weight allocations',
		async run() {
			const affected = app.portfolios.filter((p) => p.allocations.some((a) => !(a.weight > 0)));
			if (affected.length)
				await app.savePortfolios(affected.map((p) => ({ ...p, allocations: p.allocations.filter((a) => a.weight > 0) })));
			return true;
		}
	},
	{
		id: 'fix-ecb-rate-direction-v1',
		label: 'Repairing exchange rates',
		async run() {
			// v0.5 stored ECB quotes (CCY per EUR) under the pair CCYEUR, i.e. inverted.
			// Entries that equal the raw ECB quote are replaced by the correct value;
			// cross rates derived from them are dropped and re-derived.
			const candidates = app.currencies.filter((c) => /^[A-Z]{3}EUR$/.test(c.pair) && c.pair !== 'EUREUR');
			const crossCandidates = app.currencies.filter((c) => /^[A-Z]{6}$/.test(c.pair) && !c.pair.includes('EUR'));
			if (!candidates.length && !crossCandidates.length) return true;
			const fixed: CurrencyRate[] = [];
			const correct = new Map<string, Map<string, number>>();
			for (const c of candidates) {
				let fresh: CurrencyRate;
				try {
					fresh = await fetchEurRate(c.pair.slice(0, 3), c.rates[0]?.date);
				} catch {
					return false;
				}
				const good = new Map(fresh.rates.map((r) => [r.date, r.rate]));
				correct.set(c.pair, good);
				let changed = false;
				const rates = c.rates.map((r) => {
					const g = good.get(r.date);
					if (g && Math.abs(r.rate * g - 1) < 1e-6 && Math.abs(g - 1) > 1e-6) {
						changed = true;
						return { date: r.date, rate: g };
					}
					return r;
				});
				if (changed) fixed.push({ pair: c.pair, rates });
			}
			for (const c of crossCandidates) {
				const a = correct.get(`${c.pair.slice(0, 3)}EUR`);
				const b = correct.get(`${c.pair.slice(3)}EUR`);
				if (!a || !b) continue;
				let changed = false;
				const rates = c.rates.map((r) => {
					const x = a.get(r.date);
					const y = b.get(r.date);
					if (!x || !y) return r;
					const right = x / y;
					if (Math.abs(r.rate * right - 1) < 1e-6 && Math.abs(right - 1) > 1e-6) {
						changed = true;
						return { date: r.date, rate: right };
					}
					return r;
				});
				if (changed) fixed.push({ pair: c.pair, rates });
			}
			if (fixed.length) {
				await app.saveCurrencies(fixed);
				notify.show(`Corrected ${fixed.length} exchange rate series (they were stored inverted by an earlier version).`, 'info', {
					timeout: 8000
				});
			}
			return true;
		}
	},
	{
		id: 'classify-assets-v1',
		label: 'Classifying assets',
		async run() {
			const todo = app.assets.filter((a) => a.classification === 'unknown' && (a.isin || a.wkn));
			if (!todo.length) return true;
			const task = 'classify';
			notify.startTask(task, 'Classifying assets', todo.length);
			let changed = 0;
			for (const [i, a] of todo.entries()) {
				notify.updateTask(task, { current: i + 1, detail: a.name });
				const info = await jobsInfo(a.isin ?? a.wkn!);
				if (info?.classification && info.classification !== 'unknown') {
					const latest = app.assetById.get(a.id);
					if (latest) await app.saveAsset({ ...latest, classification: info.classification });
					changed++;
				}
			}
			notify.finishTask(task, `${changed} asset${changed === 1 ? '' : 's'} classified`);
			return true;
		}
	}
];

async function jobsInfo(id: string) {
	try {
		return await onvista.lookupInfo(id);
	} catch {
		return null;
	}
}
