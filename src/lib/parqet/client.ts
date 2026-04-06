import { PARQET_BASE_URL } from './types';
import type { ParqetUser, ParqetPortfoliosResponse, ParqetActivitiesResponse, ParqetActivity } from './types';

export class ParqetClient {
  constructor(private accessToken: string) {}

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${PARQET_BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Parqet API error ${response.status}: ${text}`);
    }
    return response.json() as Promise<T>;
  }

  async getUser(): Promise<ParqetUser> {
    return this.fetch<ParqetUser>('/user');
  }

  async getPortfolios(): Promise<ParqetPortfoliosResponse> {
    return this.fetch<ParqetPortfoliosResponse>('/portfolios');
  }

  async getActivities(portfolioId: string, cursor?: string, limit = 500): Promise<ParqetActivitiesResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch<ParqetActivitiesResponse>(
      `/portfolios/${portfolioId}/activities?${params.toString()}`,
    );
  }

  async getAllActivities(portfolioId: string): Promise<ParqetActivity[]> {
    const all: ParqetActivity[] = [];
    let cursor: string | null = null;
    do {
      const response = await this.getActivities(portfolioId, cursor ?? undefined);
      all.push(...response.activities);
      cursor = response.cursor;
    } while (cursor);
    return all;
  }
}
