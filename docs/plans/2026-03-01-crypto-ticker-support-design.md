# Crypto Ticker Support in Identifier Lookup

**Date:** 2026-03-01
**Status:** Approved

## Problem

The asset import by identifier only accepts ISIN (12 chars) and WKN (6 alphanum). Short crypto tickers like BTC or ETH are rejected by validation, preventing crypto asset import via the identifier lookup flow.

## Design

### 1. Identifier Validation

Add `validateTicker()` to `src/lib/scraper/index.ts`:

- Pattern: 2-10 uppercase alphanumeric characters
- Detection priority: ISIN (12 chars) > WKN (6 alphanum) > ticker (fallback)
- Extend `IdentifierType` to include `'ticker'`

This avoids false positives — a valid WKN like `A1JX52` is detected as WKN first since WKN is checked before ticker.

This only supports crypto tickers via CoinGecko. US stock tickers (AAPL, MSFT) would match the pattern but return a "not found" error since CoinGecko doesn't list them.

### 2. CoinGecko Data Source

New file: `src/lib/fetchers/coingecko.ts`

- On first ticker lookup, fetch `/coins/list` from CoinGecko's free API (no key required), cache in memory
- Match user input (e.g. "BTC") against the `symbol` field to resolve the CoinGecko `id` (e.g. "bitcoin")
- Fetch price history via `/coins/{id}/market_chart?vs_currency={mainCurrency}&days=max`
- Use the user's `mainCurrency` setting (from `settings.mainCurrency`) for the `vs_currency` parameter, default to `EUR` if not set
- Return `FetchResult` with `classification: 'crypto'`
- Register as a data source in the scraper, used only for ticker lookups (not ISIN/WKN)

### 3. Scraper Changes

In `src/lib/scraper/index.ts`:

- Add `fetchByTicker()` function that routes only to CoinGecko
- Add `validateTicker()` function
- Extend `IdentifierType` to include `'ticker'`

### 4. UI Changes

In `src/routes/assets/+page.svelte`:

- Update placeholder: `"Enter ISIN, WKN or crypto ticker..."`
- Extend `lookupIdentifierType` derived state to detect ticker (checked last after ISIN and WKN)
- Show "Crypto ticker" hint text in green when ticker detected
- Route ticker lookups through `fetchByTicker()` in `handleLookup()`
- In `handleLookupConfirm()`, leave both `isin` and `wkn` as `null` for ticker imports

### 5. Asset Model

No changes needed. The `Asset` type already supports:
- `classification: 'crypto'` as a valid value
- `isin` and `wkn` as nullable fields

## Out of Scope

- No `ticker`/`symbol` field on the Asset model
- No crypto in the price refresh flow
- No changes to CSV import or filename detection
- No US stock ticker support (CoinGecko is crypto-only)
