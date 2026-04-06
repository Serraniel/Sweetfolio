import type { Asset, Transaction, Portfolio } from '$lib/types';
import type { ParqetActivity, ParqetPortfolio } from './types';

export interface ParqetMappingResult {
  portfolio: Portfolio;
  assets: Asset[];
  transactions: Transaction[];
  skipped: number;
}

const SUPPORTED_ACTIVITY_TYPES = new Set(['buy', 'sell', 'dividend', 'interest', 'transfer_in', 'transfer_out']);

export function mapParqetActivitiesToSweetfolio(
  parqetPortfolio: ParqetPortfolio,
  activities: ParqetActivity[],
): ParqetMappingResult {
  const now = new Date().toISOString();
  const portfolioId = crypto.randomUUID();

  const assetByKey = new Map<string, Asset>();
  const transactions: Transaction[] = [];
  let skipped = 0;

  for (const act of activities) {
    if (act.holdingAssetType === 'cash' || act.holdingAssetType === 'custom' || act.holdingAssetType === 'real_estate') {
      skipped++;
      continue;
    }
    if (!SUPPORTED_ACTIVITY_TYPES.has(act.type)) {
      skipped++;
      continue;
    }

    const isin = act.asset?.isin ?? null;
    const symbol = act.asset?.symbol ?? null;
    const assetKey = isin ?? symbol ?? `holding:${act.holdingId}`;

    if (!assetByKey.has(assetKey)) {
      assetByKey.set(assetKey, {
        id: crypto.randomUUID(),
        name: isin ?? symbol ?? act.holdingId,
        isin: isin,
        wkn: null,
        currency: act.currency,
        classification: holdingTypeToClassification(act.holdingAssetType),
        prices: [],
        formatConfig: null,
        rawCSV: null,
        rawCSVStoredAt: null,
        createdAt: now,
        updatedAt: now,
        lastRefreshedAt: null,
      });
    }
    const asset = assetByKey.get(assetKey)!;

    let txType: 'buy' | 'sell' | 'dividend';
    let notes = act.description ?? '';
    switch (act.type) {
      case 'buy': txType = 'buy'; break;
      case 'sell': txType = 'sell'; break;
      case 'dividend':
      case 'interest': txType = 'dividend'; break;
      case 'transfer_in':
        txType = 'buy';
        notes = notes ? `Transfer in — ${notes}` : 'Transfer in';
        break;
      case 'transfer_out':
        txType = 'sell';
        notes = notes ? `Transfer out — ${notes}` : 'Transfer out';
        break;
      default:
        skipped++;
        continue;
    }

    const date = act.datetime.slice(0, 10);
    const isDividend = txType === 'dividend';

    transactions.push({
      id: act.id,
      portfolioId,
      type: txType,
      assetId: asset.id,
      date,
      quantity: isDividend ? null : (act.shares > 0 ? act.shares : null),
      price: isDividend ? null : (act.price > 0 ? act.price : null),
      fee: act.fee,
      amount: isDividend ? act.amount : null,
      withholdingTax: isDividend ? act.tax : 0,
      currency: act.currency,
      notes,
      createdAt: now,
      updatedAt: now,
    });
  }

  const portfolio: Portfolio = {
    id: portfolioId,
    name: parqetPortfolio.name,
    mode: 'tracked',
    allocations: [],
    isBenchmark: false,
    trackCash: false,
    cashCurrency: parqetPortfolio.currency,
    sourceStrategyId: null,
    createdAt: now,
    updatedAt: now,
  };

  return {
    portfolio,
    assets: [...assetByKey.values()],
    transactions,
    skipped,
  };
}

function holdingTypeToClassification(type: string): Asset['classification'] {
  switch (type) {
    case 'security': return 'stock';
    case 'crypto': return 'crypto';
    case 'commodity': return 'commodity';
    default: return 'unknown';
  }
}
