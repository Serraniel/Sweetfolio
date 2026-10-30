# Portfolio Performance Built-in Provider: Technical Research

> Reverse-engineered from the PP desktop app source code (v0.81.5), live API testing,
> and OIDC discovery documents. Date: 2026-02-28.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Identity Provider (Logto)](#identity-provider-logto)
3. [OAuth 2.0 Authentication Flow](#oauth-20-authentication-flow)
4. [OAuth Configuration (Extracted from Release)](#oauth-configuration-extracted-from-release)
5. [API Endpoints](#api-endpoints)
6. [Request/Response Examples](#requestresponse-examples)
7. [Token Structure and Claims](#token-structure-and-claims)
8. [Token Storage](#token-storage)
9. [CORS Assessment](#cors-assessment)
10. [Feasibility for Browser-based Integration](#feasibility-for-browser-based-integration)
11. [Recommended Implementation Approach](#recommended-implementation-approach)
12. [Source Files Reference](#source-files-reference)

---

## Architecture Overview

The system has three layers:

```
  PP Desktop App  ──OAuth 2.0 + PKCE──>  Logto Identity Server
       │                                  (accounts.portfolio-performance.info)
       │
       │──Bearer Token──>  PP Data API
                           (api.portfolio-performance.info)
```

- **Identity Provider**: Logto (open-source auth platform), hosted at
  `accounts.portfolio-performance.info` (also accessible via `logto.portfolio-performance.info`).
- **Data API**: Custom backend at `api.portfolio-performance.info` serving search, candle
  (historical), and quote (latest price) data.
- **Legacy**: There was previously a `portfolio-report.net` API (the `PortfolioReportQuoteFeed`),
  which was shut down on 2025-11-20. The new system is `PortfolioPerformanceFeed`.

---

## Identity Provider (Logto)

The OIDC discovery document is available at:

```
https://accounts.portfolio-performance.info/oidc/.well-known/openid-configuration
```

### Key Endpoints

| Purpose | URL |
|---------|-----|
| Issuer | `https://accounts.portfolio-performance.info/oidc` |
| Authorization | `https://accounts.portfolio-performance.info/oidc/auth` |
| Token | `https://accounts.portfolio-performance.info/oidc/token` |
| Revocation | `https://accounts.portfolio-performance.info/oidc/token/revocation` |
| UserInfo | `https://accounts.portfolio-performance.info/oidc/me` |
| End Session | `https://accounts.portfolio-performance.info/oidc/session/end` |
| JWKS | `https://accounts.portfolio-performance.info/oidc/jwks` |

### Supported Features

- **Grant types**: `authorization_code`, `refresh_token`, `implicit`, `client_credentials`,
  `urn:ietf:params:oauth:grant-type:token-exchange`
- **Code challenge**: `S256` (PKCE)
- **Response types**: `code`, `id_token`, `code id_token`, `none`
- **Token endpoint auth**: `none` (public client), `client_secret_basic`, `client_secret_post`,
  `client_secret_jwt`, `private_key_jwt`
- **ID token signing**: `ES384` (ECDSA with P-384 curve)
- **Scopes**: `openid`, `offline_access`, `profile`, `email`, `phone`, `address`,
  `custom_data`, `identities`, `roles`, `urn:logto:scope:organizations`,
  `urn:logto:scope:organization_roles`

### JWKS Public Key

```json
{
  "kty": "EC",
  "use": "sig",
  "kid": "mbiUn-8LmFMXPdSGFhC2IZedWtjitB_goS5R8nilzno",
  "alg": "ES384",
  "crv": "P-384",
  "x": "70IjWjOl5HCXn09jt0PbD-YdC2P4f-nhLYgDv8bg_OEMCVpbkdoaeLzb8zcHQU5G",
  "y": "Z3LCDROweOMzy1XFBCDhczM1M4j_EBg-9KYHAQI01P7PMGAo9_Ed4dkkbipTEhlb"
}
```

---

## OAuth 2.0 Authentication Flow

The PP desktop app uses **Authorization Code flow with PKCE** (public client, no client secret).

### Step-by-step Flow

#### 1. Generate PKCE Parameters

```
code_verifier = random 128-char string from [A-Za-z0-9\-._~]
code_challenge = base64url_no_pad(SHA-256(code_verifier))
```

Source: `PKCE.java` uses `SecureRandom` with charset
`ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~`.

#### 2. Start Local Callback Server

The app starts an embedded HTTP server on one of these ports (first available):
- **49968**
- **55968**
- **59968**

Callback URL: `http://localhost:{port}/success`

#### 3. Open Browser to Authorization URL

```
GET https://accounts.portfolio-performance.info/oidc/auth
  ?response_type=code
  &client_id=d6d0voq1w081sxty0qq7a
  &scope=openid offline_access
  &redirect_uri=http://localhost:{port}/success
  &code_challenge_method=S256
  &code_challenge={code_challenge}
  &state={random_state}
  &resource=https://api.portfolio-performance.info
```

Key parameters:
- **`resource`**: Logto uses RFC 8707 resource indicators. The value
  `https://api.portfolio-performance.info` tells Logto to issue an access token scoped to the
  PP data API (the `apiResource` from config.json).
- **`scope`**: `openid offline_access` — requests an ID token and a refresh token.

#### 4. User Authenticates in Browser

User logs in (email + password) or registers at the Logto-hosted login page
(`accounts.portfolio-performance.info`). The page supports Google SSO and Cloudflare Turnstile
captcha.

#### 5. Authorization Code Callback

Browser redirects to: `http://localhost:{port}/success?code={auth_code}&state={state}`

The `CallbackServer` extracts the code and state, validates the state matches, and returns a
success HTML page to the browser.

#### 6. Exchange Code for Tokens

```http
POST https://accounts.portfolio-performance.info/oidc/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={auth_code}
&redirect_uri=http://localhost:{port}/success
&client_id=d6d0voq1w081sxty0qq7a
&code_verifier={code_verifier}
&resource=https://api.portfolio-performance.info
```

Response (JSON):
```json
{
  "access_token": "eyJhbG...",
  "refresh_token": "LhVx...",
  "id_token": "eyJhbG...",
  "scope": "openid offline_access",
  "expires_in": 3600
}
```

#### 7. Store Tokens

- `id_token` → stored in memory
- `access_token` → stored in memory with expiration time
- `refresh_token` → persisted to disk (see Token Storage section)

#### 8. Refresh Token Flow

When the access token expires (typically after 1 hour):

```http
POST https://accounts.portfolio-performance.info/oidc/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token={refresh_token}
&client_id=d6d0voq1w081sxty0qq7a
&resource=https://api.portfolio-performance.info
```

If the refresh token is invalid (HTTP 400), all tokens are cleared and the user must
re-authenticate. Refresh tokens are valid for **90 days**.

#### 9. Sign-Out / Token Revocation

```http
POST https://accounts.portfolio-performance.info/oidc/token/revocation
Content-Type: application/x-www-form-urlencoded

token={refresh_token}
&client_id=d6d0voq1w081sxty0qq7a
```

---

## OAuth Configuration (Extracted from Release)

Extracted from `name.abuchen.portfolio_0.81.5.jar` at
`name/abuchen/portfolio/oauth/impl/config.json`:

```json
{
  "clientId": "d6d0voq1w081sxty0qq7a",
  "baseUrl": "https://accounts.portfolio-performance.info/oidc",
  "authEndpoint": "/auth",
  "tokenEndpoint": "/token",
  "revocationEndpoint": "/token/revocation",
  "authScope": "openid offline_access",
  "apiResource": "https://api.portfolio-performance.info"
}
```

- **Client type**: Public (no client secret)
- **Client ID**: `d6d0voq1w081sxty0qq7a`
- **Scopes used**: `openid offline_access`
- **API resource indicator**: `https://api.portfolio-performance.info`

---

## API Endpoints

Base URL: `https://api.portfolio-performance.info`

### Search (No Auth Required)

```
GET /v1/search?q={query}
GET /v1/search?isin={isin}
GET /v1/search?symbol={symbol}
```

Returns JSON array of securities with available markets.

### Historical Candles (Auth Required*)

```
GET /v1/candle?symbol={symbol}&from={epoch_seconds}&to={epoch_seconds}
Authorization: Bearer {access_token}
User-Agent: PortfolioPerformance/{version}
```

*Sample symbols can be accessed without auth via the `/sample` prefix.

### Sample Candles (No Auth Required)

```
GET /sample/v1/candle?symbol={symbol}&from={epoch_seconds}&to={epoch_seconds}
User-Agent: PortfolioPerformance/{version}
```

Available sample symbols (hardcoded in source):
`AMZN`, `NVD.F`, `MBG.DE`, `DTG.DE`, `IQQY.DE`, `SXRS.DE`, `EUNH.DE`, `IQQN.DE`,
`X014.DE`, `IQQE.DE`

### Latest Quote (Auth Required, Premium Only)

```
GET /v1/quote/us?symbol={symbol}
Authorization: Bearer {access_token}
User-Agent: PortfolioPerformance/{version}
```

This endpoint requires a `premium` plan in the JWT claims. Currently available only for US
securities.

---

## Request/Response Examples

### Search by ISIN

```http
GET https://api.portfolio-performance.info/v1/search?isin=US0378331005
User-Agent: PortfolioPerformance/0.81.5
```

Response:
```json
[
  {
    "description": "APPLE INC",
    "isin": "US0378331005",
    "provider": "PP",
    "type": "Common Stock",
    "markets": [
      { "currency": "EUR", "exchange": "XETR", "symbol": "APC.DE" },
      { "currency": "EUR", "exchange": "XFRA", "symbol": "APC.F" },
      { "currency": "USD", "exchange": "XNAS", "symbol": "AAPL" },
      { "currency": "USD", "exchange": "XLON", "symbol": "0R2V.L" },
      { "currency": "EUR", "exchange": "XMIL", "symbol": "1AAPL.MI" },
      { "currency": "USD", "exchange": "XSWX", "symbol": "AAPL.USD.SW" }
    ]
  }
]
```

### Historical Candles (Sample)

```http
GET https://api.portfolio-performance.info/sample/v1/candle?symbol=AMZN&from=1706745600&to=1707436800
User-Agent: PortfolioPerformance/0.81.5
```

Response:
```json
{
  "s": "ok",
  "t": [1706745600, 1706832000, 1707091200, 1707177600, 1707264000, 1707350400, 1707436800],
  "o": [155.87, 169.19, 170.20, 169.39, 169.48, 169.65, 170.90],
  "h": [159.76, 172.50, 170.55, 170.71, 170.88, 171.43, 175.00],
  "l": [155.62, 167.33, 167.70, 167.65, 168.94, 168.88, 170.58],
  "c": [159.28, 171.81, 170.31, 169.15, 170.53, 169.84, 174.45],
  "v": [76542419, 117218313, 55081297, 42505518, 47174060, 42316454, 56985986]
}
```

Field mapping:
- `s` — status (`"ok"` or `"no_data"`)
- `t` — timestamps (epoch seconds, UTC midnight)
- `o` — open prices
- `h` — high prices
- `l` — low prices
- `c` — close prices
- `v` — volumes

### Authenticated Candle Request

```http
GET https://api.portfolio-performance.info/v1/candle?symbol=AAPL&from=1700000000&to=1709000000
Authorization: Bearer eyJhbGciOiJFUzM4NCIsInR5cCI6ImF0K2p3dCIsImtpZCI6Im1ia...
User-Agent: PortfolioPerformance/0.81.5
```

Without auth, returns `HTTP 401` with empty body.

---

## Token Structure and Claims

The access token is a JWT (type `at+jwt`) signed with ES384. Decoded, it contains custom claims:

- **`sub`** — User subject identifier
- **`email`** — User's email address
- **`plan`** — Subscription tier (defaults to `"none"`, can be `"premium"`)

The `AccessToken.java` class uses Auth0's `com.auth0.jwt` library to decode. The `plan` claim
determines feature access — the latest quote endpoint requires `plan == "premium"`.

---

## Token Storage

### File-based Storage (Current)

Refresh tokens are stored at:
```
~/.PortfolioPerformance/workspace/.metadata/.plugins/name.abuchen.portfolio/token_storage
```

The token is **Base64-encoded** (not encrypted). File permissions are set to `rw-------`
(owner-only on POSIX systems).

### Legacy Secure Storage

Older versions used Eclipse's secure preferences at:
```
platform:/meta/name.abuchen.portfolio/secure_storage
```

The `TokenStorage` class performs automatic migration from legacy to file-based storage.

---

## CORS Assessment

### Identity Provider (Logto) — CORS SUPPORTED

The Logto token endpoint at `accounts.portfolio-performance.info` **does support CORS**:

```
OPTIONS https://accounts.portfolio-performance.info/oidc/token
Origin: http://localhost:3000

Response:
  Access-Control-Allow-Origin: http://localhost:3000
  Access-Control-Allow-Methods: POST
  Access-Control-Allow-Headers: Content-Type
  Access-Control-Max-Age: 3600
```

This means a browser-based app **can** perform the token exchange and refresh directly.

### Data API — NO CORS SUPPORT

The data API at `api.portfolio-performance.info` does **NOT** support CORS:

- `OPTIONS` requests return `HTTP 405 Method Not Allowed`
- `GET` responses contain **no** `Access-Control-Allow-Origin` headers
- Even unauthenticated endpoints (search, sample candles) lack CORS headers

This means a browser-based app **cannot** directly call the data API due to browser
same-origin policy enforcement.

---

## Feasibility for Browser-based Integration

### What Works Directly from Browser

1. **OAuth authentication flow** — The Logto OIDC endpoints support CORS. A browser SPA can
   perform the full Authorization Code + PKCE flow:
   - Redirect user to Logto login page
   - Receive callback with authorization code
   - Exchange code for tokens (CORS-enabled POST to token endpoint)
   - Refresh tokens (CORS-enabled POST to token endpoint)

2. **The client is public** — No client secret needed, so the flow is safe for browser use.

### What Does NOT Work from Browser

1. **Data API calls** — The `api.portfolio-performance.info` data API has no CORS headers.
   Browsers will block all requests to this API, even for unauthenticated endpoints like search.

### Workaround Options

#### Option A: Server-side Proxy (Recommended)

Run a lightweight proxy server that:
1. Receives requests from the browser frontend
2. Forwards them to `api.portfolio-performance.info` with the Bearer token
3. Returns the response with appropriate CORS headers

The proxy can be very thin — just pass through requests and add CORS headers. The OAuth flow
itself can still happen entirely in the browser (Logto supports it).

#### Option B: Serverless Functions / Edge Workers

Use Cloudflare Workers, Vercel Edge Functions, or similar to proxy API requests. This avoids
running a persistent server.

#### Option C: Browser Extension

A browser extension can bypass CORS restrictions. Not practical for a general web app.

#### Option D: Electron/Tauri Desktop Wrapper

Desktop apps are not subject to CORS. This mirrors what PP itself does.

---

## Recommended Implementation Approach

### For Sweetfolio (Browser-based)

1. **Authentication**: Implement OAuth 2.0 Authorization Code flow with PKCE directly in the
   browser using the Logto SDK or a generic OIDC library.
   - Client ID: `d6d0voq1w081sxty0qq7a`
   - Scopes: `openid offline_access`
   - Resource: `https://api.portfolio-performance.info`
   - Redirect URI: Configure in your app (e.g., `http://localhost:5173/callback`)

   **Important**: The redirect URI must match what Logto allows for this client. Since the PP
   desktop app uses `http://localhost:{port}/success`, Logto likely allows localhost redirects.
   However, for a deployed web app, you would need the PP team to register your redirect URI
   with their Logto instance — which they almost certainly will not do for third-party apps.

2. **Data Fetching**: Use a server-side proxy to call the PP data API.
   - The proxy holds no secrets (the Bearer token comes from the browser)
   - It simply relays requests and adds CORS headers

3. **Alternative**: If the redirect URI constraint blocks browser-based OAuth, perform the
   entire auth flow server-side and issue your own session tokens to the browser.

### Critical Caveat: Redirect URI Registration

The Logto client `d6d0voq1w081sxty0qq7a` is configured for the PP desktop app. Its allowed
redirect URIs are likely restricted to `http://localhost:{49968,55968,59968}/success`. A
third-party web app cannot register additional redirect URIs without access to the Logto admin
console.

**This means**: Direct browser-based OAuth using PP's client ID will likely fail for non-localhost
redirect URIs. The most practical approach for a browser-based third-party app is:

1. Run a local companion server (similar to PP desktop) that handles the OAuth callback
2. Or use the PP desktop app to authenticate, then extract the refresh token
3. Or implement the full flow server-side where you control the callback URL on localhost

---

## Source Files Reference

All files from the repository at `https://github.com/portfolio-performance/portfolio` (master branch):

| File | Purpose |
|------|---------|
| `name.abuchen.portfolio/src/name/abuchen/portfolio/oauth/OAuthClient.java` | Main OAuth client — sign-in, token refresh, sign-out |
| `name.abuchen.portfolio/src/name/abuchen/portfolio/oauth/AccessToken.java` | JWT access token model with claims extraction |
| `name.abuchen.portfolio/src/name/abuchen/portfolio/oauth/UserInfo.java` | User identity model (sub, email) |
| `name.abuchen.portfolio/src/name/abuchen/portfolio/oauth/AuthenticationException.java` | Auth error handling |
| `name.abuchen.portfolio/src/name/abuchen/portfolio/oauth/impl/OAuthConfig.java` | Loads config.json (clientId, baseUrl, endpoints, scopes) |
| `name.abuchen.portfolio/src/name/abuchen/portfolio/oauth/impl/config.json` | **Gitignored** — injected at build time, contains client_id and URLs |
| `name.abuchen.portfolio/src/name/abuchen/portfolio/oauth/impl/PKCE.java` | PKCE code verifier/challenge generation (S256) |
| `name.abuchen.portfolio/src/name/abuchen/portfolio/oauth/impl/CallbackServer.java` | Local HTTP server for OAuth redirect (ports 49968/55968/59968) |
| `name.abuchen.portfolio/src/name/abuchen/portfolio/oauth/impl/CodeTokenResponse.java` | Token response deserialization |
| `name.abuchen.portfolio/src/name/abuchen/portfolio/oauth/impl/TokenStorage.java` | Persistent token storage (Base64-encoded file) |
| `name.abuchen.portfolio/src/name/abuchen/portfolio/online/impl/PortfolioPerformanceFeed.java` | Historical and latest quote feed implementation |
| `name.abuchen.portfolio/src/name/abuchen/portfolio/online/impl/PortfolioPerformanceSearchProvider.java` | Security search implementation |
| `name.abuchen.portfolio/src/name/abuchen/portfolio/online/impl/PortfolioReportQuoteFeed.java` | Legacy portfolio-report.net feed (discontinued 2025-11-20) |
| `name.abuchen.portfolio.ui/src/name/abuchen/portfolio/ui/util/OAuthHelper.java` | UI helper for async token retrieval |

### OIDC Discovery Document

```
https://accounts.portfolio-performance.info/oidc/.well-known/openid-configuration
```

### Related Projects

- **Portfolio Report** (`https://github.com/portfolio-report`) — Legacy backend, now archived.
  The `pr-www` repo (Nuxt 3 frontend) is archived as of 2025-08-04. The `pr-api` repo
  appears to have been deleted or made private.
