// src/lib/parqet/types.ts

export const PARQET_BASE_URL = 'https://connect.parqet.com';
export const PARQET_AUTH_URL = `${PARQET_BASE_URL}/oauth2/authorize`;
export const PARQET_TOKEN_URL = `${PARQET_BASE_URL}/oauth2/token`;
export const PARQET_CLIENT_ID = '019cc556-cefa-7752-b920-d41b927c7756';

export type ParqetActivityType =
  | 'buy' | 'sell' | 'dividend' | 'interest'
  | 'transfer_in' | 'transfer_out' | 'fees_taxes'
  | 'deposit' | 'withdrawal';

export type ParqetAssetType =
  | 'cash' | 'security' | 'crypto' | 'commodity' | 'custom' | 'real_estate';

export interface ParqetUser {
  userId: string;
  installationId: string;
  state: string;
  permissions: Array<{
    action: string;
    resourceType: string;
    resourceId: string;
  }>;
}

export interface ParqetPortfolio {
  id: string;
  currency: string;
  name: string;
  createdAt: string;
  distinctBrokers: string[];
}

export interface ParqetPortfoliosResponse {
  items: ParqetPortfolio[];
}

export interface ParqetActivity {
  id: string;
  type: ParqetActivityType;
  holdingId: string;
  holdingAssetType: ParqetAssetType;
  shares: number;
  price: number;
  tax: number;
  fee: number;
  currency: string;
  datetime: string;
  description: string;
  broker: string;
  amount: number;
  amountNet: number;
  asset?: {
    assetIdentifierType: string;
    isin?: string;
    symbol?: string;
  };
}

export interface ParqetActivitiesResponse {
  activities: ParqetActivity[];
  cursor: string | null;
}

export interface ParqetTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}
