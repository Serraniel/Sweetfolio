<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import Icon from '#lib/ui/Icon.svelte';
	import { theme } from '#lib/state/theme.svelte.ts';
	import { isActive, NAV } from './nav.ts';

	let { children }: { children: Snippet } = $props();
	let moreOpen = $state(false);
	let collapsed = $state(false);
	const path = $derived(page.url.pathname);
	const tabs = NAV.filter((n) => n.tab);
	const moreItems = $derived(
		NAV.filter((n) => !n.tab)
			.flatMap((n) => [n, ...(n.children ?? [])])
			.concat(NAV.filter((n) => n.tab).flatMap((n) => n.children ?? []))
	);
	const moreActive = $derived(moreItems.some((n) => isActive(path, n.href)) && !tabs.some((t) => isActive(path, t.href)));

	$effect(() => {
		void path;
		moreOpen = false;
	});

	$effect(() => {
		try {
			collapsed = localStorage.getItem('sweetfolio-nav-collapsed') === '1';
		} catch {
			/* ignore */
		}
	});

	function toggleCollapsed() {
		collapsed = !collapsed;
		try {
			localStorage.setItem('sweetfolio-nav-collapsed', collapsed ? '1' : '0');
		} catch {
			/* ignore */
		}
	}
</script>

<a class="skip" href="#main">Skip to content</a>

