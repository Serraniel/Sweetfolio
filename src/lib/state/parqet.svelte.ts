/** Parqet Connect session handling (EX-5). */
import { loadConfig } from '#lib/config.ts';
import { ParqetClient } from '#lib/integrations/parqet/client.ts';
import { isExpired, refreshTokens, startLogin } from '#lib/integrations/parqet/oauth.ts';
import { app } from './app.svelte.ts';

export async function parqetConfigured(): Promise<boolean> {
	return !!(await loadConfig()).parqetClientId;
}

export async function connectParqet(returnTo: string): Promise<void> {
	const cfg = await loadConfig();
	if (!cfg.parqetClientId) throw new Error('Parqet is not configured on this instance (missing parqetClientId in config.json).');
	location.assign(await startLogin(cfg.parqetClientId, cfg.parqetScope, returnTo));
}

export async function disconnectParqet(): Promise<void> {
	await app.updateSettings({ parqetTokens: null });
}

export function parqetConnected(): boolean {
	return !!app.settings.parqetTokens;
}

async function token(): Promise<string> {
	const t = app.settings.parqetTokens;
	if (!t) throw new Error('Not connected to Parqet.');
	if (!isExpired(t)) return t.accessToken;
	const cfg = await loadConfig();
	try {
		const fresh = await refreshTokens(t, cfg.parqetClientId);
		await app.updateSettings({ parqetTokens: fresh });
		return fresh.accessToken;
	} catch (err) {
		await disconnectParqet();
		throw err;
	}
}

export function parqetClient(): ParqetClient {
	return new ParqetClient(token);
}
