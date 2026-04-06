import { describe, it, expect } from 'vitest';
import { exportToAIFormat } from './ai-export';
import type { Asset, Portfolio, Transaction } from '$lib/types';

const asset: Asset = {
  id: 'a1', name: 'Apple Inc', isin: 'US0378331005', wkn: null,
  currency: 'USD', classification: 'stock',
  prices: [{ date: '2024-01-15', close: 182.5 }],
  formatConfig: null, rawCSV: null, rawCSVStoredAt: null,
  createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', lastRefreshedAt: null,
};

const portfolio: Portfolio = {
  id: 'p1', name: 'My Portfolio', mode: 'tracked',
  allocations: [], isBenchmark: false, trackCash: false,
  cashCurrency: 'EUR', sourceStrategyId: null,
  createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
};

const tx: Transaction = {
  id: 'tx1', portfolioId: 'p1', type: 'buy', assetId: 'a1',
  date: '2024-01-15', quantity: 5, price: 182.5, fee: 1.99,
  amount: null, withholdingTax: 0, currency: 'USD', notes: '',
  createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
};

describe('exportToAIFormat', () => {
  it('sets format to sweetfolio-ai', () => {
    const result = exportToAIFormat([portfolio], [asset], [tx]);
    expect(result.format).toBe('sweetfolio-ai');
  });

  it('includes a human-readable description', () => {
    const result = exportToAIFormat([portfolio], [asset], [tx]);
    expect(typeof result.description).toBe('string');
    expect(result.description.length).toBeGreaterThan(20);
  });

  it('includes capabilities array', () => {
    const result = exportToAIFormat([portfolio], [asset], [tx]);
    expect(Array.isArray(result.capabilities)).toBe(true);
    expect(result.capabilities).toContain('read-portfolios');
  });

  it('includes manifest with type descriptions', () => {
    const result = exportToAIFormat([portfolio], [asset], [tx]);
    expect(result.manifest).toBeDefined();
    expect(result.manifest.types.portfolio).toBeDefined();
    expect(result.manifest.types.asset).toBeDefined();
    expect(result.manifest.types.transaction).toBeDefined();
  });

  it('includes the portfolio data with transactions embedded', () => {
    const result = exportToAIFormat([portfolio], [asset], [tx]);
    const pf = result.data.portfolios[0];
    expect(pf.id).toBe('p1');
    expect(pf.transactions).toHaveLength(1);
    expect(pf.transactions[0].type).toBe('buy');
  });

  it('resolves asset name in transactions', () => {
    const result = exportToAIFormat([portfolio], [asset], [tx]);
    const txOut = result.data.portfolios[0].transactions[0];
    expect((txOut as Record<string, unknown>).assetName).toBe('Apple Inc');
  });

  it('includes latestPrice and latestPriceDate on assets', () => {
    const result = exportToAIFormat([portfolio], [asset], [tx]);
    const a = result.data.assets[0];
    expect(a.latestPrice).toBe(182.5);
    expect(a.latestPriceDate).toBe('2024-01-15');
  });
});
