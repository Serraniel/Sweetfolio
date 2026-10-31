<script lang="ts">
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import Card from '#lib/ui/Card.svelte';
	import Button from '#lib/ui/Button.svelte';
</script>

<PageHeader title="Tools" subtitle="Import, convert and export your data." />

<div class="grid" style="--min: 280px">
	<Card title="Parqet → Portfolio Performance">
		<p class="small muted">
			Connect your Parqet account (read-only), pick portfolios and import them into Sweetfolio or convert them to Portfolio Performance CSV
			files.
		</p>
		<div class="row actions"><Button variant="primary" href="/tools/parqet-to-pp">Open</Button></div>
	</Card>
	<Card title="Import transactions">
		<p class="small muted">
			Portfolio Performance XML, Parqet CSV, Trade Republic, Scalable Capital and ING CSV exports — or a Sweetfolio backup.
		</p>
		<div class="row actions"><Button href="/settings#data">Go to import</Button></div>
	</Card>
	<Card title="Export for Portfolio Performance">
		<p class="small muted">Write tracked portfolios as CSV files that Portfolio Performance imports directly.</p>
		<div class="row actions"><Button href="/settings#data">Export</Button></div>
	</Card>
	<Card title="AI export &amp; MCP server">
		<p class="small muted">
			A self-describing JSON export that AI assistants can read via the local MCP server in <code>tools/mcp-server</code>.
		</p>
		<div class="row actions"><Button href="/settings#data">Export</Button></div>
	</Card>
</div>

<style>
	.actions {
		margin-top: var(--space-4);
	}
</style>
