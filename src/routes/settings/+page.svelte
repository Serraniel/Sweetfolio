<script lang="ts">
	import { onMount } from 'svelte';
	import { COMMON_CURRENCIES, type BenchmarkRef, type ThemePreference } from '#lib/domain/types.ts';
	import { ECB_CURRENCIES } from '#lib/core/currency.ts';
	import { parsePriceCSV } from '#lib/parsers/price-csv.ts';
	import { exportPortfolioPerformanceCSV } from '#lib/io/pp-export.ts';
	import { buildAIExport } from '#lib/io/ai-export.ts';
	import { saveText, safeFileName } from '#lib/io/download.ts';
	import { request, viaProxy } from '#lib/fetchers/http.ts';
	import { testKey } from '#lib/fetchers/alphavantage.ts';
	import { todayISO } from '#lib/core/dates.ts';
	import { app } from '#lib/state/app.svelte.ts';
	import { jobs } from '#lib/state/jobs.svelte.ts';
	import { theme } from '#lib/state/theme.svelte.ts';
	import { notify } from '#lib/state/toasts.svelte.ts';
	import { connectParqet, disconnectParqet, parqetConfigured } from '#lib/state/parqet.svelte.ts';
	import { deleteDatabase } from '#lib/storage/db.ts';
	import { confirmAction } from '#lib/ui/confirm.svelte.ts';
	import * as fmt from '#lib/format.ts';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import Card from '#lib/ui/Card.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Toggle from '#lib/ui/Toggle.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';
	import Badge from '#lib/ui/Badge.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import FileDrop from '#lib/components/FileDrop.svelte';
	import FormatDialog from '#lib/components/FormatDialog.svelte';
	import ImportWizard from '#lib/components/ImportWizard.svelte';
	import ExportDialog from '#lib/components/ExportDialog.svelte';

	const s = $derived(app.settings);
	let themePref = $state<ThemePreference>(theme.preference);
	$effect(() => {
		if (themePref !== theme.preference) theme.set(themePref);
	});
	const currencies = $derived([...new Set([s.mainCurrency, ...COMMON_CURRENCIES, ...ECB_CURRENCIES, 'EUR'])].sort());

	// --- Calculations
	let rf = $state('');
	$effect(() => {
		rf = fmt.num(s.riskFreeRate, 4, 0);
	});
	async function saveRf() {
		const v = fmt.parseInput(rf);
		if (v === null || v < -5 || v > 100) {
			rf = fmt.num(s.riskFreeRate, 4, 0);
			notify.error('Enter a rate between −5 and 100 %.');
			return;
		}
		await app.updateSettings({ riskFreeRate: v });
	}
	async function setCurrency(c: string) {
		await app.updateSettings({ mainCurrency: c });
		void jobs.fetchCurrencyRates();
	}
	const benchValue = $derived(s.benchmark ? `${s.benchmark.type}:${s.benchmark.id}` : '');
	async function setBench(v: string) {
		const [type, id] = v.split(':') as [BenchmarkRef['type'], string];
		await app.updateSettings({ benchmark: v ? { type, id } : null });
	}

	// --- Data sources
	let avKey = $state('');
	let proxy = $state('');
	let avTest = $state<{ ok: boolean; msg: string } | null>(null);
	let proxyTest = $state<{ ok: boolean; msg: string } | null>(null);
	onMount(() => {
		avKey = s.alphaVantageApiKey;
		proxy = s.corsProxyUrl;
	});
	async function testAv() {
		avTest = null;
		try {
			await testKey(avKey.trim());
			avTest = { ok: true, msg: 'Connection works.' };
		} catch (e) {
			avTest = { ok: false, msg: e instanceof Error ? e.message : String(e) };
		}
	}
	async function testProxy() {
		proxyTest = null;
		try {
			await request(viaProxy('https://api.coingecko.com/api/v3/ping', proxy.trim()), { timeoutMs: 10_000 });
			proxyTest = { ok: true, msg: 'Proxy reachable.' };
		} catch (e) {
			proxyTest = { ok: false, msg: e instanceof Error ? e.message : String(e) };
		}
	}

	// --- Exchange rates (CU-3)
	let source = $state('USD');
	let target = $state('EUR');
	let rateFile = $state<{ name: string; text: string } | null>(null);
	let rateDialog = $state(false);
	const pairs = $derived([...app.currencies].sort((a, b) => a.pair.localeCompare(b.pair)));

	// --- Data
	let importOpen = $state(false);
	let exportOpen = $state(false);
	let ppSelection = $state<string[]>([]);
	let aiHistory = $state(false);
	let parqetAvailable = $state(false);
	const tracked = $derived(app.portfolios.filter((p) => p.mode !== 'model'));
	onMount(() => {
		parqetConfigured().then((v) => (parqetAvailable = v));
	});

	function exportPP() {
		const ps = tracked.filter((p) => ppSelection.includes(p.id));
		const files = exportPortfolioPerformanceCSV(ps, app.assets, app.transactions);
		const base = ps.length === 1 ? safeFileName(ps[0]!.name) : 'sweetfolio';
		saveText(`${base}-pp-portfolio-transactions.csv`, files.portfolioTransactions, 'text/csv');
		if (files.accountTransactions.trim().split('\n').length > 1)
			setTimeout(() => saveText(`${base}-pp-account-transactions.csv`, files.accountTransactions, 'text/csv'), 400);
	}

	function exportAI() {
		const data = buildAIExport(app.portfolios, app.assets, app.transactions, { includePriceHistory: aiHistory });
		saveText(`sweetfolio-ai-export-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');
	}

	async function clearAll() {
		const ok = await confirmAction({
			title: 'Delete all data',
			message:
				'This permanently deletes all assets, portfolios, strategies, transactions, exchange rates and settings stored in this browser.',
			confirmLabel: 'Delete everything',
			danger: true,
			typed: 'DELETE'
		});
		if (!ok) return;
		await app.clearAll();
		await deleteDatabase();
		location.href = '/';
	}
</script>

<PageHeader title="Settings" />

<div class="settings">
	<nav class="toc" aria-label="Settings sections">
		<a href="#appearance">Appearance</a><a href="#calculations">Calculations</a><a href="#sources">Data sources</a><a href="#currency"
			>Exchange rates</a
		><a href="#data">Data</a><a href="#about">About</a>
	</nav>
	<div class="stack" style="--gap: 20px">
		<section id="appearance">
			<Card title="Appearance">
				<Segmented
					bind:value={themePref}
					label="Theme"
					options={[
						{ value: 'system', label: 'System' },
						{ value: 'light', label: 'Light' },
						{ value: 'dark', label: 'Dark' }
					]}
				/>
			</Card>
		</section>

		<section id="calculations">
			<Card title="Calculations">
				<div class="grid" style="--min: 220px">
					<div>
						<label class="label" for="s-cur">Main currency</label>
						<select id="s-cur" class="select" value={s.mainCurrency} onchange={(e) => setCurrency(e.currentTarget.value)}>
							{#each currencies as c (c)}<option>{c}</option>{/each}
						</select>
						<p class="hint">All metrics, charts and simulations are shown in this currency.</p>
					</div>
					<div>
						<label class="label" for="s-rf">Risk-free rate</label>
						<div class="suffix-input">
							<input id="s-rf" class="input num" inputmode="decimal" bind:value={rf} onchange={saveRf} /><span>%</span>
						</div>
						<p class="hint">Used for the Sharpe ratio, e.g. the yield of short-term government bonds. 0 % keeps it simple.</p>
					</div>
					<div>
						<label class="label" for="s-bench">Benchmark</label>
						<select id="s-bench" class="select" value={benchValue} onchange={(e) => setBench(e.currentTarget.value)}>
							<option value="">None</option>
							<optgroup label="Assets"
								>{#each app.assets as a (a.id)}<option value="asset:{a.id}">{a.name}</option>{/each}</optgroup
							>
							<optgroup label="Portfolios"
								>{#each app.portfolios.filter((p) => p.allocations.length) as p (p.id)}<option value="portfolio:{p.id}">{p.name}</option
									>{/each}</optgroup
							>
						</select>
						<p class="hint">Overlaid on charts and marked on the efficient frontier.</p>
					</div>
				</div>
			</Card>
		</section>

		<section id="sources">
			<Card title="Data sources" subtitle="Price data is fetched directly from your browser — best effort.">
				<div class="stack" style="--gap: 4px">
					<Toggle
						checked={s.autoRefreshAssets}
						label="Refresh prices on startup"
						description="Update assets with ISIN/WKN that are older than 24 hours."
						onchange={(v) => app.updateSettings({ autoRefreshAssets: v })}
					/>
					<Toggle
						checked={s.autoImportMode}
						label="Auto-import CSV files"
						description="Import files with a clearly detected format without asking."
						onchange={(v) => app.updateSettings({ autoImportMode: v })}
					/>
					<Toggle
						checked={s.autoResolveNames}
						label="Resolve names from file names"
						description="Look up ISIN/WKN found in a file name to fill in name and currency."
						onchange={(v) => app.updateSettings({ autoResolveNames: v })}
					/>
				</div>
				<hr />
				<div class="grid" style="--min: 260px">
					<div>
						<label class="label" for="s-src">Primary source for ISIN/WKN</label>
						<select
							id="s-src"
							class="select"
							value={s.dataSourcePrimary}
							onchange={(e) => app.updateSettings({ dataSourcePrimary: e.currentTarget.value as 'onvista' | 'alphavantage' })}
						>
							<option value="onvista">Onvista (no key needed)</option>
							<option value="alphavantage" disabled={!s.alphaVantageApiKey}>Alpha Vantage</option>
						</select>
					</div>
					<div>
						<label class="label" for="s-av">Alpha Vantage API key</label>
						<div class="row nowrap">
							<input
								id="s-av"
								class="input mono"
								type="password"
								autocomplete="off"
								bind:value={avKey}
								onchange={() => app.updateSettings({ alphaVantageApiKey: avKey.trim() })}
							/><Button size="sm" onclick={testAv} disabled={!avKey.trim()}>Test</Button>
						</div>
						{#if avTest}<p class="small" class:pos={avTest.ok} class:neg={!avTest.ok}>{avTest.msg}</p>{/if}
						<p class="hint">Optional fallback. Free keys at alphavantage.co.</p>
					</div>
					<div>
						<label class="label" for="s-proxy">CORS proxy URL</label>
						<div class="row nowrap">
							<input
								id="s-proxy"
								class="input mono"
								placeholder="https://proxy.example/"
								bind:value={proxy}
								onchange={() => app.updateSettings({ corsProxyUrl: proxy.trim() })}
							/><Button size="sm" onclick={testProxy} disabled={!proxy.trim()}>Test</Button>
						</div>
						{#if proxyTest}<p class="small" class:pos={proxyTest.ok} class:neg={!proxyTest.ok}>{proxyTest.msg}</p>{/if}
						<p class="hint">
							Only needed for the CoinGecko crypto fallback. Use a proxy you trust; <code>{'{url}'}</code> placeholders are supported.
						</p>
					</div>
				</div>
			</Card>
		</section>

		<section id="currency">
			<Card title="Exchange rates">
				{#snippet actions()}<Button size="sm" icon="refresh" loading={jobs.fetchingRates} onclick={() => jobs.fetchCurrencyRates()}
						>Fetch from ECB</Button
					>{/snippet}
				<p class="small muted">
					Rates for your assets' currencies are fetched automatically from the European Central Bank. You can also upload your own history;
					your values win on overlapping dates.
				</p>
				{#if pairs.length}
					<ul class="pairs">
						{#each pairs as c (c.pair)}
							<li>
								<span class="mono strong">{c.pair.slice(0, 3)} → {c.pair.slice(3)}</span>
								<span class="xs muted"
									>{c.rates.length} rates · {fmt.date(c.rates[0]?.date)} – {fmt.date(c.rates.at(-1)?.date)} · last {fmt.num(
										c.rates.at(-1)?.rate,
										4
									)}</span
								>
								<button
									aria-label="Delete {c.pair}"
									onclick={async () =>
										(await confirmAction({
											title: 'Delete exchange rates',
											message: `Delete ${c.pair}?`,
											danger: true,
											confirmLabel: 'Delete'
										})) && app.deleteCurrency(c.pair)}><Icon name="trash" size={16} /></button
								>
							</li>
						{/each}
					</ul>
				{/if}
				<div class="upload">
					<div class="row nowrap">
						<select class="select" bind:value={source} aria-label="Source currency"
							>{#each currencies as c (c)}<option>{c}</option>{/each}</select
						>
						<span class="muted">→</span>
						<select class="select" bind:value={target} aria-label="Target currency"
							>{#each currencies as c (c)}<option>{c}</option>{/each}</select
						>
					</div>
					<p class="hint">CSV with date and rate: how many {target} one {source} is worth.</p>
					<FileDrop
						multiple={false}
						label="Upload rate CSV"
						onfiles={async (f) => {
							rateFile = { name: f[0]!.name, text: await f[0]!.text() };
							rateDialog = true;
						}}
					/>
				</div>
			</Card>
		</section>

		<section id="data">
			<Card title="Data" subtitle="Everything is stored in this browser only.">
				<div class="data-grid">
					<div class="data-item">
						<h3>Backup</h3>
						<p class="small muted">Export everything to a file, or restore/merge a backup.</p>
						<div class="row">
							<Button icon="download" onclick={() => (exportOpen = true)}>Export</Button><Button
								icon="upload"
								onclick={() => (importOpen = true)}>Import</Button
							>
						</div>
						<p class="xs muted">
							Import also reads Portfolio Performance XML, Parqet CSV and broker CSVs (Trade Republic, Scalable Capital, ING).
						</p>
					</div>
					<div class="data-item">
						<h3>Export for Portfolio Performance</h3>
						<p class="small muted">CSV files for PP's “File › Import › CSV files” (portfolio and account transactions).</p>
						{#if tracked.length}
							<div class="checks">
								{#each tracked as p (p.id)}<label class="row small"
										><input
											type="checkbox"
											checked={ppSelection.includes(p.id)}
											onchange={(e) =>
												(ppSelection = e.currentTarget.checked ? [...ppSelection, p.id] : ppSelection.filter((x) => x !== p.id))}
										/>{p.name}</label
									>{/each}
							</div>
							<Button icon="download" disabled={!ppSelection.length} onclick={exportPP}>Export CSV</Button>
						{:else}<p class="xs muted">No tracked portfolios yet.</p>{/if}
					</div>
					<div class="data-item">
						<h3>AI export</h3>
						<p class="small muted">
							Self-describing JSON for AI assistants, readable by the bundled MCP server (<code>tools/mcp-server</code>).
						</p>
						<label class="row small"><input type="checkbox" bind:checked={aiHistory} />Include full price history</label>
						<Button icon="download" onclick={exportAI}>Download AI export</Button>
					</div>
					<div class="data-item">
						<h3>Parqet</h3>
						{#if s.parqetTokens}
							<p class="small"><Badge tone="accent">Connected</Badge></p>
							<div class="row">
								<Button href="/tools/parqet-to-pp" icon="tools">Open Parqet tools</Button><Button variant="ghost" onclick={disconnectParqet}
									>Disconnect</Button
								>
							</div>
						{:else if parqetAvailable}
							<p class="small muted">Import portfolios and activities from your Parqet account (read-only).</p>
							<Button icon="link" onclick={() => connectParqet('/settings#data').catch((e) => notify.error(e.message))}
								>Connect Parqet</Button
							>
						{:else}
							<p class="small muted">
								Not configured on this instance. Self-hosters can set <code>parqetClientId</code> in <code>config.json</code>.
							</p>
						{/if}
					</div>
				</div>
				<hr />
				<div class="spread danger-zone">
					<div>
						<h3>Delete all data</h3>
						<p class="small muted">Removes everything Sweetfolio stored in this browser.</p>
					</div>
					<Button variant="danger" icon="trash" onclick={clearAll}>Delete all data</Button>
				</div>
			</Card>
		</section>

		<section id="about">
			<Card title="About">
				<p class="small">
					Sweetfolio <b>v{__APP_VERSION__}</b> — free software under the EUPL-1.2. No tracking, no server; your data never leaves your device.
				</p>
				<div class="row links small">
					<a href="/changelog">Changelog</a><a href="/license">License</a><a href="/licenses">Third-party notices</a><a
						href="https://github.com/Serraniel/Sweetfolio"
						rel="noopener"
						target="_blank">Source code</a
					>
				</div>
			</Card>
		</section>
	</div>
</div>

{#if rateFile}
	<FormatDialog
		bind:open={rateDialog}
		text={rateFile.text}
		fileName={rateFile.name}
		showMeta={false}
		title="Import {source} → {target} rates"
		onconfirm={async ({ result }) => {
			if (source === target) return notify.error('Source and target currency must differ.');
			const pair = source + target;
			const existing = app.currencies.find((c) => c.pair === pair);
			const map = new Map((existing?.rates ?? []).map((r) => [r.date, r.rate]));
			for (const p of result.prices) if (p.close > 0) map.set(p.date, p.close);
			await app.saveCurrencies([
				{ pair, rates: [...map.entries()].map(([date, rate]) => ({ date, rate })).sort((a, b) => (a.date < b.date ? -1 : 1)) }
			]);
			notify.success(`Imported ${result.prices.length} rates for ${pair}`);
		}}
	/>
{/if}
<ImportWizard bind:open={importOpen} />
<ExportDialog bind:open={exportOpen} />

<style>
	.settings {
		display: grid;
		gap: var(--space-4);
	}
	@media (min-width: 1100px) {
		.settings {
			grid-template-columns: 180px minmax(0, 1fr);
			align-items: start;
		}
		.toc {
			position: sticky;
			top: var(--space-6);
			display: grid !important;
			gap: 2px;
		}
	}
	.toc {
		display: none;
	}
	.toc a {
		padding: 8px 12px;
		border-radius: var(--radius-sm);
		color: var(--text-2);
		font-size: var(--text-sm);
		font-weight: 550;
	}
	.toc a:hover {
		background: var(--accent-soft);
		color: var(--accent);
		text-decoration: none;
	}
	section {
		scroll-margin-top: calc(var(--header-height) + 16px);
	}
	hr {
		border: none;
		border-top: 1px solid var(--border);
		margin: var(--space-4) 0;
	}
	.nowrap {
		flex-wrap: nowrap;
	}
	.suffix-input {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.pairs {
		list-style: none;
		margin: var(--space-3) 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	.pairs li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 12px;
		align-items: center;
		padding: 8px 10px;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
	}
	.pairs button {
		border: none;
		background: none;
		color: var(--muted);
		display: grid;
	}
	.strong {
		font-weight: 600;
	}
	.upload {
		display: grid;
		gap: 8px;
		margin-top: var(--space-3);
	}
	.data-grid {
		display: grid;
		gap: var(--space-4);
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
	}
	.data-item {
		display: grid;
		gap: 10px;
		align-content: start;
		padding: var(--space-4);
		border-radius: var(--radius);
		background: var(--surface-2);
	}
	.checks {
		display: grid;
		gap: 6px;
	}
	.links {
		margin-top: var(--space-3);
		--gap: 16px;
	}
	code {
		font-family: var(--mono);
		font-size: 0.9em;
	}
</style>
