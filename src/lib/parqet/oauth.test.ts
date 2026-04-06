import { describe, it, expect } from 'vitest';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  buildAuthUrl,
  generateState,
} from './oauth';

describe('generateCodeVerifier', () => {
  it('produces a string of 43-128 chars using allowed chars', () => {
    const v = generateCodeVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
    expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });
  it('produces different values each call', () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });
});

describe('generateCodeChallenge', () => {
  it('returns a non-empty base64url string', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = await generateCodeChallenge(verifier);
    expect(typeof challenge).toBe('string');
    expect(challenge.length).toBeGreaterThan(0);
    expect(challenge).not.toMatch(/[+/=]/);
  });
});

describe('generateState', () => {
  it('returns a hex string', () => {
    const s = generateState();
    expect(s).toMatch(/^[0-9a-f]+$/);
    expect(s.length).toBeGreaterThan(0);
  });
  it('produces different values each call', () => {
    expect(generateState()).not.toBe(generateState());
  });
});

describe('buildAuthUrl', () => {
  it('includes required OAuth params', () => {
    const url = buildAuthUrl('challenge123', 'state456', 'http://localhost:5173/callback');
    const u = new URL(url);
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('code_challenge')).toBe('challenge123');
    expect(u.searchParams.get('state')).toBe('state456');
    expect(u.searchParams.get('redirect_uri')).toBe('http://localhost:5173/callback');
    expect(u.searchParams.get('scope')).toBe('portfolio:read');
    expect(u.searchParams.get('client_id')).toBeDefined();
  });
});
