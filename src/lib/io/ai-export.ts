import type { Asset, Portfolio, Transaction } from '$lib/types';

export interface SweetfolioAIExport {
  format: 'sweetfolio-ai';
  version: string;
  exportedAt: string;
  description: string;
  capabilities: string[];
  data: {
    portfolios: AISweetfolioPortfolio[];
    assets: AIAssetSummary[];
  };
  manifest: {
    types: Record<string, TypeDescriptor>;
    currencyNote: string;
    dateNote: string;
  };
}

interface TypeDescriptor {
  description: string;
  fields: Record<string, string>;
}

export interface AISweetfolioPortfolio {
  id: string;
  name: string;
  mode: string;
  currency: string;
  transactions: AITransaction[];
}

export interface AITransaction {
  id: string;
  type: string;
  date: string;
  assetId: string;
  assetName: string;
  assetISIN: string | null;
  quantity: number | null;
  price: number | null;
  fee: number;
  amount: number | null;
  withholdingTax: number;
  currency: string;
  notes: string;
}

export interface AIAssetSummary {
  id: string;
  name: string;
  isin: string | null;
  wkn: string | null;
  currency: string;
  classification: string;
  priceHistory: Array<{ date: string; close: number }>;
  latestPrice: number | null;
  latestPriceDate: string | null;
}

export function exportToAIFormat(
  portfolios: Portfolio[],
  assets: Asset[],
  transactions: Transaction[],
): SweetfolioAIExport {
  const portfolioIds = new Set(portfolios.map((p) => p.id));
  const filteredTx = transactions.filter((t) => portfolioIds.has(t.portfolioId));
  const assetById = new Map(assets.map((a) => [a.id, a]));

  const aiPortfolios: AISweetfolioPortfolio[] = portfolios.map((pf) => {
    const pfTx = filteredTx.filter((t) => t.portfolioId === pf.id);
    return {
      id: pf.id,
      name: pf.name,
      mode: pf.mode,
      currency: pf.cashCurrency,
      transactions: pfTx.map((t) => {
        const a = assetById.get(t.assetId);
        return {
          id: t.id,
          type: t.type,
          date: t.date,
          assetId: t.assetId,
          assetName: a?.name ?? t.assetId,
          assetISIN: a?.isin ?? null,
          quantity: t.quantity,
          price: t.price,
          fee: t.fee,
          amount: t.amount,
          withholdingTax: t.withholdingTax,
          currency: t.currency,
          notes: t.notes,
        };
      }),
    };
  });

  const referencedAssetIds = new Set(filteredTx.map((t) => t.assetId));
  const aiAssets: AIAssetSummary[] = assets
    .filter((a) => referencedAssetIds.has(a.id))
    .map((a) => {
      const sorted = [...a.prices].sort((x, y) => y.date.localeCompare(x.date));
      return {
        id: a.id,
        name: a.name,
        isin: a.isin,
        wkn: a.wkn,
        currency: a.currency,
        classification: a.classification,
        priceHistory: a.prices,
        latestPrice: sorted[0]?.close ?? null,
        latestPriceDate: sorted[0]?.date ?? null,
      };
    });

  return {
    format: 'sweetfolio-ai',
    version: '1',
    exportedAt: new Date().toISOString(),
    description:
      'Sweetfolio portfolio data exported for AI agent use. ' +
      'Contains portfolio metadata, transaction history, and asset price data. ' +
      `Exported ${aiPortfolios.length} portfolio(s) with ${filteredTx.length} transaction(s) across ${aiAssets.length} asset(s).`,
    capabilities: [
      'read-portfolios',
      'read-transactions',
      'read-assets',
      'read-price-history',
    ],
    data: {
      portfolios: aiPortfolios,
      assets: aiAssets,
    },
    manifest: {
      types: {
        portfolio: {
          description: 'A portfolio groups transactions for performance tracking.',
          fields: {
            id: 'UUID, unique identifier',
            name: 'User-defined portfolio name',
            mode: '"tracked" = real portfolio with transactions; "model" = allocation model; "both" = both',
            currency: 'Base currency for cash accounting (ISO 4217)',
            transactions: 'Array of transactions in this portfolio',
          },
        },
        transaction: {
          description: 'A single buy, sell, or dividend event for one asset.',
          fields: {
            type: '"buy" | "sell" | "dividend"',
            date: 'ISO 8601 date YYYY-MM-DD',
            quantity: 'Number of shares/units (null for dividends)',
            price: 'Price per share at time of transaction (null for dividends)',
            fee: 'Brokerage fee in transaction currency',
            amount: 'Total dividend amount (null for buy/sell)',
            withholdingTax: 'Withholding tax deducted from dividend (0 if not applicable)',
            currency: 'ISO 4217 currency code for this transaction',
          },
        },
        asset: {
          description: 'A tradable security, ETF, crypto, or other asset.',
          fields: {
            isin: 'International Securities Identification Number (12-char, may be null)',
            wkn: 'German WKN identifier (may be null)',
            classification: 'One of: stock, etf, etn, etc, fund, bond, certificate, crypto, commodity, unknown',
            priceHistory: "Array of {date, close} price points in asset's native currency",
            latestPrice: 'Most recent close price',
          },
        },
      },
      currencyNote: 'All monetary values are in the currency field of each transaction/asset. No automatic conversion is applied.',
      dateNote: 'All dates are in ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ).',
    },
  };
}
