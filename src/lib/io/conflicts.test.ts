import { describe, it, expect } from 'vitest';
import { detectConflicts } from './conflicts';
import type { Asset, CurrencyRate } from '$lib/types';

describe('detectConflicts', () => {
  it('detects no conflicts when existing data is empty', () => {
    const imported = {
      assets: [{ id: 'a1', name: 'New Asset' } as Asset],
    };
    const existing = { assets: [], portfolios: [], currencies: [], simulations: [], settings: {} };
    const report = detectConflicts(imported, existing);
    expect(report.assets.newItems).toHaveLength(1);
    expect(report.assets.conflicts).toHaveLength(0);
  });

  it('detects asset conflict by matching id', () => {
    const asset = { id: 'a1', name: 'Existing' } as Asset;
    const importedAsset = { id: 'a1', name: 'Imported' } as Asset;
    const imported = { assets: [importedAsset] };
    const existing = { assets: [asset], portfolios: [], currencies: [], simulations: [], settings: {} };
    const report = detectConflicts(imported, existing);
    expect(report.assets.conflicts).toHaveLength(1);
    expect(report.assets.conflicts[0].existing.name).toBe('Existing');
    expect(report.assets.conflicts[0].imported.name).toBe('Imported');
    expect(report.assets.newItems).toHaveLength(0);
  });

  it('detects currency conflict by matching pair', () => {
    const rate: CurrencyRate = { pair: 'USDEUR', rates: [] };
    const imported = { currencies: [rate] };
    const existing = { assets: [], portfolios: [], currencies: [rate], simulations: [], settings: {} };
    const report = detectConflicts(imported, existing);
    expect(report.currencies.conflicts).toHaveLength(1);
    expect(report.currencies.newItems).toHaveLength(0);
  });

  it('detects setting conflicts by key', () => {
    const imported = { settings: { mainCurrency: 'USD', newSetting: true } };
    const existing = { assets: [], portfolios: [], currencies: [], simulations: [], settings: { mainCurrency: 'EUR' } };
    const report = detectConflicts(imported, existing);
    expect(report.settings.conflicts).toHaveLength(1);
    expect(report.settings.conflicts[0].key).toBe('mainCurrency');
    expect(report.settings.newItems).toHaveLength(1);
  });

  it('returns empty report for scopes not in imported data', () => {
    const imported = {};
    const existing = { assets: [], portfolios: [], currencies: [], simulations: [], settings: {} };
    const report = detectConflicts(imported, existing);
    expect(report.assets.conflicts).toHaveLength(0);
    expect(report.assets.newItems).toHaveLength(0);
  });
});
