import { describe, it, expect } from 'vitest';
import { computeHoldings, computeCashBalance } from './holdings';
import type { Transaction } from '$lib/types';

function makeTx(overrides: Partial<Transaction> & Pick<Transaction, 'type' | 'assetId' | 'date'>): Transaction {
  return {
    id: crypto.randomUUID(),
    portfolioId: 'p1',
    quantity: null,
    price: null,
    fee: 0,
    amount: null,
    withholdingTax: 0,
    currency: 'EUR',
    notes: '',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides
  };
}

describe('computeHoldings', () => {
  it('returns empty for no transactions', () => {
    expect(computeHoldings([], new Map())).toEqual([]);
  });

  it('computes a single holding with current price', () => {
    const txs = [
      makeTx({ type: 'buy', assetId: 'a1', date: '2024-01-15', quantity: 10, price: 50, fee: 5 })
    ];
    const prices = new Map([['a1', 75]]);
    const holdings = computeHoldings(txs, prices);

    expect(holdings).toHaveLength(1);
    expect(holdings[0].assetId).toBe('a1');
    expect(holdings[0].quantity).toBe(10);
    expect(holdings[0].currentPrice).toBe(75);
    expect(holdings[0].currentValue).toBe(750);
    // totalCost should be 10*50 + 5 fee = 505
    expect(holdings[0].totalCost).toBeCloseTo(505);
    expect(holdings[0].unrealizedGain).toBeCloseTo(245);
    expect(holdings[0].weight).toBe(1); // only holding = 100%
  });

  it('computes weights across multiple holdings', () => {
    const txs = [
      makeTx({ type: 'buy', assetId: 'a1', date: '2024-01-15', quantity: 10, price: 100 }),
      makeTx({ type: 'buy', assetId: 'a2', date: '2024-01-15', quantity: 20, price: 50 })
    ];
    const prices = new Map([['a1', 100], ['a2', 50]]);
    const holdings = computeHoldings(txs, prices);

    expect(holdings).toHaveLength(2);
    // a1: 10 * 100 = 1000, a2: 20 * 50 = 1000, total = 2000
    expect(holdings[0].weight).toBe(0.5);
    expect(holdings[1].weight).toBe(0.5);
  });

  it('excludes fully sold positions', () => {
    const txs = [
      makeTx({ type: 'buy', assetId: 'a1', date: '2024-01-15', quantity: 10, price: 50 }),
      makeTx({ type: 'sell', assetId: 'a1', date: '2024-06-15', quantity: 10, price: 100 })
    ];
    const prices = new Map([['a1', 100]]);
    const holdings = computeHoldings(txs, prices);
    expect(holdings).toEqual([]);
  });
});

describe('computeCashBalance', () => {
  it('returns 0 for no transactions', () => {
    expect(computeCashBalance([], 0)).toBe(0);
  });

  it('deducts buys (price * quantity + fee)', () => {
    const txs = [
      makeTx({ type: 'buy', assetId: 'a1', date: '2024-01-15', quantity: 10, price: 50, fee: 5 })
    ];
    expect(computeCashBalance(txs, 1000)).toBe(495); // 1000 - 500 - 5
  });

  it('adds sells (price * quantity - fee)', () => {
    const txs = [
      makeTx({ type: 'sell', assetId: 'a1', date: '2024-01-15', quantity: 10, price: 100, fee: 10 })
    ];
    expect(computeCashBalance(txs, 0)).toBe(990); // 0 + 1000 - 10
  });

  it('adds dividends (amount - withholdingTax)', () => {
    const txs = [
      makeTx({ type: 'dividend', assetId: 'a1', date: '2024-06-15', amount: 50, withholdingTax: 13 })
    ];
    expect(computeCashBalance(txs, 0)).toBe(37); // 50 - 13
  });

  it('tracks running balance across all transaction types', () => {
    const txs = [
      makeTx({ type: 'buy', assetId: 'a1', date: '2024-01-15', quantity: 10, price: 50, fee: 5 }),
      makeTx({ type: 'dividend', assetId: 'a1', date: '2024-06-15', amount: 25, withholdingTax: 5 }),
      makeTx({ type: 'sell', assetId: 'a1', date: '2024-12-15', quantity: 5, price: 80, fee: 5 })
    ];
    // Start: 1000, Buy: -505 = 495, Dividend: +20 = 515, Sell: +395 = 910
    expect(computeCashBalance(txs, 1000)).toBe(910);
  });
});
