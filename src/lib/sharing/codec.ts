/**
 * URL sharing codec for portfolios, asset lists, and strategies.
 *
 * Encoding format (before compression):
 *   Portfolio: "p:Name|ISIN:0.6,ISIN:0.4"
 *   Asset list: "a:ISIN1,ISIN2,ISIN3"
 *   Strategy: "s:<JSON>" where JSON is { name, root }
 *
 * The payload is compressed with lz-string (URI-safe encoding)
 * and appended as a hash fragment: #share=<compressed>
 */

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { StrategyGroupNode } from '$lib/types';

export type SharePayload =
  | { type: 'portfolio'; name: string; allocations: Array<{ isin: string; weight: number }> }
  | { type: 'assets'; isins: string[] }
  | { type: 'strategy'; name: string; root: StrategyGroupNode };

const SHARE_PREFIX = 'share=';

/**
 * Encode a portfolio into a shareable hash fragment.
 */
export function encodePortfolio(
  name: string,
  allocations: Array<{ isin: string; weight: number }>,
): string {
  const allocStr = allocations.map((a) => `${a.isin}:${a.weight}`).join(',');
  const raw = `p:${name}|${allocStr}`;
  return `#${SHARE_PREFIX}${compressToEncodedURIComponent(raw)}`;
}

/**
 * Encode a list of asset ISINs into a shareable hash fragment.
 */
export function encodeAssetList(isins: string[]): string {
  const raw = `a:${isins.join(',')}`;
  return `#${SHARE_PREFIX}${compressToEncodedURIComponent(raw)}`;
}

/**
 * Encode a strategy into a shareable hash fragment.
 * The tree structure is serialized as compact JSON.
 */
export function encodeStrategy(name: string, root: StrategyGroupNode): string {
  const raw = `s:${JSON.stringify({ name, root })}`;
  return `#${SHARE_PREFIX}${compressToEncodedURIComponent(raw)}`;
}

/**
 * Extract and decode a share payload from a URL hash string.
 * Returns null if the hash does not contain a valid share payload.
 */
export function decodeSharePayload(hash: string): SharePayload | null {
  // Strip leading '#' if present
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!h.startsWith(SHARE_PREFIX)) return null;

  const compressed = h.slice(SHARE_PREFIX.length);
  if (!compressed) return null;

  let raw: string | null;
  try {
    raw = decompressFromEncodedURIComponent(compressed);
  } catch {
    return null;
  }
  if (!raw) return null;

  return parseRaw(raw);
}

function parseRaw(raw: string): SharePayload | null {
  if (raw.startsWith('p:')) {
    return parsePortfolio(raw.slice(2));
  }
  if (raw.startsWith('a:')) {
    return parseAssetList(raw.slice(2));
  }
  if (raw.startsWith('s:')) {
    return parseStrategy(raw.slice(2));
  }
  return null;
}

function parsePortfolio(body: string): SharePayload | null {
  const pipeIndex = body.indexOf('|');
  if (pipeIndex === -1) return null;

  const name = body.slice(0, pipeIndex);
  const allocStr = body.slice(pipeIndex + 1);
  if (!name || !allocStr) return null;

  const allocations: Array<{ isin: string; weight: number }> = [];
  for (const part of allocStr.split(',')) {
    const colonIndex = part.lastIndexOf(':');
    if (colonIndex === -1) return null;
    const isin = part.slice(0, colonIndex);
    const weight = parseFloat(part.slice(colonIndex + 1));
    if (!isin || isNaN(weight)) return null;
    allocations.push({ isin, weight });
  }

  if (allocations.length === 0) return null;
  return { type: 'portfolio', name, allocations };
}

function parseAssetList(body: string): SharePayload | null {
  if (!body) return null;
  const isins = body.split(',').filter(Boolean);
  if (isins.length === 0) return null;
  return { type: 'assets', isins };
}

function parseStrategy(body: string): SharePayload | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed.name !== 'string' || !parsed.name) return null;
    if (!parsed.root || parsed.root.type !== 'group') return null;
    return { type: 'strategy', name: parsed.name, root: parsed.root };
  } catch {
    return null;
  }
}