<div class="shell" class:collapsed>
	<aside class="sidebar" aria-label="Main navigation">
		<div class="brand">
			<a href="/" class="logo" aria-label="Sweetfolio home">
				<img src="/logo/sweetfolio-logo.svg" alt="" width="32" height="32" />
				<span class="wordmark">Sweetfolio</span>
			</a>
			<button
				class="icon-btn collapse"
				onclick={toggleCollapsed}
				aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
				aria-expanded={!collapsed}
			>
				<Icon name="sidebar" size={18} />
			</button>
		</div>
		<nav>
			<ul>
				{#each NAV as item (item.href)}
					<li>
						<a
							href={item.href}
							class="nav-link"
							class:active={isActive(path, item.href) && !(item.children ?? []).some((c) => isActive(path, c.href))}
							aria-current={isActive(path, item.href) ? 'page' : undefined}
							title={collapsed ? item.label : undefined}
						>
							<Icon name={item.icon} />
							<span class="text">{item.label}</span>
						</a>
						{#if item.children}
							<ul class="sub">
								{#each item.children as c (c.href)}
									<li>
										<a
											href={c.href}
											class="nav-link child"
											class:active={isActive(path, c.href)}
											aria-current={isActive(path, c.href) ? 'page' : undefined}
											title={collapsed ? c.label : undefined}
										>
											<Icon name={c.icon} size={16} />
											<span class="text">{c.label}</span>
										</a>
									</li>
								{/each}
							</ul>
						{/if}
					</li>
				{/each}
			</ul>
		</nav>
		<div class="sidebar-foot">
			<button class="nav-link" onclick={() => theme.toggle()} aria-label="Toggle theme">
				<Icon name={theme.resolved === 'dark' ? 'sun' : 'moon'} />
				<span class="text">{theme.resolved === 'dark' ? 'Light mode' : 'Dark mode'}</span>
			</button>
			<a class="version text xs muted" href="/changelog">v{__APP_VERSION__}</a>
		</div>
	</aside>

	<header class="topbar">
		<a href="/" class="logo" aria-label="Sweetfolio home">
			<img src="/logo/sweetfolio-logo.svg" alt="" width="28" height="28" />
			<span class="wordmark">Sweetfolio</span>
		</a>
		<button class="icon-btn" onclick={() => theme.toggle()} aria-label="Toggle theme">
			<Icon name={theme.resolved === 'dark' ? 'sun' : 'moon'} />
		</button>
	</header>

	<main id="main" tabindex="-1">
		{@render children()}
	</main>

	<nav class="tabbar" aria-label="Main navigation">
		{#each tabs as t (t.href)}
			<a href={t.href} class="tab" class:active={isActive(path, t.href)} aria-current={isActive(path, t.href) ? 'page' : undefined}>
				<Icon name={t.icon} size={22} />
				<span>{t.label}</span>
			</a>
		{/each}
		<button
			class="tab"
			class:active={moreActive || moreOpen}
			onclick={() => (moreOpen = !moreOpen)}
			aria-expanded={moreOpen}
			aria-controls="more-sheet"
		>
			<Icon name="more" size={22} stroke={3} />
			<span>More</span>
		</button>
	</nav>

	{#if moreOpen}
		<button class="scrim" aria-label="Close menu" onclick={() => (moreOpen = false)}></button>
		<div class="more-sheet" id="more-sheet" role="menu">
			{#each moreItems as m (m.href)}
				<a href={m.href} role="menuitem" class="more-item" class:active={isActive(path, m.href)}>
					<Icon name={m.icon} />
					{m.label}
				</a>
			{/each}
			<a href="/changelog" role="menuitem" class="more-item"><Icon name="history" />Changelog · v{__APP_VERSION__}</a>
		</div>
	{/if}
</div>

<style>
	.skip {
		position: absolute;
		left: -999px;
		top: 8px;
		z-index: 200;
		background: var(--surface-solid);
		padding: 8px 12px;
		border-radius: var(--radius-sm);
	}
	.skip:focus {
		left: 8px;
	}
	.shell {
		min-height: 100dvh;
	}
	main {
		padding: var(--space-4) var(--space-4) calc(var(--tabbar-height) + env(safe-area-inset-bottom) + var(--space-6));
		max-width: 1440px;
		margin: 0 auto;
		outline: none;
	}
	.logo {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--text);
		font-weight: 700;
		letter-spacing: -0.02em;
		font-size: 1.05rem;
		text-decoration: none;
		min-width: 0;
	}
	.icon-btn {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border: none;
		border-radius: 50%;
		background: transparent;
		color: var(--text-2);
	}
	.icon-btn:hover {
		background: var(--accent-soft);
		color: var(--accent);
	}

	/* Mobile top bar */
	.topbar {
		position: sticky;
		top: 0;
		z-index: 30;
		height: calc(var(--header-height) + env(safe-area-inset-top));
		padding: env(safe-area-inset-top) var(--space-3) 0 var(--space-4);
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: color-mix(in srgb, var(--bg) 82%, transparent);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		border-bottom: 1px solid var(--border);
	}

	/* Mobile tab bar */
	.tabbar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 40;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		height: calc(var(--tabbar-height) + env(safe-area-inset-bottom));
		padding-bottom: env(safe-area-inset-bottom);
		background: color-mix(in srgb, var(--surface-solid) 96%, transparent);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		border-top: 1px solid var(--border);
	}
	.tab {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		border: none;
		background: none;
		color: var(--muted);
		font-size: 0.6875rem;
		font-weight: 600;
		text-decoration: none;
		-webkit-tap-highlight-color: transparent;
	}
	.tab.active {
		color: var(--accent);
	}
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 38;
		background: rgb(0 0 0 / 0.3);
		border: none;
	}
	.more-sheet {
		position: fixed;
		z-index: 39;
		left: 8px;
		right: 8px;
		bottom: calc(var(--tabbar-height) + env(safe-area-inset-bottom) + 8px);
		padding: 8px;
		border-radius: var(--radius-lg);
		background: var(--surface-solid);
		box-shadow: var(--shadow-lg);
		display: grid;
		gap: 2px;
		animation: sheet 0.18s var(--ease);
	}
	.more-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		border-radius: var(--radius);
		color: var(--text);
		font-weight: 550;
		text-decoration: none;
	}
	.more-item.active,
	.more-item:hover {
		background: var(--accent-soft);
		color: var(--accent);
	}
	@keyframes sheet {
		from {
			transform: translateY(12px);
			opacity: 0;
		}
	}

	/* Desktop sidebar */
	.sidebar {
		display: none;
	}
	@media (min-width: 900px) {
		.topbar,
		.tabbar,
		.more-sheet,
		.scrim {
			display: none;
		}
		.shell {
			display: grid;
			grid-template-columns: var(--nav-width) 1fr;
			transition: grid-template-columns 0.2s var(--ease);
		}
		.shell.collapsed {
			grid-template-columns: 72px 1fr;
		}
		main {
			padding: var(--space-6) var(--space-6) var(--space-7);
			width: 100%;
		}
		.sidebar {
			position: sticky;
			top: 0;
			height: 100dvh;
			display: flex;
			flex-direction: column;
			padding: var(--space-4) var(--space-3);
			border-right: 1px solid var(--border);
			background: color-mix(in srgb, var(--surface-solid) 60%, transparent);
			backdrop-filter: var(--glass-blur);
			-webkit-backdrop-filter: var(--glass-blur);
			overflow: hidden;
		}
		.brand {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 4px;
			padding: 0 4px var(--space-4);
		}
		nav ul {
			list-style: none;
			margin: 0;
			padding: 0;
			display: grid;
			gap: 2px;
		}
		.sub {
			padding-left: 18px !important;
		}
		.nav-link {
			display: flex;
			align-items: center;
			gap: 12px;
			width: 100%;
			padding: 9px 12px;
			border-radius: var(--radius);
			border: none;
			background: none;
			color: var(--text-2);
			font-weight: 550;
			font-size: var(--text-sm);
			text-decoration: none;
			white-space: nowrap;
		}
		.nav-link.child {
			padding: 7px 12px;
			font-size: var(--text-xs);
		}
		.nav-link:hover {
			background: var(--accent-soft);
			color: var(--accent);
			text-decoration: none;
		}
		.nav-link.active {
			background: var(--accent-soft);
			color: var(--accent);
		}
		.sidebar-foot {
			margin-top: auto;
			display: grid;
			gap: 4px;
		}
		.version {
			padding: 4px 12px;
			color: var(--muted);
		}
		.collapsed .text,
		.collapsed .wordmark,
		.collapsed .sub {
			display: none;
		}
		.collapsed .brand {
			flex-direction: column;
		}
		.collapsed .nav-link {
			justify-content: center;
			padding: 10px;
		}
	}
</style>
