# Parqet Connect Integration Design

## Overview
Integrate Sweetfolio with Parqet Connect API to enable bidirectional sync between local portfolios and Parqet cloud portfolios.

## Features

### 1. OAuth2 PKCE Authentication Flow
- Settings page section for Parqet Connect
- "Connect to Parqet" button triggers OAuth2 PKCE flow
- Store tokens in IndexedDB settings (access_token, refresh_token, expires_at)
- Auto-refresh tokens before expiry
- Disconnect option to revoke and clear tokens

### 2. Import from Parqet (Pull)
- Fetch user's Parqet portfolios via GET /portfolios
- Fetch activities per portfolio via GET /portfolios/{id}/activities (paginated)
- Fetch performance data via POST /performance
- Map Parqet data to Sweetfolio types:
  - Parqet portfolio → Sweetfolio Portfolio (tracked mode)
  - Parqet activities → Sweetfolio Transactions
  - Parqet holdings → Sweetfolio Assets (create if missing, match by ISIN)
- Import wizard step: select which Parqet portfolios to import
- Conflict resolution with existing data

### 3. Export to Parqet (Push)
- Push local tracked portfolios to Parqet
- Create portfolio via POST /portfolios
- Push transactions as activities via POST /portfolios/{id}/activities (batch 100)
- Map Sweetfolio transaction types to Parqet activity types
- Progress indicator for large pushes

### 4. Live Portfolio Dashboard (Parqet Performance Data)
- Show real-time Parqet performance KPIs alongside local calculations
- Compare Sweetfolio metrics vs Parqet metrics (XIRR, TTWROR)
- Display Parqet holdings with logos, quotes, positions

### 5. Sync Status & Management
- Show connection status in nav/settings
- Last sync timestamp
- Per-portfolio sync status (linked to Parqet ID)
- Manual sync trigger

### 6. Watchlist via Parqet (Creative Feature)
- User noted Parqet lacks a good watchlist
- Build a local watchlist feature that uses Parqet's asset data
- Create "watchlist" portfolios in Parqet with zero-quantity holdings
- Track performance via the performance endpoint without buying

## Architecture

### New Files
- `src/lib/parqet/` — Parqet integration module
  - `oauth.ts` — PKCE flow, token management, refresh
  - `client.ts` — API client (typed fetch wrapper)
  - `types.ts` — Parqet API types
  - `sync.ts` — Bidirectional sync logic
  - `mapper.ts` — Parqet ↔ Sweetfolio type mapping
- `src/lib/components/parqet/` — UI components
  - `ParqetConnectButton.svelte` — OAuth trigger
  - `ParqetSyncPanel.svelte` — Sync management
  - `ParqetPortfolioPicker.svelte` — Select portfolios to import
  - `ParqetPerformanceCard.svelte` — Live performance display
  - `WatchlistSection.svelte` — Watchlist UI
- `src/routes/settings/` — Settings page additions
- `src/routes/watchlist/` — New watchlist page

### Token Storage
Store in IndexedDB settings store:
- `parqet_access_token`
- `parqet_refresh_token`
- `parqet_token_expires_at`
- `parqet_client_id` (configurable for user's own app)

### Type Mapping

| Parqet | Sweetfolio |
|--------|-----------|
| buy | buy |
| sell | sell |
| dividend | dividend |
| transfer_in | buy (with note) |
| transfer_out | sell (with note) |
| interest | dividend (with note) |
| fees_taxes | (fee field on transactions) |
| deposit/withdrawal | (cash transactions) |

### OAuth PKCE Flow (browser-only, no server needed)
1. Generate code_verifier (random 43-128 chars)
2. Compute code_challenge = base64url(sha256(code_verifier))
3. Open popup/redirect to authorize URL with client_id, redirect_uri, code_challenge, scope
4. Receive authorization code at callback
5. Exchange code + code_verifier for tokens at token URL
6. Store tokens, set refresh timer

## Implementation Order
1. OAuth + token management
2. API client + types
3. Import from Parqet
4. Export to Parqet
5. Performance dashboard
6. Watchlist feature
7. Sync management UI
