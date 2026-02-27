import { writable } from 'svelte/store';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'sweetfolio-theme';

function getInitialTheme(): Theme {
	if (typeof window === 'undefined') return 'dark';

	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === 'light' || stored === 'dark') return stored;

	if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
	return 'dark';
}

function createThemeStore() {
	const { subscribe, set, update } = writable<Theme>(
		typeof window !== 'undefined' ? getInitialTheme() : 'dark'
	);

	function applyTheme(theme: Theme) {
		document.documentElement.setAttribute('data-theme', theme);
		localStorage.setItem(STORAGE_KEY, theme);
	}

	if (typeof window !== 'undefined') {
		applyTheme(getInitialTheme());
	}

	return {
		subscribe,
		toggle() {
			update((current) => {
				const next = current === 'dark' ? 'light' : 'dark';
				applyTheme(next);
				return next;
			});
		},
		set(theme: Theme) {
			applyTheme(theme);
			set(theme);
		}
	};
}

export const theme = createThemeStore();
