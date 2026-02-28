<script lang="ts">
	import Card from '$lib/components/shared/Card.svelte';
	import changelog from '../../../CHANGELOG.md?raw';

	function renderMarkdown(md: string): string {
		const escaped = md
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');

		return escaped
			.split('\n')
			.map((line) => {
				// Headings
				const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
				if (headingMatch) {
					const level = headingMatch[1].length;
					const text = inlineMarkdown(headingMatch[2]);
					return `<h${level}>${text}</h${level}>`;
				}
				// Unordered list items
				if (/^[-*]\s+/.test(line)) {
					return `<li>${inlineMarkdown(line.replace(/^[-*]\s+/, ''))}</li>`;
				}
				// Empty lines
				if (line.trim() === '') return '<br/>';
				// Regular paragraph
				return `<p>${inlineMarkdown(line)}</p>`;
			})
			.join('\n');
	}

	function inlineMarkdown(text: string): string {
		return text
			// Links: [text](url)
			.replace(
				/\[([^\]]+)\]\(([^)]+)\)/g,
				'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
			)
			// Bold: **text**
			.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			// Inline code: `text`
			.replace(/`([^`]+)`/g, '<code>$1</code>');
	}

	const html = renderMarkdown(changelog);
</script>

<svelte:head>
	<title>Changelog – Sweetfolio</title>
</svelte:head>

<div class="changelog-page">
	<header class="page-header">
		<h1>Changelog</h1>
		<p class="page-subtitle">Release history generated from conventional commits</p>
	</header>

	<Card padding="lg">
		<div class="changelog-content">
			{@html html}
		</div>
	</Card>
</div>

<style>
	.changelog-page {
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

	.changelog-content :global(h1) {
		display: none;
	}

	.changelog-content :global(h2) {
		font-size: var(--font-size-xl);
		margin-top: var(--spacing-xl);
		margin-bottom: var(--spacing-md);
		padding-bottom: var(--spacing-sm);
		border-bottom: 1px solid var(--color-border);
	}

	.changelog-content :global(h2:first-child) {
		margin-top: 0;
	}

	.changelog-content :global(h3) {
		font-size: var(--font-size-base);
		font-weight: 600;
		margin-top: var(--spacing-md);
		margin-bottom: var(--spacing-sm);
		color: var(--color-text-secondary);
	}

	.changelog-content :global(p) {
		font-size: var(--font-size-sm);
		line-height: 1.6;
		margin: 0;
	}

	.changelog-content :global(li) {
		font-size: var(--font-size-sm);
		line-height: 1.6;
		margin-left: var(--spacing-lg);
		list-style: disc;
	}

	.changelog-content :global(code) {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		padding: 1px 5px;
		background: var(--color-bg-tertiary);
		border-radius: 3px;
	}

	.changelog-content :global(a) {
		color: var(--color-accent);
	}

	.changelog-content :global(a:hover) {
		color: var(--color-accent-light);
	}

	.changelog-content :global(strong) {
		font-weight: 600;
	}

	.changelog-content :global(br) {
		display: block;
		content: '';
		margin: var(--spacing-xs) 0;
	}
</style>
