<script lang="ts" module>
	export function duration(days: number | null | undefined): string {
		if (days === null || days === undefined) return 'not recovered';
		if (days < 365) return `${Math.max(0, Math.round(days / 30.44))} mo`;
		return `${(days / 365.25).toFixed(1)} y`;
	}
</script>

<script lang="ts">
	/**
	 * One row per tested crisis (CR-4, CR-5): drawdown, time to recover and the
	 * return during the crisis, with the benchmark's value as a muted second
	 * line and a verdict per crisis.
	 */
	import { CRISIS_TYPE_SHORT, type Verdict } from '#lib/core/crisis.ts';
	import type { CrisisReport, CrisisRow } from '#lib/state/crisis.svelte.ts';
	import * as fmt from '#lib/format.ts';

	let {
		report,
		benchmarkLabel = null,
		selected = $bindable<string | null>(null)
	}: { report: CrisisReport; benchmarkLabel?: string | null; selected?: string | null } = $props();

	const shown = $derived(report.rows.filter((r) => r.outcome));
	const untested = $derived(report.rows.filter((r) => !r.outcome));

	const VERDICT: Record<Verdict, string> = { better: 'Better', similar: 'Similar', worse: 'Worse' };

	function ddClass(r: CrisisRow): string {
		if (!r.benchmark || !r.outcome) return '';
		return r.benchmark.drawdown > r.outcome.drawdown ? 'b-better' : r.benchmark.drawdown < r.outcome.drawdown ? 'b-worse' : '';
	}
	function recClass(r: CrisisRow): string {
		if (!r.benchmark || !r.outcome) return '';
		const own = r.outcome.recoveryDays ?? Infinity;
		const b = r.benchmark.recoveryDays ?? Infinity;
		return b < own ? 'b-better' : b > own ? 'b-worse' : '';
	}
	function sourceText(r: CrisisRow): string {
		const proxied = r.coverage.filter((c) => c.kind === 'proxy');
		if (!proxied.length) return 'Real prices of all assets';
		return proxied
			.map((c) => `${c.name}: ${c.proxies.join(' + ')}${c.approximate ? ' (approximation)' : ''}${c.coarse ? ' (monthly data)' : ''}`)
			.join('\n');
	}
</script>

<div class="scroll-x">
	<table class="table crises">
		<thead>
			<tr>
				<th scope="col">Crisis</th>
				<th scope="col" class="right">Drawdown</th>
				<th scope="col" class="right">Recovery</th>
				<th scope="col" class="right">During crisis</th>
				{#if benchmarkLabel}<th scope="col">vs. benchmark</th>{/if}
				<th scope="col">Data</th>
			</tr>
		</thead>
		<tbody>
			{#each shown as r (r.crisis.id)}
				<tr class:excluded={!r.included} class:selected={selected === r.crisis.id}>
					<th scope="row" class="crisis">
						<button
							class="name"
							aria-pressed={selected === r.crisis.id}
							onclick={() => (selected = selected === r.crisis.id ? null : r.crisis.id)}>{r.crisis.name}</button
						>
						<span class="xs muted">{CRISIS_TYPE_SHORT[r.crisis.type]} · {r.crisis.start.slice(0, 7)} – {r.crisis.end.slice(0, 7)}</span>
					</th>
					<td class="right num neg"
						>{fmt.pct(r.outcome!.drawdown, 1)}{#if r.benchmark}<span class="bench {ddClass(r)}">{fmt.pct(r.benchmark.drawdown, 1)}</span
							>{/if}</td
					>
					<td
						class="right num"
						title={r.outcome!.recoveryDate
							? `Back at the previous high on ${fmt.date(r.outcome!.recoveryDate)}`
							: `Not back at the previous high by ${fmt.date(r.outcome!.dataEnd)}`}
						>{duration(r.outcome!.recoveryDays)}{#if r.benchmark}<span class="bench {recClass(r)}"
								>{duration(r.benchmark.recoveryDays)}</span
							>{/if}</td
					>
					<td class="right num {fmt.signClass(r.outcome!.crisisReturn)}"
						>{fmt.pct(r.outcome!.crisisReturn, 1)}{#if r.benchmark}<span class="bench">{fmt.pct(r.benchmark.crisisReturn, 1)}</span
							>{/if}</td
					>
					{#if benchmarkLabel}
						<td
							>{#if r.verdict}<span class="verdict {r.verdict}">{VERDICT[r.verdict]}</span>{:else}<span class="xs muted"
									>no benchmark data</span
								>{/if}</td
						>
					{/if}
					<td
						><span class="source {r.coverage.some((c) => c.kind === 'proxy') ? 'proxy' : 'real'}" title={sourceText(r)}
							>{r.coverage.some((c) => c.kind === 'proxy')
								? r.coverage.some((c) => c.approximate || c.coarse)
									? 'Proxy ≈'
									: 'Proxy'
								: 'Real'}</span
						></td
					>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
{#if untested.length}
	<p class="xs muted untested">
		Not testable: {#each untested as r, i (r.crisis.id)}{i ? '; ' : ''}{r.crisis.name} (no data for {r.missing.join(', ') ||
				'any asset'}){/each}.
	</p>
{/if}

<style>
	.crises th.crisis {
		text-transform: none;
		letter-spacing: 0;
		color: var(--text);
		font-size: var(--text-sm);
		display: grid;
		gap: 2px;
		white-space: normal;
		min-width: 170px;
	}
	.name {
		border: none;
		background: none;
		padding: 0;
		font-weight: 600;
		text-align: left;
		color: var(--text);
	}
	.name:hover {
		color: var(--accent);
	}
	tr.selected {
		background: var(--accent-soft);
	}
	tr.excluded {
		opacity: 0.45;
	}
	.bench {
		display: block;
		margin-top: 1px;
		font-size: 0.6875rem;
		line-height: 1.2;
		opacity: 0.8;
		color: var(--muted);
		font-weight: 400;
	}
	.bench.b-better {
		color: color-mix(in srgb, var(--positive) 40%, var(--muted));
	}
	.bench.b-worse {
		color: color-mix(in srgb, var(--negative) 40%, var(--muted));
	}
	.verdict {
		font-size: var(--text-xs);
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 999px;
		white-space: nowrap;
	}
	.verdict.better {
		background: var(--accent-soft);
		color: var(--positive);
	}
	.verdict.similar {
		background: var(--surface-2);
		color: var(--text-2);
	}
	.verdict.worse {
		background: var(--negative-soft);
		color: var(--negative);
	}
	.source {
		font-size: var(--text-xs);
		color: var(--muted);
		border-bottom: 1px dotted currentColor;
		cursor: help;
		white-space: nowrap;
	}
	.untested {
		margin-top: var(--space-2);
	}
</style>
