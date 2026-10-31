/** OAuth 2.0 Authorization Code + PKCE against Parqet Connect, browser only (EX-5). */
import type { ParqetTokens } from '#lib/domain/types.ts';

export const PARQET_API = 'https://connect.parqet.com';
export const PARQET_AUTHORIZE = `${PARQET_API}/oauth2/authorize`;
export const PARQET_TOKEN = `${PARQET_API}/oauth2/token`;

const PENDING_KEY = 'sweetfolio-parqet-oauth';

function base64url(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomString(bytes = 32): string {
	const a = new Uint8Array(bytes);
	crypto.getRandomValues(a);
	return base64url(a);
}

export async function codeChallenge(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	return base64url(new Uint8Array(digest));
}

export interface PendingAuth {
	state: string;
	verifier: string;
	redirectUri: string;
	clientId: string;
	returnTo: string;
}

export function buildAuthorizeUrl(p: { clientId: string; redirectUri: string; state: string; challenge: string; scope: string }): string {
	const q = new URLSearchParams({
		response_type: 'code',
		client_id: p.clientId,
		redirect_uri: p.redirectUri,
		scope: p.scope,
		state: p.state,
		code_challenge: p.challenge,
		code_challenge_method: 'S256'
	});
	return `${PARQET_AUTHORIZE}?${q}`;
}

/** Prepare a login: stores verifier/state in sessionStorage and returns the authorize URL. */
export async function startLogin(clientId: string, scope: string, returnTo: string, storage: Storage = sessionStorage): Promise<string> {
	const pending: PendingAuth = {
		state: randomString(16),
		verifier: randomString(48),
		redirectUri: `${location.origin}/callback`,
		clientId,
		returnTo
	};
	storage.setItem(PENDING_KEY, JSON.stringify(pending));
	return buildAuthorizeUrl({
		clientId,
		redirectUri: pending.redirectUri,
		state: pending.state,
		challenge: await codeChallenge(pending.verifier),
		scope
	});
}

export function takePending(storage: Storage = sessionStorage): PendingAuth | null {
	const raw = storage.getItem(PENDING_KEY);
	storage.removeItem(PENDING_KEY);
	try {
		return raw ? (JSON.parse(raw) as PendingAuth) : null;
	} catch {
		return null;
	}
}

interface TokenResponse {
	access_token: string;
	refresh_token?: string;
	expires_in?: number;
}

async function tokenRequest(body: Record<string, string>): Promise<ParqetTokens> {
	const res = await fetch(PARQET_TOKEN, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(body).toString()
	});
	if (!res.ok) throw new Error(`Parqet token request failed (${res.status}).`);
	const t = (await res.json()) as TokenResponse;
	return {
		accessToken: t.access_token,
		refreshToken: t.refresh_token ?? body.refresh_token ?? null,
		expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000
	};
}

/** Complete the callback: verify `state`, exchange the code. */
export async function completeLogin(params: URLSearchParams, pending: PendingAuth | null): Promise<ParqetTokens> {
	if (params.get('error')) throw new Error(params.get('error_description') ?? params.get('error')!);
	if (!pending) throw new Error('No login in progress. Please start the connection again.');
	if (params.get('state') !== pending.state) throw new Error('Invalid OAuth state — the login was not started here.');
	const code = params.get('code');
	if (!code) throw new Error('Parqet did not return an authorization code.');
	return tokenRequest({
		grant_type: 'authorization_code',
		code,
		redirect_uri: pending.redirectUri,
		client_id: pending.clientId,
		code_verifier: pending.verifier
	});
}

export function refreshTokens(tokens: ParqetTokens, clientId: string): Promise<ParqetTokens> {
	if (!tokens.refreshToken) throw new Error('Session expired. Please connect Parqet again.');
	return tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken, client_id: clientId });
}

export function isExpired(tokens: ParqetTokens, skewMs = 60_000): boolean {
	return tokens.expiresAt - skewMs <= Date.now();
}
