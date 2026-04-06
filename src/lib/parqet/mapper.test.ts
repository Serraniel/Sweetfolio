import { describe, it, expect } from 'vitest';
import { mapParqetActivitiesToSweetfolio } from './mapper';
import type { ParqetActivity, ParqetPortfolio } from './types';

const makeActivity = (overrides: Partial<ParqetActivity> = {}): ParqetActivity => ({
  id: 'act-1',
  type: 'buy',
  holdingId: 'h1',
  holdingAssetType: 'security',
  shares: 10,
  price: 100,
  tax: 0,
  fee: 1.5,
  currency: 'EUR',
  datetime: '2024-03-15T09:30:00.000Z',
  description: '',
  broker: 'test',
  amount: 1001.5,
  amountNet: 1000,
  asset: { assetIdentifierType: 'isin', isin: 'US0378331005' },
  ...overrides,
});

const portfolio: ParqetPortfolio = {
  id: 'p1',
  currency: 'EUR',
  name: 'My Portfolio',
  createdAt: '2024-01-01T00:00:00Z',
  distinctBrokers: [],
};

describe('mapParqetActivitiesToSweetfolio', () => {
  it('maps a buy activity correctly', () => {
    const result = mapParqetActivitiesToSweetfolio(portfolio, [makeActivity()]);
    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe('buy');
    expect(tx.quantity).toBe(10);
    expect(tx.price).toBe(100);
    expect(tx.fee).toBe(1.5);
    expect(tx.date).toBe('2024-03-15');
  });

  it('maps a dividend activity correctly', () => {
    const result = mapParqetActivitiesToSweetfolio(
      portfolio,
      [makeActivity({ type: 'dividend', shares: 0, price: 0, amount: 50 })],
    );
    const tx = result.transactions[0];
    expect(tx.type).toBe('dividend');
    expect(tx.amount).toBe(50);
  });

  it('maps transfer_in as buy with note', () => {
    const result = mapParqetActivitiesToSweetfolio(
      portfolio,
      [makeActivity({ type: 'transfer_in' })],
    );
    const tx = result.transactions[0];
    expect(tx.type).toBe('buy');
    expect(tx.notes).toContain('Transfer in');
  });

  it('maps transfer_out as sell with note', () => {
    const result = mapParqetActivitiesToSweetfolio(
      portfolio,
      [makeActivity({ type: 'transfer_out' })],
    );
    const tx = result.transactions[0];
    expect(tx.type).toBe('sell');
    expect(tx.notes).toContain('Transfer out');
  });

  it('creates one asset per unique ISIN', () => {
    const activities = [
      makeActivity({ id: 'a1', asset: { assetIdentifierType: 'isin', isin: 'DE0001234567' } }),
      makeActivity({ id: 'a2', asset: { assetIdentifierType: 'isin', isin: 'DE0001234567' } }),
      makeActivity({ id: 'a3', asset: { assetIdentifierType: 'isin', isin: 'US9876543210' } }),
    ];
    const result = mapParqetActivitiesToSweetfolio(portfolio, activities);
    expect(result.assets).toHaveLength(2);
  });

  it('skips cash and unsupported activities', () => {
    const result = mapParqetActivitiesToSweetfolio(
      portfolio,
      [makeActivity({ holdingAssetType: 'cash', type: 'deposit' })],
    );
    expect(result.transactions).toHaveLength(0);
  });

  it('uses withholdingTax from tax field for dividend', () => {
    const result = mapParqetActivitiesToSweetfolio(
      portfolio,
      [makeActivity({ type: 'dividend', tax: 7.5, shares: 0, price: 0, amount: 42 })],
    );
    expect(result.transactions[0].withholdingTax).toBe(7.5);
  });
});
