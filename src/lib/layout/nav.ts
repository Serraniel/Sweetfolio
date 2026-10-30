import type { IconName } from '#lib/ui/icons.ts';

export interface NavItem {
	href: string;
	label: string;
	icon: IconName;
	children?: NavItem[];
	/** Shown in the mobile tab bar. */
	tab?: boolean;
}

/** Navigation order (UI-4). */
export const NAV: NavItem[] = [
	{ href: '/', label: 'Dashboard', icon: 'home', tab: true },
	{ href: '/assets', label: 'Assets', icon: 'assets', tab: true, children: [{ href: '/compare', label: 'Compare', icon: 'compare' }] },
	{ href: '/portfolios', label: 'Portfolios', icon: 'portfolio', tab: true },
	{ href: '/strategies', label: 'Strategies', icon: 'strategy' },
	{ href: '/simulation', label: 'Simulation', icon: 'simulation', tab: true },
	{ href: '/tools', label: 'Tools', icon: 'tools', children: [{ href: '/tools/parqet-to-pp', label: 'Parqet → PP', icon: 'external' }] },
	{ href: '/settings', label: 'Settings', icon: 'settings' }
];

export function isActive(pathname: string, href: string): boolean {
	if (href === '/') return pathname === '/';
	return pathname === href || pathname.startsWith(`${href}/`);
}
