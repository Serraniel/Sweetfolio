<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '$lib/components/shared/Card.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import { setSetting, removeSetting } from '$lib/stores/settings';
	import { getConfig } from '$lib/config';
	import {
		generateCodeVerifier,
		generateCodeChallenge,
		generateState,
		buildAuthUrl,
		exchangeCodeForTokens
	} from '$lib/parqet/oauth';
	import { ParqetClient } from '$lib/parqet/client';
	import { mapParqetActivitiesToSweetfolio } from '$lib/parqet/mapper';
	import { exportToPortfolioPerformanceXML } from '$lib/io/pp-export';
	import type { ParqetPortfolio } from '$lib/parqet/types';

	type Step = 'connect' | 'select' | 'exporting' | 'done';

	let step = $state<Step>('connect');
	let accessToken = $state<string | null>(null);
	let refreshToken = $state<string | null>(null);
	let customRedirectUri = $state('');
	let clientId = $derived(getConfig().parqetClientId || null);
	let portfolios = $state<ParqetPortfolio[]>([]);
	let selectedIds = $state<Set<string>>(new Set());
	let error = $state<string | null>(null);
	let progress = $state('');
	let downloadLinks = $state<{ name: string; url: string; filename: string }[]>([]);

	onMount(async () => {
		const { get } = await import('$lib/storage/settings');
		accessToken = (await get('parqet_access_token') as string | null) ?? null;
		refreshToken = (await get('parqet_refresh_token') as string | null) ?? null;
		if (accessToken) {
			loadPortfolios();
		}
	});

	async function loadPortfolios() {
		error = null;
		try {
			const client = new ParqetClient(accessToken!);
			const response = await client.getPortfolios();
			portfolios = response.items;
			selectedIds = new Set(portfolios.map((p) => p.id));
			step = 'select';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			// Token may be expired — reset to connect
			step = 'connect';
		}
	}

	async function connect() {
		error = null;
		try {
			const verifier = generateCodeVerifier();
			const challenge = await generateCodeChallenge(verifier);
			const state = generateState();
			const redirectUri = window.location.origin + '/callback';

			sessionStorage.setItem('parqet_code_verifier', verifier);
			sessionStorage.setItem('parqet_oauth_state', state);

			const authUrl = buildAuthUrl(challenge, state, redirectUri, clientId ?? undefined);

			const popup = window.open(authUrl, 'parqet-oauth', 'width=600,height=700,noopener');
			if (!popup) {
				error = 'Popup was blocked. Please allow popups for this page.';
				return;
			}

			const handleMessage = async (event: MessageEvent) => {
				if (event.origin !== window.location.origin) return;
				if (!event.data || event.data.type !== 'parqet-oauth-code') return;

				window.removeEventListener('message', handleMessage);

				const receivedState = event.data.state as string;
				const code = event.data.code as string;
				const storedState = sessionStorage.getItem('parqet_oauth_state');
				const storedVerifier = sessionStorage.getItem('parqet_code_verifier');

				sessionStorage.removeItem('parqet_oauth_state');
				sessionStorage.removeItem('parqet_code_verifier');

				if (receivedState !== storedState) {
					error = 'OAuth state mismatch. Please try again.';
					return;
				}
				if (!storedVerifier) {
					error = 'Missing code verifier. Please try again.';
					return;
				}

				try {
					const tokens = await exchangeCodeForTokens(code, storedVerifier, redirectUri, clientId ?? undefined);
					accessToken = tokens.access_token;
					refreshToken = tokens.refresh_token;
					await setSetting('parqet_access_token', tokens.access_token);
					await setSetting('parqet_refresh_token', tokens.refresh_token);
					await loadPortfolios();
				} catch (e) {
					error = e instanceof Error ? e.message : String(e);
				}
			};

			window.addEventListener('message', handleMessage);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	function togglePortfolio(id: string) {
		const next = new Set(selectedIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		selectedIds = next;
	}

	function selectAll() {
		selectedIds = new Set(portfolios.map((p) => p.id));
	}

	function deselectAll() {
		selectedIds = new Set();
	}

	async function runExport() {
		error = null;
		step = 'exporting';
		downloadLinks = [];

		const client = new ParqetClient(accessToken!);
		const selected = portfolios.filter((p) => selectedIds.has(p.id));

		for (let i = 0; i < selected.length; i++) {
			const pf = selected[i];
			progress = `Fetching activities for "${pf.name}" (${i + 1}/${selected.length})…`;
			try {
				const activities = await client.getAllActivities(pf.id);
				progress = `Mapping "${pf.name}"…`;
				const mapped = mapParqetActivitiesToSweetfolio(pf, activities);
				const xml = exportToPortfolioPerformanceXML(
					[mapped.portfolio],
					mapped.assets,
					mapped.transactions
				);
				const blob = new Blob([xml], { type: 'application/xml' });
				const url = URL.createObjectURL(blob);
				const filename = `${pf.name.replace(/[^a-z0-9_\-]/gi, '_')}.xml`;
				downloadLinks = [...downloadLinks, { name: pf.name, url, filename }];
			} catch (e) {
				error = `Failed to export "${pf.name}": ${e instanceof Error ? e.message : String(e)}`;
				step = 'select';
				return;
			}
		}

		progress = '';
		step = 'done';
	}

	async function disconnect() {
		await removeSetting('parqet_access_token');
		await removeSetting('parqet_refresh_token');
		// Revoke blob URLs
		for (const link of downloadLinks) {
			URL.revokeObjectURL(link.url);
		}
		accessToken = null;
		refreshToken = null;
		portfolios = [];
		selectedIds = new Set();
		downloadLinks = [];
		error = null;
		progress = '';
		step = 'connect';
	}

	function startOver() {
		for (const link of downloadLinks) {
			URL.revokeObjectURL(link.url);
		}
		downloadLinks = [];
		error = null;
		step = 'select';
	}
</script>

<div class="page">
	<div class="page-header">
		<h1 class="page-title">Parqet → Portfolio Performance</h1>
		<p class="page-subtitle">
			Connect your Parqet account and export your portfolios as Portfolio Performance XML files.
		</p>
	</div>

	{#if error}
		<div class="error-banner">
			<span class="error-icon">⚠</span>
			<span>{error}</span>
			<button class="error-dismiss" onclick={() => (error = null)}>✕</button>
		</div>
	{/if}

	{#if step === 'connect'}
		<Card>
			<div class="connect-content">
				<div class="connect-icon">🔗</div>
				<h2 class="connect-title">Connect to Parqet</h2>
				<p class="connect-desc">
					Authorise Sweetfolio to read your Parqet portfolios via OAuth2. Your credentials stay in
					your browser — nothing is sent to any server.
				</p>
				{#if !clientId}
					<div class="connect-notice">
						No Parqet Client ID configured. Go to
						<a href="/settings">Settings → Parqet Integration</a>
						to add your Client ID and register
						<code>{typeof window !== 'undefined' ? window.location.origin : ''}/callback</code>
						as the redirect URI in your Parqet app.
					</div>
				{:else}
					<div class="connect-info">
						Using redirect URI: <code>{typeof window !== 'undefined' ? window.location.origin : ''}/callback</code>
					</div>
				{/if}
				<Button variant="primary" size="lg" onclick={connect} disabled={!clientId}>Connect with Parqet</Button>
			</div>
		</Card>
	{:else if step === 'select'}
		<div class="toolbar">
			<div class="toolbar-left">
				<span class="portfolio-count">{portfolios.length} portfolio{portfolios.length !== 1 ? 's' : ''} found</span>
				<button class="link-btn" onclick={selectAll}>Select all</button>
				<button class="link-btn" onclick={deselectAll}>Deselect all</button>
			</div>
			<div class="toolbar-right">
				<Button variant="ghost" size="sm" onclick={disconnect}>Disconnect</Button>
			</div>
		</div>

		<div class="portfolio-list">
			{#each portfolios as pf (pf.id)}
				<Card variant="flat" padding="sm">
					<label class="portfolio-row">
						<input
							type="checkbox"
							class="portfolio-checkbox"
							checked={selectedIds.has(pf.id)}
							onchange={() => togglePortfolio(pf.id)}
						/>
						<div class="portfolio-info">
							<span class="portfolio-name">{pf.name}</span>
							<span class="portfolio-meta">{pf.currency} · {pf.distinctBrokers.length} broker{pf.distinctBrokers.length !== 1 ? 's' : ''}</span>
						</div>
					</label>
				</Card>
			{/each}
		</div>

		<div class="action-row">
			<Button
				variant="primary"
				size="lg"
				disabled={selectedIds.size === 0}
				onclick={runExport}
			>
				Export {selectedIds.size} portfolio{selectedIds.size !== 1 ? 's' : ''} to PP XML
			</Button>
		</div>
	{:else if step === 'exporting'}
		<Card>
			<div class="exporting-content">
				<div class="spinner"></div>
				<p class="progress-text">{progress || 'Preparing export…'}</p>
			</div>
		</Card>
	{:else if step === 'done'}
		<Card>
			<div class="done-content">
				<div class="done-icon">✓</div>
				<h2 class="done-title">Export complete</h2>
				<p class="done-desc">
					{downloadLinks.length} XML file{downloadLinks.length !== 1 ? 's' : ''} ready to download.
				</p>
			</div>
		</Card>

		<div class="download-list">
			{#each downloadLinks as link (link.url)}
				<Card variant="flat" padding="sm">
					<div class="download-row">
						<span class="download-name">{link.name}</span>
						<a class="download-btn" href={link.url} download={link.filename}>
							⬇ Download XML
						</a>
					</div>
				</Card>
			{/each}
		</div>

		<div class="action-row">
			<Button variant="ghost" onclick={startOver}>Export more portfolios</Button>
			<Button variant="danger" onclick={disconnect}>Disconnect</Button>
		</div>
	{/if}
</div>

<style>
	.page {
		max-width: 720px;
		margin: 0 auto;
		padding: var(--spacing-2xl) var(--spacing-lg);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.page-header {
		margin-bottom: var(--spacing-sm);
	}

	.page-title {
		font-size: var(--font-size-2xl);
		font-weight: 700;
		color: var(--color-text-primary);
		margin: 0 0 var(--spacing-xs);
	}

	.page-subtitle {
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		margin: 0;
	}

	/* Error banner */
	.error-banner {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		background: rgba(232, 23, 93, 0.1);
		border: 1px solid rgba(232, 23, 93, 0.3);
		border-radius: var(--radius-sm);
		color: var(--color-negative);
		font-size: var(--font-size-sm);
	}

	.error-icon {
		font-size: var(--font-size-base);
	}

	.error-dismiss {
		margin-left: auto;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-negative);
		opacity: 0.7;
		padding: 0 var(--spacing-xs);
	}

	.error-dismiss:hover {
		opacity: 1;
	}

	/* Connect step */
	.connect-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-xl) 0;
		text-align: center;
	}

	.connect-icon {
		font-size: 3rem;
	}

	.connect-title {
		font-size: var(--font-size-xl);
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0;
	}

	.connect-desc {
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		max-width: 440px;
		line-height: 1.6;
		margin: 0;
	}

	.connect-notice {
		background: rgba(255, 200, 0, 0.08);
		border: 1px solid rgba(255, 200, 0, 0.3);
		border-radius: var(--radius-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		max-width: 440px;
		line-height: 1.5;
	}
	.connect-notice a { color: var(--color-accent); }
	.connect-notice code, .connect-info code {
		font-family: var(--font-mono);
		font-size: 0.9em;
		background: var(--color-bg-primary);
		padding: 1px 4px;
		border-radius: 3px;
	}
	.connect-info {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	/* Toolbar */
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm);
	}

	.toolbar-left {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.toolbar-right {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.portfolio-count {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	.link-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-accent);
		font-size: var(--font-size-sm);
		padding: 0;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.link-btn:hover {
		opacity: 0.8;
	}

	/* Portfolio list */
	.portfolio-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.portfolio-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		cursor: pointer;
		user-select: none;
	}

	.portfolio-checkbox {
		width: 1.1rem;
		height: 1.1rem;
		accent-color: var(--color-accent);
		flex-shrink: 0;
		cursor: pointer;
	}

	.portfolio-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.portfolio-name {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-primary);
	}

	.portfolio-meta {
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
	}

	/* Action row */
	.action-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		padding-top: var(--spacing-sm);
	}

	/* Exporting step */
	.exporting-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-lg);
		padding: var(--spacing-xl) 0;
	}

	.spinner {
		width: 2.5rem;
		height: 2.5rem;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.progress-text {
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		margin: 0;
	}

	/* Done step */
	.done-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-lg) 0;
		text-align: center;
	}

	.done-icon {
		width: 3rem;
		height: 3rem;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--color-deep-teal), var(--color-miku-teal));
		color: #fff;
		font-size: 1.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.done-title {
		font-size: var(--font-size-xl);
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0;
	}

	.done-desc {
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		margin: 0;
	}

	/* Download list */
	.download-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.download-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-md);
	}

	.download-name {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-primary);
	}

	.download-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: linear-gradient(135deg, var(--color-deep-teal), var(--color-miku-teal));
		color: #fff;
		border-radius: var(--radius-sm);
		font-size: var(--font-size-xs);
		font-weight: 500;
		text-decoration: none;
		transition: box-shadow var(--transition-fast);
	}

	.download-btn:hover {
		box-shadow: 0 4px 12px rgba(26, 138, 138, 0.35);
	}
</style>
