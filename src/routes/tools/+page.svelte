<svelte:head>
	<title>Tools – Sweetfolio</title>
</svelte:head>

<div class="tools-page">
	<header class="page-header">
		<h1>Tools</h1>
		<p class="page-subtitle">Integrations and data conversion utilities</p>
	</header>

	<div class="tools-grid">
		<div class="tool-card">
			<div class="tool-card-body">
				<h2 class="tool-title">Parqet → Portfolio Performance</h2>
				<p class="tool-description">
					Connect to your Parqet account and export your portfolio data as a Portfolio Performance
					XML file for offline analysis.
				</p>
			</div>
			<div class="tool-card-footer">
				<a href="/tools/parqet-to-pp" class="tool-link">Open tool</a>
			</div>
		</div>
	</div>
</div>

<style>
	.tools-page {
		max-width: 720px;
	}

	.page-header {
		margin-bottom: var(--spacing-xl);
	}

	.page-header h1 {
		margin-bottom: var(--spacing-xs);
	}

	.page-subtitle {
		color: var(--color-text-muted);
		font-size: var(--font-size-base);
	}

	.tools-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--spacing-md);
	}

	.tool-card {
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-lg);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.tool-card-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.tool-title {
		font-size: var(--font-size-base);
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.tool-description {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		line-height: 1.5;
	}

	.tool-card-footer {
		display: flex;
		justify-content: flex-end;
	}

	.tool-link {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-accent);
		text-decoration: none;
		padding: var(--spacing-xs) var(--spacing-md);
		border: 1px solid var(--color-accent);
		border-radius: var(--radius-sm);
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.tool-link:hover {
		background: var(--color-accent);
		color: #fff;
	}
</style>
