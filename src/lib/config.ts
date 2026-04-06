export interface SweetfolioConfig {
  parqetClientId: string;
}

const defaults: SweetfolioConfig = {
  parqetClientId: '',
};

let _config: SweetfolioConfig | null = null;

export async function loadConfig(): Promise<SweetfolioConfig> {
  if (_config) return _config;
  try {
    const res = await fetch('/config.json');
    if (!res.ok) throw new Error(`config.json returned ${res.status}`);
    const raw = await res.json() as Partial<SweetfolioConfig>;
    _config = { ...defaults, ...raw };
  } catch {
    _config = { ...defaults };
  }
  return _config;
}

export function getConfig(): SweetfolioConfig {
  return _config ?? { ...defaults };
}
