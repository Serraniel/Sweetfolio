import { describe, it, expect } from 'vitest';
import { detectConflicts } from './conflicts';
import type { Asset, Strategy, CurrencyRate } from '$lib/types';

const emptyExisting = {
  assets: [],
  portfolios: [],
  strategies: [],
  currencies: [],
  simulations: [],
  transactions: [],
  settings: {},
};

describe('detectConflicts', () => {
  it('detects no conflicts when existing data is empty', () => {
    const imported = {
      assets: [{ id: 'a1', name: 'New Asset' } as Asset],
    };
    const report = detectConflicts(imported, emptyExisting);
    expect(report.assets.newItems).toHaveLength(1);
    expect(report.assets.conflicts).toHaveLength(0);
  });

  it('detects asset conflict by matching id', () => {
    const asset = { id: 'a1', name: 'Existing' } as Asset;
    const importedAsset = { id: 'a1', name: 'Imported' } as Asset;
    const imported = { assets: [importedAsset] };
    const existing = { ...emptyExisting, assets: [asset] };
    const report = detectConflicts(imported, existing);
    expect(report.assets.conflicts).toHaveLength(1);
    expect(report.assets.conflicts[0].existing.name).toBe('Existing');
    expect(report.assets.conflicts[0].imported.name).toBe('Imported');
    expect(report.assets.newItems).toHaveLength(0);
  });

  it('detects strategy conflict by matching id', () => {
    const existing: Strategy = {
      id: 's1',
      name: 'Existing Strategy',
      root: { type: 'group', id: 'r', label: 'Root', weight: 1, children: [] },
      generatedPortfolioIds: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    const imported: Strategy = { ...existing, name: 'Updated Strategy' };
    const report = detectConflicts(
      { strategies: [imported] },
      { ...emptyExisting, strategies: [existing] },
    );
    expect(report.strategies.conflicts).toHaveLength(1);
    expect(report.strategies.conflicts[0].existing.name).toBe('Existing Strategy');
    expect(report.strategies.conflicts[0].imported.name).toBe('Updated Strategy');
    expect(report.strategies.newItems).toHaveLength(0);
  });

  it('detects new strategies without conflicts', () => {
    const strategy: Strategy = {
      id: 's1',
      name: 'New Strategy',
      root: { type: 'group', id: 'r', label: 'Root', weight: 1, children: [] },
      generatedPortfolioIds: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    const report = detectConflicts(
      { strategies: [strategy] },
      emptyExisting,
    );
    expect(report.strategies.newItems).toHaveLength(1);
    expect(report.strategies.conflicts).toHaveLength(0);
  });

  it('detects currency conflict by matching pair', () => {
    const existingRate: CurrencyRate = { pair: 'USDEUR', rates: [{ date: '2024-01-01', rate: 0.9 }] };
    const importedRate: CurrencyRate = { pair: 'USDEUR', rates: [{ date: '2024-01-01', rate: 0.95 }] };
    const imported = { currencies: [importedRate] };
    const existing = { ...emptyExisting, currencies: [existingRate] };
    const report = detectConflicts(imported, existing);
    expect(report.currencies.conflicts).toHaveLength(1);
    expect(report.currencies.newItems).toHaveLength(0);
  });

  it('detects setting conflicts by key', () => {
    const imported = { settings: { mainCurrency: 'USD', newSetting: true } };
    const existing = { ...emptyExisting, settings: { mainCurrency: 'EUR' } };
    const report = detectConflicts(imported, existing);
    expect(report.settings.conflicts).toHaveLength(1);
    expect(report.settings.conflicts[0].key).toBe('mainCurrency');
    expect(report.settings.newItems).toHaveLength(1);
  });

  it('returns empty report for scopes not in imported data', () => {
    const imported = {};
    const report = detectConflicts(imported, emptyExisting);
    expect(report.assets.conflicts).toHaveLength(0);
    expect(report.assets.newItems).toHaveLength(0);
    expect(report.strategies.conflicts).toHaveLength(0);
    expect(report.strategies.newItems).toHaveLength(0);
  });
});
