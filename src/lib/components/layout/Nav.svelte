<script lang="ts">
	import { page } from '$app/state';
	import ThemeToggle from './ThemeToggle.svelte';

	interface NavItem {
		href: string;
		label: string;
		icon: string;
	}

	const navItems: NavItem[] = [
		{ href: '/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
		{ href: '/assets', label: 'Assets', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
		{ href: '/portfolios', label: 'Portfolios', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
		{ href: '/simulation', label: 'Simulation', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
		{ href: '/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' }
	];

	let { collapsed = $bindable(false) }: { collapsed?: boolean } = $props();

	function isActive(href: string): boolean {
		if (href === '/') return page.url.pathname === '/';
		return page.url.pathname.startsWith(href);
	}
</script>

<nav class="nav" class:collapsed>
	<div class="nav-header">
		{#if !collapsed}
			<a href="/" class="nav-logo">
				<span class="logo-icon">S</span>
				<span class="logo-text">Sweetfolio</span>
			</a>
		{:else}
			<a href="/" class="nav-logo">
				<span class="logo-icon">S</span>
			</a>
		{/if}
	</div>

	<ul class="nav-links">
		{#each navItems as item}
			<li>
				<a
					href={item.href}
					class="nav-link"
					class:active={isActive(item.href)}
					title={collapsed ? item.label : undefined}
				>
					<svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<path d={item.icon}/>
					</svg>
					{#if !collapsed}
						<span class="nav-label">{item.label}</span>
					{/if}
				</a>
			</li>
		{/each}
	</ul>

	<div class="nav-footer">
		<ThemeToggle />
		<button
			class="collapse-btn"
			onclick={() => collapsed = !collapsed}
			aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
		>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				{#if collapsed}
					<polyline points="9 18 15 12 9 6"/>
				{:else}
					<polyline points="15 18 9 12 15 6"/>
				{/if}
			</svg>
		</button>
	</div>
</nav>

<style>
	.nav {
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		width: var(--sidebar-width);
		display: flex;
		flex-direction: column;
		background: var(--sidebar-bg);
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		border-right: 1px solid var(--glass-border);
		padding: var(--spacing-md);
		z-index: 100;
		transition: width var(--transition-base);
	}

	.nav.collapsed {
		width: var(--sidebar-collapsed-width);
	}

	.nav-header {
		padding: var(--spacing-sm) 0 var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
		margin-bottom: var(--spacing-md);
	}

	.nav-logo {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		color: var(--color-text-primary);
		font-weight: 700;
		font-size: var(--font-size-lg);
	}

	.nav-logo:hover {
		color: var(--color-text-primary);
	}

	.logo-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: linear-gradient(135deg, var(--color-miku-teal), var(--color-deep-teal));
		color: #fff;
		border-radius: var(--radius-sm);
		font-weight: 800;
		font-size: var(--font-size-base);
		flex-shrink: 0;
	}

	.logo-text {
		white-space: nowrap;
		overflow: hidden;
	}

	.nav-links {
		list-style: none;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.nav-link {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		font-weight: 500;
		transition: background-color var(--transition-fast), color var(--transition-fast);
		white-space: nowrap;
	}

	.nav-link:hover {
		background: var(--color-border);
		color: var(--color-text-primary);
	}

	.nav-link.active {
		background: rgba(141, 208, 196, 0.15);
		color: var(--color-accent);
	}

	.nav-icon {
		flex-shrink: 0;
	}

	.nav-label {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.nav-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--color-border);
	}

	.collapse-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.collapse-btn:hover {
		background: var(--color-border);
		color: var(--color-text-primary);
	}

	.collapsed .nav-footer {
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.collapsed .nav-link {
		justify-content: center;
		padding: var(--spacing-sm);
	}

	@media (max-width: 768px) {
		.nav {
			width: var(--sidebar-collapsed-width);
		}

		.nav-logo .logo-text,
		.nav-label {
			display: none;
		}

		.nav-link {
			justify-content: center;
			padding: var(--spacing-sm);
		}

		.nav-footer {
			flex-direction: column;
			gap: var(--spacing-sm);
		}

		.collapse-btn {
			display: none;
		}
	}
</style>
