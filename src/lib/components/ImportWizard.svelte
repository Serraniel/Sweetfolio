<script lang="ts">
	/**
	 * Import wizard (DP-3, EX-4): backup files and external transaction files go
	 * through the same review/conflict/apply flow.
	 */
	import type { Portfolio } from '#lib/domain/types.ts';
	import { parseBackup, ALL_SCOPES, type Scope, type ExportData } from '#lib/io/schema.ts';
	import { countReport, detectConflicts, itemsToWrite, type ImportReport, type Resolution } from '#lib/io/conflicts.ts';
	import { mapExternalImport } from '#lib/io/external-mapping.ts';
	import { parsePortfolioPerformanceXML } from '#lib/parsers/portfolio-performance.ts';
	import { looksLikeTransactionCSV, parseTransactionCSV } from '#lib/parsers/transactions-csv.ts';
	import { SOURCE_LABELS, type ExternalImport } from '#lib/parsers/external.ts';
	import { getAll } from '#lib/storage/repo.ts';
	import { app } from '#lib/state/app.svelte.ts';
	import { jobs } from '#lib/state/jobs.svelte.ts';
	import { notify } from '#lib/state/toasts.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Badge from '#lib/ui/Badge.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import FileDrop from './FileDrop.svelte';

	let {
		open = $bindable(false),
		targetPortfolio = null,
		external = null
	}: { open?: boolean; targetPortfolio?: Portfolio | null; external?: ExternalImport | null } = $props();

	type Step = 'file' | 'options' | 'review' | 'done';
	let step = $state<Step>('file');
	let error = $state<string | null>(null);
	let kind = $state<'backup' | 'external' | null>(null);
	let fileName = $state('');
	let backupData = $state.raw<ExportData | null>(null);
	let ext = $state.raw<ExternalImport | null>(null);
	let scopes = $state<Scope[]>([]);
	let into = $state<'new' | string>('new');
	let portfolioName = $state('');
	let report = $state<ImportReport | null>(null);
	let busy = $state(false);
	let summary = $state('');

	const SCOPE_LABELS: Record<Scope, string> = {
		assets: 'Assets',
		portfolios: 'Portfolios',
		strategies: 'Strategies',
		transactions: 'Transactions',
		settings: 'Settings',
		currencies: 'Exchange rates',
		simulations: 'Simulations'
	};
	const trackedPortfolios = $derived(app.portfolios.filter((p) => p.mode !== 'model'));

	$effect(() => {
		if (!open) return;
		step = 'file';
		error = null;
		kind = null;
		report = null;
		into = targetPortfolio?.id ?? 'new';
		if (external) useExternal(external, 'Parqet');
	});

	function useExternal(e: ExternalImport, name: string) {
		if (!e.transactions.length) {
			error = e.warnings[0] ?? 'No transactions found in this file.';
			return;
		}
		ext = e;
		kind = 'external';
		portfolioName =
			e.portfolios[0]?.name && e.portfolios[0].name !== 'Imported portfolio' ? e.portfolios[0].name : name.replace(/\.[^.]+$/, '');
		step = 'options';
	}

	async function onFile(files: File[]) {
		const file = files[0];
		if (!file) return;
		error = null;
		fileName = file.name;
		try {
			const text = await file.text();
			const head = text.slice(0, 2000).trimStart();
			if (head.startsWith('{')) {
				const backup = parseBackup(text);
				backupData = backup.data;
				kind = 'backup';
				scopes = ALL_SCOPES.filter((s) =>
					s === 'settings' ? !!backup.data.settings && Object.keys(backup.data.settings).length : (backup.data[s]?.length ?? 0) > 0
				);
				step = 'options';
			} else if (head.startsWith('<')) {
				useExternal(parsePortfolioPerformanceXML(text), file.name);
			} else if (looksLikeTransactionCSV(text)) {
				useExternal(parseTransactionCSV(text, file.name.replace(/\.[^.]+$/, '')), file.name);
			} else {
				error =
					'Unrecognized file. Supported: Sweetfolio backup (.json), Portfolio Performance (.xml), Parqet or broker transactions (.csv). For price histories use the Assets page.';
			}
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	async function review() {
		busy = true;
		try {
			let data: ExportData;
			let useScopes: Scope[];
			if (kind === 'backup') {
				data = backupData!;
				useScopes = scopes;
			} else {
				const e = ext!;
				const single = e.portfolios.length <= 1;
				const mapped = mapExternalImport(
					single && into === 'new' ? { ...e, portfolios: e.portfolios.map((p) => ({ ...p, name: portfolioName || p.name })) } : e,
					{
						existingAssets: app.assets,
						targetPortfolioId: into === 'new' ? null : into
					}
				);
				data = mapped.data;
				useScopes = ['assets', 'portfolios', 'transactions'];
			}
			const simulations = await getAll('simulations');
			report = detectConflicts(
				data,
				{
					assets: app.assets,
					portfolios: app.portfolios,
					strategies: app.strategies,
					transactions: app.transactions,
					currencies: app.currencies,
					simulations,
					settings: { ...app.settings }
				},
				useScopes
			);
			step = 'review';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	function setAll(scope: Scope, r: Resolution) {
		if (!report) return;
		report[scope].conflicts.forEach((c) => (c.resolution = r));
	}

	async function apply() {
		if (!report) return;
		busy = true;
		try {
			const items = itemsToWrite($state.snapshot(report) as ImportReport);
			await app.applyImport(items);
			const counts = countReport(report);
			const replaced = ALL_SCOPES.reduce((s, sc) => s + report![sc].conflicts.filter((c) => c.resolution === 'replace').length, 0);
			summary = `${counts.added} added, ${replaced} replaced, ${counts.unchanged} unchanged.`;
			step = 'done';
			notify.success(`Import complete: ${summary}`);
			const needPrices = (items.assets as Array<{ id: string; isin: string | null; wkn: string | null; prices: unknown[] }>)
				.filter((a) => (a.isin || a.wkn) && a.prices.length === 0)
				.map((a) => app.assetById.get(a.id)!)
				.filter(Boolean);
			if (needPrices.length) void jobs.refreshAssets(needPrices);
			else void jobs.fetchCurrencyRates();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	const counts = $derived(report ? countReport(report) : null);
	const activeScopes = $derived(
		report ? ALL_SCOPES.filter((s) => report![s].added.length || report![s].conflicts.length || report![s].unchanged) : []
	);
</script>

<Dialog bind:open title={targetPortfolio ? `Import into ${targetPortfolio.name}` : 'Import data'} size="lg">
	<div class="stack">
		<ol class="steps xs">
			{#each ['File', 'Options', 'Review', 'Done'] as s, i (s)}
				<li class:active={['file', 'options', 'review', 'done'].indexOf(step) >= i}>{s}</li>
			{/each}
		</ol>
		{#if error}<p class="error-text">{error}</p>{/if}

		{#if step === 'file'}
			<FileDrop
				multiple={false}
				accept=".json,.xml,.csv,application/json,text/xml,text/csv"
				label="Choose a file to import"
				hint="Sweetfolio backup (.json) · Portfolio Performance XML · Parqet / Trade Republic / Scalable / ING CSV"
				onfiles={onFile}
			/>
			<p class="xs muted">Portfolio Performance: use “File › Save as › XML” first. Files are processed locally.</p>
		{:else if step === 'options'}
			{#if kind === 'backup'}
				<p class="small">Backup <b>{fileName}</b>. Choose what to import:</p>
				<div class="scopes">
					{#each ALL_SCOPES as s (s)}
						{@const n = s === 'settings' ? Object.keys(backupData?.settings ?? {}).length : (backupData?.[s]?.length ?? 0)}
						<label class="scope" class:disabled={!n}>
							<input
								type="checkbox"
								disabled={!n}
								checked={scopes.includes(s)}
								onchange={(e) => (scopes = e.currentTarget.checked ? [...scopes, s] : scopes.filter((x) => x !== s))}
							/>
							<span>{SCOPE_LABELS[s]}</span><span class="muted num xs">{n}</span>
						</label>
					{/each}
				</div>
			{:else if ext}
				<div class="row" style="--gap: 6px">
					<Badge tone="accent">{SOURCE_LABELS[ext.source]}</Badge>
					<Badge>{ext.transactions.length} transactions</Badge>
					<Badge>{ext.securities.length} securities</Badge>
					{#if ext.portfolios.length > 1}<Badge>{ext.portfolios.length} portfolios</Badge>{/if}
				</div>
				{#if ext.warnings.length}
					<details class="small">
						<summary class="warn">{ext.warnings.length} warning(s)</summary>
						<ul>
							{#each ext.warnings.slice(0, 50) as w, i (i)}<li>{w}</li>{/each}
						</ul>
					</details>
				{/if}
				<div>
					<label class="label" for="iw-into">Import into</label>
					<select id="iw-into" class="select" bind:value={into}>
						<option value="new">{ext.portfolios.length > 1 ? 'New portfolios (one per source portfolio)' : 'A new portfolio'}</option>
						{#each trackedPortfolios as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
					</select>
				</div>
				{#if into === 'new' && ext.portfolios.length <= 1}
					<div>
						<label class="label" for="iw-name">Portfolio name</label><input id="iw-name" class="input" bind:value={portfolioName} />
					</div>
				{/if}
				<p class="xs muted">Securities are matched to your assets by ISIN/WKN; new ones are created and their prices fetched afterwards.</p>
			{/if}
		{:else if step === 'review' && report && counts}
			<div class="row" style="--gap: 6px">
				<Badge tone="accent">{counts.added} new</Badge>
				<Badge tone={counts.conflicts ? 'warning' : 'neutral'}>{counts.conflicts} conflicts</Badge>
				<Badge>{counts.unchanged} unchanged</Badge>
			</div>
			{#each activeScopes as s (s)}
				{@const r = report[s]}
				<section class="scope-review">
					<div class="spread">
						<h3>{SCOPE_LABELS[s]}</h3>
						<span class="xs muted">{r.added.length} new · {r.conflicts.length} conflicts · {r.unchanged} unchanged</span>
					</div>
					{#if r.conflicts.length}
						<div class="row xs">
							<button class="link" onclick={() => setAll(s, 'keep')}>Keep all existing</button>
							<button class="link" onclick={() => setAll(s, 'replace')}>Replace all</button>
						</div>
						<ul class="conflicts">
							{#each r.conflicts as c (c.key)}
								<li>
									<span class="truncate small">{c.label}</span>
									<div class="seg">
										<button class:active={c.resolution === 'keep'} onclick={() => (c.resolution = 'keep')}>Keep</button>
										<button class:active={c.resolution === 'replace'} onclick={() => (c.resolution = 'replace')}>Replace</button>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{:else}
				<p class="muted small">Nothing to import — everything is already up to date.</p>
			{/each}
		{:else if step === 'done'}
			<p>Import finished. {summary}</p>
		{/if}
	</div>
	{#snippet footer()}
		{#if step === 'done'}
			<Button variant="primary" onclick={() => (open = false)}>Close</Button>
		{:else}
			<Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
			{#if step === 'options'}<Button variant="primary" loading={busy} disabled={kind === 'backup' && !scopes.length} onclick={review}
					>Review</Button
				>{/if}
			{#if step === 'review'}<Button
					variant="primary"
					loading={busy}
					disabled={!counts ||
						counts.added +
							(report ? ALL_SCOPES.reduce((s, sc) => s + report![sc].conflicts.filter((c) => c.resolution === 'replace').length, 0) : 0) ===
							0}
					onclick={apply}>Import</Button
				>{/if}
		{/if}
	{/snippet}
</Dialog>

<style>
	.steps {
		display: flex;
		gap: 4px;
		list-style: none;
		margin: 0;
		padding: 0;
		counter-reset: s;
	}
	.steps li {
		flex: 1;
		padding-top: 6px;
		border-top: 3px solid var(--surface-3);
		color: var(--muted);
		font-weight: 600;
	}
	.steps li.active {
		border-color: var(--accent);
		color: var(--accent);
	}
	.scopes {
		display: grid;
		gap: 6px;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
	}
	.scope {
		display: flex;
		gap: 10px;
		align-items: center;
		padding: 10px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}
	.scope span:nth-child(2) {
		flex: 1;
	}
	.scope.disabled {
		opacity: 0.45;
	}
	.warn {
		color: var(--warning);
	}
	.scope-review {
		display: grid;
		gap: 8px;
		padding: 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.link {
		border: none;
		background: none;
		color: var(--accent);
		padding: 0;
	}
	.conflicts {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 6px;
		max-height: 240px;
		overflow: auto;
	}
	.conflicts li {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		align-items: center;
	}
	.seg {
		display: inline-flex;
		background: var(--surface-2);
		border-radius: 999px;
		padding: 2px;
		flex-shrink: 0;
	}
	.seg button {
		border: none;
		background: none;
		padding: 4px 10px;
		border-radius: 999px;
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-2);
	}
	.seg button.active {
		background: var(--surface-solid);
		color: var(--accent);
		box-shadow: var(--shadow-sm);
	}
	ul {
		padding-left: 18px;
	}
</style>
