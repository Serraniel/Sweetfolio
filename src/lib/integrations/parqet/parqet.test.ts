import { describe, expect, it, vi } from 'vitest';
import { ParqetClient } from './client.ts';
import { mapParqetActivities } from './mapper.ts';
import { buildAuthorizeUrl, codeChallenge, completeLogin, isExpired } from './oauth.ts';

describe('EX-5 Parqet OAuth (PKCE)', () => {
	it('computes the RFC 7636 S256 challenge', async () => {
		expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
	});
	it('builds the authorize URL', () => {
		const u = new URL(
			buildAuthorizeUrl({ clientId: 'c', redirectUri: 'https://x/callback', state: 's', challenge: 'ch', scope: 'portfolio:read' })
		);
		expect(u.searchParams.get('code_challenge_method')).toBe('S256');
		expect(u.searchParams.get('response_type')).toBe('code');
	});
	it('rejects a mismatching state', async () => {
		await expect(
			completeLogin(new URLSearchParams('code=1&state=evil'), {
				state: 'good',
				verifier: 'v',
				redirectUri: 'r',
				clientId: 'c',
				returnTo: '/'
			})
		).rejects.toThrow(/state/);
	});
	it('exchanges the code', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 })))
		);
		const t = await completeLogin(new URLSearchParams('code=1&state=s'), {
			state: 's',
			verifier: 'v',
			redirectUri: 'r',
			clientId: 'c',
			returnTo: '/'
		});
		expect(t).toMatchObject({ accessToken: 'at', refreshToken: 'rt' });
		expect(isExpired(t)).toBe(false);
		vi.unstubAllGlobals();
	});
});

describe('EX-5 Parqet client', () => {
	it('paginates activities with the cursor', async () => {
		const pages = [
			{ activities: [{ id: '1', type: 'buy', datetime: '2024-01-01' }], cursor: 'c2' },
			{ activities: [{ id: '2', type: 'sell', datetime: '2024-01-02' }], cursor: null }
		];
		const urls: string[] = [];
		const client = new ParqetClient(async () => 'tok', (async (url: string) => {
			urls.push(url);
			return new Response(JSON.stringify(pages.shift()));
		}) as typeof fetch);
		const acts = await client.activities('p1');
		expect(acts.map((a) => a.id)).toEqual(['1', '2']);
		expect(urls[1]).toContain('cursor=c2');
	});
});

describe('EX-5 Parqet mapping', () => {
	it('maps all activity types', () => {
		const r = mapParqetActivities({ id: 'p', name: 'Depot', currency: 'EUR' }, [
			{
				id: '1',
				type: 'buy',
				holdingAssetType: 'security',
				shares: 2,
				price: 50,
				fee: 1,
				datetime: '2024-01-02T10:00:00Z',
				asset: { isin: 'IE00B4L5Y983', name: 'World' }
			},
			{
				id: '2',
				type: 'dividend',
				holdingAssetType: 'security',
				amount: 5,
				tax: 1,
				datetime: '2024-02-02T10:00:00Z',
				asset: { isin: 'IE00B4L5Y983' }
			},
			{
				id: '3',
				type: 'transfer_out',
				holdingAssetType: 'security',
				shares: 1,
				price: 60,
				datetime: '2024-03-02T10:00:00Z',
				asset: { isin: 'IE00B4L5Y983' }
			},
			{ id: '4', type: 'deposit', holdingAssetType: 'cash', amount: 1000, datetime: '2024-01-01T10:00:00Z' },
			{ id: '5', type: 'interest', holdingAssetType: 'cash', amount: 3, datetime: '2024-04-01T10:00:00Z' },
			{ id: '6', type: 'fees_taxes', holdingAssetType: 'cash', fee: 2, tax: 1, datetime: '2024-04-02T10:00:00Z' },
			{ id: '7', type: 'buy', holdingAssetType: 'real_estate', shares: 1, price: 1, datetime: '2024-04-02T10:00:00Z' }
		]);
		expect(r.securities).toHaveLength(1);
		expect(r.transactions.map((t) => t.type)).toEqual(['buy', 'dividend', 'sell', 'deposit', 'deposit', 'fee', 'tax']);
		expect(r.transactions[2]!.notes).toBe('Transfer out');
		expect(r.transactions[1]).toMatchObject({ amount: 5, withholdingTax: 1 });
		expect(r.warnings[0]).toMatch(/1 activity/);
		expect(r.portfolios[0]!.trackCash).toBe(true);
	});
});
