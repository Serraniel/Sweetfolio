import { describe, expect, it } from 'vitest';
import { compressToEncodedURIComponent } from 'lz-string';
import type { StrategyGroupNode } from '#lib/domain/types.ts';
import { asset } from '#test/fixtures.ts';
import { decodeShare, encodeAssetList, encodePortfolio, encodeStrategy, fromSharedTree, strategyIsins, toSharedTree } from './codec.ts';

describe('SH-1 share codec', () => {
	it('round-trips portfolios and asset lists', () => {
		expect(
			decodeShare(
				encodePortfolio('My | Pf', [
					{ isin: 'IE00B4L5Y983', weight: 0.6 },
					{ isin: 'US0378331005', weight: 0.4 }
				])
			)
		).toEqual({
			type: 'portfolio',
			name: 'My / Pf',
			allocations: [
				{ isin: 'IE00B4L5Y983', weight: 0.6 },
				{ isin: 'US0378331005', weight: 0.4 }
			]
		});
		expect(decodeShare(encodeAssetList(['A', 'B']))).toEqual({ type: 'assets', isins: ['A', 'B'] });
	});
	it('reads links created by v0.5.x', () => {
		const legacy = '#share=' + compressToEncodedURIComponent('p:Old|IE00B4L5Y983:0.5,US0378331005:0.5');
		expect(decodeShare(legacy)).toMatchObject({ type: 'portfolio', name: 'Old' });
		const legacyStrategy =
			'#share=' +
			compressToEncodedURIComponent(
				's:' +
					JSON.stringify({
						name: 'S',
						root: { type: 'group', id: 'r', label: 'R', weight: 1, children: [{ type: 'leaf', id: 'l', assetId: 'x', weight: 1 }] }
					})
			);
		const d = decodeShare(legacyStrategy);
		expect(d?.type === 'strategy' && d.root.children[0]).toMatchObject({ type: 'leaf', assetId: 'x' });
	});
	it('rejects garbage', () => {
		expect(decodeShare('#foo')).toBeNull();
		expect(decodeShare('#share=%%%')).toBeNull();
		expect(decodeShare('#share=' + compressToEncodedURIComponent('p:x|bad'))).toBeNull();
	});
	it('ST-5 strategies are shared by ISIN and resolved locally', () => {
		const root: StrategyGroupNode = {
			type: 'group',
			id: 'r',
			label: 'R',
			weight: 1,
			children: [
				{ type: 'leaf', id: 'l1', assetId: 'a1', weight: 0.5 },
				{ type: 'group', id: 'g', label: 'G', weight: 0.5, children: [{ type: 'leaf', id: 'l2', assetId: 'a2', weight: 1 }] }
			]
		};
		const assets = [asset({ id: 'a1', isin: 'IE00B4L5Y983', name: 'World' }), asset({ id: 'a2', name: 'No ISIN' })];
		const shared = toSharedTree(root, (id) => assets.find((a) => a.id === id));
		const decoded = decodeShare(encodeStrategy('S', shared));
		expect(decoded?.type).toBe('strategy');
		if (decoded?.type !== 'strategy') return;
		expect(strategyIsins(decoded.root)).toEqual(['IE00B4L5Y983']);
		const local = fromSharedTree(decoded.root, (leaf) => (leaf.isin === 'IE00B4L5Y983' ? 'mine' : null));
		expect(local.children).toHaveLength(2);
		expect(local.children[0]).toMatchObject({ type: 'leaf', assetId: 'mine' });
		expect(local.children[0]!.id).not.toBe('l1');
	});
});
