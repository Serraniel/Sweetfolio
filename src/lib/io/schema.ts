import type { Asset, Portfolio, CurrencyRate, StoredSimulation, Strategy } from '$lib/types';

export const CURRENT_VERSION = 3;

export const ALL_SCOPES = [
  'assets',
  'portfolios',
  'strategies',
  'settings',
  'currencies',
  'simulations',
] as const;

export type SweetfolioScope = (typeof ALL_SCOPES)[number];

export interface SweetfolioExport {
  format: 'sweetfolio';
  version: number;
  exportedAt: string;
  scopes: SweetfolioScope[];
  data: {
    assets?: Asset[];
    portfolios?: Portfolio[];
    strategies?: Strategy[];
    settings?: Record<string, unknown>;
    currencies?: CurrencyRate[];
    simulations?: StoredSimulation[];
  };
}

export function isValidExportEnvelope(obj: unknown): obj is SweetfolioExport {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  if (o.format !== 'sweetfolio') return false;
  if (typeof o.version !== 'number' || !Number.isInteger(o.version) || o.version < 1) return false;
  if (typeof o.exportedAt !== 'string') return false;
  if (!Array.isArray(o.scopes)) return false;
  if (typeof o.data !== 'object' || o.data === null) return false;
  return true;
}
