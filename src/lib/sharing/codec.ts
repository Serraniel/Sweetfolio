/**
 * URL hash sharing (SH-1): `#share=<lz-string>` with payloads
 *   portfolio  p:Name|ISIN:w,ISIN:w
 *   assets     a:ISIN,ISIN
 *   strategy   s:{"name":…,"root":…}  — v2 leaves carry `isin`/`name` instead of local ids (ST-5)
 * Links created by v0.5.x stay readable.
 */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Asset, StrategyGroupNode, StrategyNode } from '#lib/domain/types.ts';

export interface SharedLeaf {
	type: 'leaf';
	weight: number;
	isin?: string;
	name?: string;
	/** Legacy (v0.5 epic) links: the sender's local asset id. */
	assetId?: string;
}
export interface SharedGroup {
	type: 'group';
	label: string;
	weight: number;
	children: Array<SharedGroup | SharedLeaf>;
}

export type SharePayload =
	| { type: 'portfolio'; name: string; allocations: Array<{ isin: string; weight: number }> }
	| { type: 'assets'; isins: string[] }
	| { type: 'strategy'; name: string; root: SharedGroup };

const PREFIX = 'share=';

function wrap(raw: string): string {
	return `#${PREFIX}${compressToEncodedURIComponent(raw)}`;
}

export function encodePortfolio(name: string, allocations: Array<{ isin: string; weight: number }>): string {
	const safeName = name.replace(/\|/g, '/');
	return wrap(`p:${safeName}|${allocations.map((a) => `${a.isin}:${Math.round(a.weight * 1e6) / 1e6}`).join(',')}`);
}

export function encodeAssetList(isins: string[]): string {
	return wrap(`a:${isins.join(',')}`);
}

export function toSharedTree(root: StrategyGroupNode, assetById: (id: string) => Asset | undefined): SharedGroup {
	const walk = (n: StrategyNode): SharedGroup | SharedLeaf => {
		if (n.type === 'group') return { type: 'group', label: n.label, weight: round(n.weight), children: n.children.map(walk) };
		const a = assetById(n.assetId);
		return { type: 'leaf', weight: round(n.weight), ...(a?.isin ? { isin: a.isin } : {}), name: a?.name ?? 'Unknown asset' };
	};
	return walk(root) as SharedGroup;
}

const round = (w: number) => Math.round(w * 1e6) / 1e6;

export function encodeStrategy(name: string, root: SharedGroup): string {
	return wrap(`s:${JSON.stringify({ v: 2, name, root })}`);
}

export function decodeShare(hash: string): SharePayload | null {
	const h = hash.startsWith('#') ? hash.slice(1) : hash;
	if (!h.startsWith(PREFIX)) return null;
	let raw: string | null = null;
	try {
		raw = decompressFromEncodedURIComponent(h.slice(PREFIX.length));
	} catch {
		return null;
	}
	if (!raw) return null;
	if (raw.startsWith('p:')) {
		const body = raw.slice(2);
		const pipe = body.lastIndexOf('|');
		if (pipe <= 0) return null;
		const name = body.slice(0, pipe);
		const allocations: Array<{ isin: string; weight: number }> = [];
		for (const part of body.slice(pipe + 1).split(',')) {
			const i = part.lastIndexOf(':');
			const isin = part.slice(0, i).trim().toUpperCase();
			const weight = Number(part.slice(i + 1));
			if (i <= 0 || !isin || !Number.isFinite(weight) || weight < 0) return null;
			allocations.push({ isin, weight });
		}
		return allocations.length ? { type: 'portfolio', name, allocations } : null;
	}
	if (raw.startsWith('a:')) {
		const isins = raw
			.slice(2)
			.split(',')
			.map((s) => s.trim().toUpperCase())
			.filter(Boolean);
		return isins.length ? { type: 'assets', isins } : null;
	}
	if (raw.startsWith('s:')) {
		try {
			const parsed = JSON.parse(raw.slice(2)) as { name?: unknown; root?: unknown };
			const root = sanitizeTree(parsed.root);
			if (typeof parsed.name !== 'string' || !parsed.name || !root || root.type !== 'group') return null;
			return { type: 'strategy', name: parsed.name, root };
		} catch {
			return null;
		}
	}
	return null;
}

function sanitizeTree(n: unknown): SharedGroup | SharedLeaf | null {
	const o = n as Record<string, unknown> | null;
	if (!o || typeof o !== 'object') return null;
	const weight = typeof o.weight === 'number' && Number.isFinite(o.weight) ? o.weight : 0;
	if (o.type === 'group') {
		const children = Array.isArray(o.children) ? o.children.map(sanitizeTree).filter((c): c is SharedGroup | SharedLeaf => !!c) : [];
		return { type: 'group', label: typeof o.label === 'string' ? o.label : 'Group', weight, children };
	}
	if (o.type === 'leaf') {
		return {
			type: 'leaf',
			weight,
			...(typeof o.isin === 'string' ? { isin: o.isin.toUpperCase() } : {}),
			...(typeof o.name === 'string' ? { name: o.name } : {}),
			...(typeof o.assetId === 'string' ? { assetId: o.assetId } : {})
		};
	}
	return null;
}

/** All ISINs referenced by a shared strategy. */
export function strategyIsins(root: SharedGroup): string[] {
	const out = new Set<string>();
	const walk = (n: SharedGroup | SharedLeaf) => {
		if (n.type === 'leaf') {
			if (n.isin) out.add(n.isin);
		} else n.children.forEach(walk);
	};
	walk(root);
	return [...out];
}

/**
 * Build a local strategy tree from a shared one. `resolve` maps a shared leaf to
 * a local asset id (or null to drop the leaf).
 */
export function fromSharedTree(root: SharedGroup, resolve: (leaf: SharedLeaf) => string | null): StrategyGroupNode {
	const walk = (n: SharedGroup | SharedLeaf): StrategyNode | null => {
		if (n.type === 'leaf') {
			const assetId = resolve(n);
			return assetId ? { type: 'leaf', id: crypto.randomUUID(), assetId, weight: n.weight } : null;
		}
		const children = n.children.map(walk).filter((c): c is StrategyNode => !!c);
		return { type: 'group', id: crypto.randomUUID(), label: n.label, weight: n.weight, children };
	};
	const g = walk(root) as StrategyGroupNode;
	return { ...g, weight: 1 };
}

export function shareUrl(hash: string, base = typeof location !== 'undefined' ? location.origin : ''): string {
	return `${base}/${hash}`;
}
