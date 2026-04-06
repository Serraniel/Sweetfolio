import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParqetClient } from './client';

describe('ParqetClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('sends Authorization header with Bearer token', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ userId: 'u1', installationId: 'i1', state: 'active', permissions: [] }),
    });
    const client = new ParqetClient('my-token');
    await client.getUser();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/user');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer my-token');
  });

  it('throws on non-ok response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Unauthorized' });
    const client = new ParqetClient('bad-token');
    await expect(client.getUser()).rejects.toThrow('401');
  });

  it('paginates activities via cursor', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          activities: [{ id: 'a1', type: 'buy' }],
          cursor: 'next-cursor',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ activities: [{ id: 'a2', type: 'sell' }], cursor: null }),
      });

    const client = new ParqetClient('token');
    const all = await client.getAllActivities('portfolio-1');
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe('a1');
    expect(all[1].id).toBe('a2');
  });
});
