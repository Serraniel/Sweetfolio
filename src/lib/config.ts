/** Runtime configuration from `/config.json` (self-host configurable, EX-5). */
export interface RuntimeConfig {
	parqetClientId: string;
	parqetScope: string;
}

const DEFAULTS: RuntimeConfig = { parqetClientId: '', parqetScope: 'portfolio:read' };
let cached: Promise<RuntimeConfig> | null = null;

export function loadConfig(fetcher: typeof fetch = fetch): Promise<RuntimeConfig> {
	cached ??= fetcher('/config.json', { cache: 'no-store' })
		.then((r) => (r.ok ? r.json() : {}))
		.then((raw: Partial<RuntimeConfig>) => ({
			parqetClientId: typeof raw.parqetClientId === 'string' ? raw.parqetClientId.trim() : DEFAULTS.parqetClientId,
			parqetScope: typeof raw.parqetScope === 'string' && raw.parqetScope ? raw.parqetScope : DEFAULTS.parqetScope
		}))
		.catch(() => ({ ...DEFAULTS }));
	return cached;
}

export function resetConfigCache(): void {
	cached = null;
}
