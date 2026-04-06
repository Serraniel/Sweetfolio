import type { Asset, Portfolio, Transaction } from '$lib/types';

const AMOUNT_FACTOR = 100;
const SHARES_FACTOR = 1_000_000_000;

function encodeAmount(value: number): number {
  return Math.round(value * AMOUNT_FACTOR);
}

function encodeShares(value: number): number {
  return Math.round(value * SHARES_FACTOR);
}

function formatDate(date: string): string {
  return `${date}T00:00`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function mapTransactionType(type: Transaction['type']): string {
  switch (type) {
    case 'buy': return 'BUY';
    case 'sell': return 'SELL';
    case 'dividend': return 'DIVIDEND';
  }
}

export function exportToPortfolioPerformanceXML(
  portfolios: Portfolio[],
  assets: Asset[],
  transactions: Transaction[],
): string {
  const portfolioIds = new Set(portfolios.map((p) => p.id));
  const filteredTx = transactions.filter((t) => portfolioIds.has(t.portfolioId));

  const referencedAssetIds = new Set(filteredTx.map((t) => t.assetId));
  const usedAssets = assets.filter((a) => referencedAssetIds.has(a.id));
  const assetIndex = new Map(usedAssets.map((a, i) => [a.id, i]));

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  lines.push('<client>');
  lines.push('  <version>1</version>');

  // Securities
  lines.push('  <securities>');
  for (const asset of usedAssets) {
    lines.push('    <security>');
    lines.push(`      <uuid>${escapeXml(asset.id)}</uuid>`);
    lines.push(`      <name>${escapeXml(asset.name)}</name>`);
    if (asset.isin) lines.push(`      <isin>${escapeXml(asset.isin)}</isin>`);
    if (asset.wkn) lines.push(`      <wkn>${escapeXml(asset.wkn)}</wkn>`);
    lines.push(`      <currencyCode>${escapeXml(asset.currency)}</currencyCode>`);
    lines.push(`      <updatedAt>${escapeXml(asset.updatedAt)}</updatedAt>`);
    if (asset.prices.length > 0) {
      lines.push('      <prices>');
      for (const p of asset.prices) {
        lines.push('        <price>');
        lines.push(`          <date>${escapeXml(formatDate(p.date))}</date>`);
        lines.push(`          <close>${encodeAmount(p.close)}</close>`);
        lines.push('        </price>');
      }
      lines.push('      </prices>');
    }
    lines.push('    </security>');
  }
  lines.push('  </securities>');

  // Accounts
  lines.push('  <accounts>');
  for (const pf of portfolios) {
    lines.push('    <account>');
    lines.push(`      <uuid>${escapeXml(pf.id)}-cash</uuid>`);
    lines.push(`      <name>${escapeXml(pf.name)} (Cash)</name>`);
    lines.push(`      <currencyCode>${escapeXml(pf.cashCurrency)}</currencyCode>`);
    lines.push('      <transactions/>');
    lines.push('    </account>');
  }
  lines.push('  </accounts>');

  // Portfolios
  lines.push('  <portfolios>');
  for (const pf of portfolios) {
    const pfTx = filteredTx.filter((t) => t.portfolioId === pf.id);
    const accountIndex = portfolios.indexOf(pf);

    lines.push('    <portfolio>');
    lines.push(`      <uuid>${escapeXml(pf.id)}</uuid>`);
    lines.push(`      <name>${escapeXml(pf.name)}</name>`);
    lines.push(`      <currencyCode>${escapeXml(pf.cashCurrency)}</currencyCode>`);
    const accountRef = accountIndex === 0
      ? '../../accounts/account'
      : `../../accounts/account[${accountIndex + 1}]`;
    lines.push(`      <referenceAccount reference="${accountRef}"/>`);
    lines.push('      <transactions>');

    for (const tx of pfTx) {
      const secIdx = assetIndex.get(tx.assetId);
      if (secIdx === undefined) continue;

      const secRef = secIdx === 0
        ? '../../securities/security'
        : `../../securities/security[${secIdx + 1}]`;

      const ppType = mapTransactionType(tx.type);
      const isDividend = tx.type === 'dividend';

      const amount = isDividend
        ? encodeAmount(tx.amount ?? 0)
        : encodeAmount((tx.quantity ?? 0) * (tx.price ?? 0));

      lines.push('        <portfolio-transaction>');
      lines.push(`          <uuid>${escapeXml(tx.id)}</uuid>`);
      lines.push(`          <date>${escapeXml(formatDate(tx.date))}</date>`);
      lines.push(`          <currencyCode>${escapeXml(tx.currency)}</currencyCode>`);
      lines.push(`          <type>${ppType}</type>`);
      lines.push(`          <security reference="${secRef}"/>`);
      lines.push(`          <shares>${isDividend ? 0 : encodeShares(tx.quantity ?? 0)}</shares>`);
      lines.push(`          <amount>${amount}</amount>`);
      lines.push(`          <fees>${encodeAmount(tx.fee)}</fees>`);
      lines.push(`          <taxes>${encodeAmount(tx.withholdingTax)}</taxes>`);
      if (tx.notes) lines.push(`          <note>${escapeXml(tx.notes)}</note>`);
      lines.push('        </portfolio-transaction>');
    }

    lines.push('      </transactions>');
    lines.push('    </portfolio>');
  }
  lines.push('  </portfolios>');
  lines.push('  <taxonomies/>');
  lines.push('  <watchlists/>');
  lines.push('  <dashboard/>');
  lines.push('</client>');

  return lines.join('\n');
}
