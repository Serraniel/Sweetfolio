/** Chart display preferences kept per device, like the theme (CH-7). */

const LOG_KEY = 'sweetfolio-chart-log';

function readLog(): boolean {
	try {
		return localStorage.getItem(LOG_KEY) === '1';
	} catch {
		return false;
	}
}

class ChartPrefs {
	/** Logarithmic y-axis for value and % charts (not drawdowns). */
	log = $state(readLog());

	setLog(on: boolean) {
		this.log = on;
		try {
			if (on) localStorage.setItem(LOG_KEY, '1');
			else localStorage.removeItem(LOG_KEY);
		} catch {
			/* storage unavailable */
		}
	}
}

export const chartPrefs = new ChartPrefs();
