# Asset Classification Design

## Goal

Add a classification field to assets (stock, ETF, ETN, ETC, fund, bond, certificate, crypto, commodity) with auto-detection from data sources and manual editing. Enable filtering the asset list by classification.

## Data Model

New type and field on `Asset`:

```typescript
type AssetClassification =
  | 'stock' | 'etf' | 'etn' | 'etc'
  | 'fund' | 'bond' | 'certificate'
  | 'crypto' | 'commodity' | 'unknown';

interface Asset {
  // ... existing fields ...
  classification: AssetClassification;
}
```

Default: `'unknown'`.

## Auto-Detection

### Onvista Entity Type Mapping

| Onvista entityType | Classification |
|---|---|
| STOCK | stock |
| ETF | etf |
| FUND | fund |
| BOND | bond |
| COMMODITY | commodity |
| PRECIOUS_METAL | commodity |
| DERIVATIVE | certificate |
| INDEX | unknown |
| CURRENCY | unknown |

Onvista does not distinguish ETN/ETC from ETF — users correct manually if needed.

### FetchResult Extension

Add optional `classification?: AssetClassification` to `FetchResult` so any data source can provide it.

## Import Flows

### Identifier Import (ISIN/WKN)

Classification auto-detected from Onvista's `entityType` and set on the created asset.

### CSV Import with FormatConfigModal

Add a classification dropdown to the modal (default: `unknown`).

### CSV Smart Import (auto-import mode)

If ISIN/WKN detected in filename or data, attempt to fetch classification from data sources. Otherwise default to `unknown`.

## UI Changes

### Asset List Page

- Classification badge/tag next to asset name in the table.
- Filter dropdown above the table to filter by classification.

### Asset Detail Page

- Classification dropdown in the edit modal.

## Database Migration

- Bump IndexedDB version 2 → 3.
- Migration: add `classification: 'unknown'` to all existing assets.
- Add `by-classification` index for efficient filtering.

## Export/Import Schema

- Bump export schema to v2, include `classification` field.
- V1 imports receive `classification: 'unknown'`.
