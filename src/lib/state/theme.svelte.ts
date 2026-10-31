/** Theme preference: light / dark / system (UI-2). */
import type { ThemePreference } from '#lib/domain/types.ts';

const KEY = 'sweetfolio-theme';

function read(): ThemePreference {
	try {
		const v = localStorage.getItem(KEY);
		return v === 'light' || v === 'dark' ? v : 'system';
	} catch {
		return 'system';
	}
}

class Theme {
	preference = $state<ThemePreference>('system');
	systemDark = $state(false);
	resolved = $derived<'light' | 'dark'>(this.preference === 'system' ? (this.systemDark ? 'dark' : 'light') : this.preference);

	init() {
		this.preference = read();
		const mq = matchMedia('(prefers-color-scheme: dark)');
		this.systemDark = mq.matches;
		mq.addEventListener('change', (e) => (this.systemDark = e.matches));
		$effect.root(() => {
			$effect(() => {
				const root = document.documentElement;
				root.dataset.theme = this.resolved;
				root.style.colorScheme = this.resolved;
				document
					.querySelectorAll('meta[name="theme-color"]')
					.forEach((m) => m.setAttribute('content', this.resolved === 'dark' ? '#1c1e22' : '#f6f8f8'));
			});
		});
	}

	set(pref: ThemePreference) {
		this.preference = pref;
		try {
			if (pref === 'system') localStorage.removeItem(KEY);
			else localStorage.setItem(KEY, pref);
		} catch {
			/* storage unavailable */
		}
	}

	toggle() {
		this.set(this.resolved === 'dark' ? 'light' : 'dark');
	}
}

export const theme = new Theme();
