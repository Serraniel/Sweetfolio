import { describe, it, expect } from 'vitest';
import { exportToPortfolioPerformanceXML } from './pp-export';
import type { Asset, Portfolio, Transaction } from '$lib/types';

const asset: Asset = {
  id: 'asset-1',
  name: 'Apple Inc',
  isin: 'US0378331005',
  wkn: null,
  currency: 'USD',
  classification: 'stock',
  prices: [
    { date: '2024-01-15', close: 182.5 },
    { date: '2024-01-16', close: 185.0 },
  ],
  formatConfig: null,
  rawCSV: null,
  rawCSVStoredAt: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  lastRefreshedAt: null,
};

const portfolio: Portfolio = {
  id: 'portfolio-1',
  name: 'My Portfolio',
  mode: 'tracked',
  allocations: [],
  isBenchmark: false,
  trackCash: false,
  cashCurrency: 'EUR',
  sourceStrategyId: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const buyTx: Transaction = {
  id: 'tx-1',
  portfolioId: 'portfolio-1',
  type: 'buy',
  assetId: 'asset-1',
  date: '2024-01-15',
  quantity: 5,
  price: 182.5,
  fee: 1.99,
  amount: null,
  withholdingTax: 0,
  currency: 'USD',
  notes: '',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const dividendTx: Transaction = {
  ...buyTx,
  id: 'tx-2',
  type: 'dividend',
  quantity: null,
  price: null,
  amount: 12.5,
  withholdingTax: 1.87,
};

describe('exportToPortfolioPerformanceXML', () => {
  it('produces valid XML starting with <?xml', () => {
    const xml = exportToPortfolioPerformanceXML([portfolio], [asset], [buyTx]);
    expect(xml).toMatch(/^<\?xml/);
  });

  it('includes the asset as a security with ISIN', () => {
    const xml = exportToPortfolioPerformanceXML([portfolio], [asset], [buyTx]);
    expect(xml).toContain('<isin>US0378331005</isin>');
    expect(xml).toContain('<name>Apple Inc</name>');
    expect(xml).toContain('<currencyCode>USD</currencyCode>');
  });

  it('encodes buy transaction with correct shares and fees', () => {
    const xml = exportToPortfolioPerformanceXML([portfolio], [asset], [buyTx]);
    expect(xml).toContain('<type>BUY</type>');
    // 5 shares × 1e9 = 5000000000
    expect(xml).toContain('<shares>5000000000</shares>');
    // fee: 1.99 → 199
    expect(xml).toContain('<fees>199</fees>');
  });

  it('encodes dividend transaction', () => {
    const xml = exportToPortfolioPerformanceXML([portfolio], [asset], [dividendTx]);
    expect(xml).toContain('<type>DIVIDEND</type>');
    // amount: 12.5 → 1250
    expect(xml).toContain('<amount>1250</amount>');
    // taxes: 1.87 → 187
    expect(xml).toContain('<taxes>187</taxes>');
  });

  it('includes price history in security', () => {
    const xml = exportToPortfolioPerformanceXML([portfolio], [asset], [buyTx]);
    // 182.5 → 18250
    expect(xml).toContain('<close>18250</close>');
  });

  it('includes the portfolio name', () => {
    const xml = exportToPortfolioPerformanceXML([portfolio], [asset], [buyTx]);
    expect(xml).toContain('<name>My Portfolio</name>');
  });

  it('handles sell transactions', () => {
    const sellTx: Transaction = { ...buyTx, id: 'tx-3', type: 'sell' };
    const xml = exportToPortfolioPerformanceXML([portfolio], [asset], [sellTx]);
    expect(xml).toContain('<type>SELL</type>');
  });

  it('rounds amounts to avoid float artifacts', () => {
    const tinyTx: Transaction = { ...buyTx, price: 0.1, quantity: 3, fee: 0 };
    const xml = exportToPortfolioPerformanceXML([portfolio], [asset], [tinyTx]);
    // 3 × 0.1 = 0.3 → 30 (not 30.000000000000004)
    expect(xml).toContain('<amount>30</amount>');
  });
});
