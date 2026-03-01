<script lang="ts">
	import Card from '$lib/components/shared/Card.svelte';
	import changelog from '../../../CHANGELOG.md?raw';
	import { onMount } from 'svelte';

	interface VersionSection {
		version: string;
		date: string;
		id: string;
		content: string;
		html: string;
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

	function renderSectionMarkdown(md: string): string {
		const escaped = md
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');

		return escaped
			.split('\n')
			.map((line) => {
				// Skip h1 headings (version headers are handled separately)
				const h1Match = line.match(/^#\s+/);
				if (h1Match) return '';

				// Other headings (h2-h6)
				const headingMatch = line.match(/^(#{2,6})\s+(.+)$/);
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
				if (line.trim() === '') return '';
				// Regular paragraph
				return `<p>${inlineMarkdown(line)}</p>`;
			})
			.filter((line) => line !== '')
			.join('\n');
	}

	function parseVersionSections(raw: string): VersionSection[] {
		const lines = raw.split('\n');
		const sections: VersionSection[] = [];
		let currentSection: { version: string; date: string; id: string; lines: string[] } | null =
			null;

		for (const line of lines) {
			const versionMatch = line.match(/^# \[(\d+\.\d+\.\d+[^\]]*)\].*\((\d{4}-\d{2}-\d{2})\)/);
			if (versionMatch) {
				if (currentSection) {
					sections.push({
						...currentSection,
						content: currentSection.lines.join('\n'),
						html: renderSectionMarkdown(currentSection.lines.join('\n'))
					});
				}
				const version = versionMatch[1];
				const date = versionMatch[2];
				const id = 'version-' + version.replace(/\./g, '-');
				currentSection = { version, date, id, lines: [] };
				continue;
			}

			// Detect the trailing boilerplate "# Changelog" section
			if (line.match(/^# Changelog\s*$/)) {
				// Save current section if any, then stop
				if (currentSection) {
					sections.push({
						...currentSection,
						content: currentSection.lines.join('\n'),
						html: renderSectionMarkdown(currentSection.lines.join('\n'))
					});
				}
				currentSection = null;
				break;
			}

			if (currentSection) {
				currentSection.lines.push(line);
			}
		}

		// Push last section if file doesn't end with boilerplate
		if (currentSection) {
			sections.push({
				...currentSection,
				content: currentSection.lines.join('\n'),
				html: renderSectionMarkdown(currentSection.lines.join('\n'))
			});
		}

		return sections;
	}

	const sections = parseVersionSections(changelog);

	let activeVersion = $state(sections.length > 0 ? sections[0].id : '');

	onMount(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						activeVersion = entry.target.id;
					}
				}
			},
			{ rootMargin: '-80px 0px -60% 0px', threshold: 0 }
		);

		for (const section of sections) {
			const el = document.getElementById(section.id);
			if (el) observer.observe(el);
		}

		return () => observer.disconnect();
	});

	function formatDate(dateStr: string): string {
		const [year, month, day] = dateStr.split('-');
		return `${year}-${month}-${day}`;
	}
</script>

<svelte:head>
	<title>Changelog – Sweetfolio</title>
</svelte:head>

<div class="changelog-page">
	<header class="page-header">
		<h1>Changelog</h1>
		<p class="page-subtitle">Release history generated from conventional commits</p>
	</header>

	<div class="changelog-layout">
		<nav class="version-nav">
			<div class="version-nav-inner">
				<span class="nav-title">Releases</span>
				{#each sections as section}
					<a
						href="#{section.id}"
						class="nav-link"
						class:active={activeVersion === section.id}
					>
						v{section.version}
					</a>
				{/each}
			</div>
		</nav>

		<div class="changelog-cards">
			{#each sections as section}
				<div id={section.id} class="version-card-wrapper">
					<Card padding="lg">
						<div class="version-header">
							<h2 class="version-title">v{section.version}</h2>
							<span class="version-date">{formatDate(section.date)}</span>
						</div>
						<div class="changelog-content">
							{@html section.html}
						</div>
					</Card>
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.changelog-page {
		max-width: 1000px;
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

	.changelog-layout {
		display: grid;
		grid-template-columns: 180px 1fr;
		gap: var(--spacing-xl);
		align-items: start;
	}

	/* Sidebar navigation */
	.version-nav {
		position: sticky;
		top: var(--spacing-xl);
	}

	.version-nav-inner {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.nav-title {
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-sm);
	}

	.nav-link {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		text-decoration: none;
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		transition: color var(--transition-fast), background var(--transition-fast);
	}

	.nav-link:hover {
		color: var(--color-text-primary);
		background: var(--color-bg-tertiary);
	}

	.nav-link.active {
		color: var(--color-accent);
		font-weight: 600;
		background: var(--color-bg-tertiary);
	}

	/* Version cards */
	.changelog-cards {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.version-header {
		display: flex;
		align-items: baseline;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-lg);
		padding-bottom: var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	.version-title {
		font-size: var(--font-size-xl);
		font-weight: 700;
	}

	.version-date {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	/* Changelog content within each card */
	.changelog-content :global(h3) {
		font-size: var(--font-size-base);
		font-weight: 600;
		margin-top: var(--spacing-md);
		margin-bottom: var(--spacing-sm);
		color: var(--color-text-secondary);
	}

	.changelog-content :global(h3:first-child) {
		margin-top: 0;
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

	/* Mobile: hide sidebar, stack cards */
	@media (max-width: 768px) {
		.changelog-layout {
			grid-template-columns: 1fr;
		}

		.version-nav {
			display: none;
		}

		.changelog-page {
			max-width: 800px;
		}
	}
</style>
