<script lang="ts">
	import Card from '$lib/components/shared/Card.svelte';
	import notices from '../../../THIRD_PARTY_NOTICES.md?raw';

	function renderMarkdown(md: string): string {
		const escaped = md
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');

		return escaped
			.split('\n')
			.map((line) => {
				const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
				if (headingMatch) {
					const level = headingMatch[1].length;
					return `<h${level}>${inlineMarkdown(headingMatch[2])}</h${level}>`;
				}
				if (/^[-*]\s+/.test(line)) {
					return `<li>${inlineMarkdown(line.replace(/^[-*]\s+/, ''))}</li>`;
				}
				if (line.trim() === '') return '<br/>';
				return `<p>${inlineMarkdown(line)}</p>`;
			})
			.join('\n');
	}

	function inlineMarkdown(text: string): string {
		return text
			.replace(
				/\[([^\]]+)\]\(([^)]+)\)/g,
				'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
			)
			.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			.replace(/`([^`]+)`/g, '<code>$1</code>');
	}

	const html = renderMarkdown(notices);
</script>

<svelte:head>
	<title>Third-Party Licenses – Sweetfolio</title>
</svelte:head>

<div class="licenses-page">
	<header class="page-header">
		<h1>Third-Party Licenses</h1>
		<p class="page-subtitle">Open-source dependencies used by Sweetfolio</p>
	</header>

	<Card padding="lg">
		<div class="licenses-content">
			{@html html}
		</div>
	</Card>
</div>

<style>
	.licenses-page {
		max-width: 800px;
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

	.licenses-content :global(h1) {
		display: none;
	}

	.licenses-content :global(h2) {
		font-size: var(--font-size-lg);
		font-family: var(--font-mono);
		margin-top: var(--spacing-xl);
		margin-bottom: var(--spacing-sm);
		padding-bottom: var(--spacing-sm);
		border-bottom: 1px solid var(--color-border);
	}

	.licenses-content :global(h2:first-child) {
		margin-top: 0;
	}

	.licenses-content :global(li) {
		font-size: var(--font-size-sm);
		line-height: 1.6;
		margin-left: var(--spacing-lg);
		list-style: disc;
	}

	.licenses-content :global(p) {
		font-size: var(--font-size-sm);
		margin: 0;
	}

	.licenses-content :global(strong) {
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.licenses-content :global(a) {
		color: var(--color-accent);
	}

	.licenses-content :global(br) {
		display: block;
		content: '';
		margin: var(--spacing-xs) 0;
	}
</style>
