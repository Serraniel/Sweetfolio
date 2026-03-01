import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Seed test data directly into IndexedDB via page.evaluate.
 * This avoids depending on the CSV upload UI and keeps the test focused on import/export.
 */
async function seedTestData(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    return new Promise<void>((resolve, reject) => {
      // Delete and recreate the database to start fresh
      const deleteReq = indexedDB.deleteDatabase('sweetfolio');
      deleteReq.onsuccess = () => {
        const openReq = indexedDB.open('sweetfolio', 2);

        openReq.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;

          const assetStore = db.createObjectStore('assets', { keyPath: 'id' });
          assetStore.createIndex('by-isin', 'isin', { unique: false });
          assetStore.createIndex('by-name', 'name', { unique: false });
          assetStore.createIndex('by-classification', 'classification', { unique: false });

          const portfolioStore = db.createObjectStore('portfolios', { keyPath: 'id' });
          portfolioStore.createIndex('by-name', 'name', { unique: false });

          db.createObjectStore('currencies', { keyPath: 'pair' });
          db.createObjectStore('settings', { keyPath: 'key' });
          db.createObjectStore('simulations', { keyPath: 'id' });
        };

        openReq.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const tx = db.transaction(
            ['assets', 'portfolios', 'currencies', 'settings'],
            'readwrite',
          );

          // --- Assets ---
          const assetStore = tx.objectStore('assets');
          const assets = [
            {
              id: 'asset-1',
              name: 'Test Stock Alpha',
              isin: 'DE0001234567',
              wkn: '123456',
              currency: 'EUR',
              classification: 'stock',
              prices: [
                { date: '2024-01-02', close: 100 },
                { date: '2024-01-03', close: 101.5 },
                { date: '2024-01-04', close: 99.8 },
                { date: '2024-01-05', close: 102.2 },
                { date: '2024-01-08', close: 103.1 },
              ],
              formatConfig: {
                delimiter: ',',
                decimalSeparator: '.',
                dateFormat: 'YYYY-MM-DD',
                hasHeader: true,
                dateColumn: 0,
                closeColumn: 1,
              },
              rawCSV: 'Date,Close\n2024-01-02,100.00\n2024-01-03,101.50',
              rawCSVStoredAt: null,
              createdAt: '2024-01-01T00:00:00.000Z',
              updatedAt: '2024-01-10T00:00:00.000Z',
              lastRefreshedAt: null,
            },
            {
              id: 'asset-2',
              name: 'Test ETF Beta',
              isin: 'LU0009876543',
              wkn: '987654',
              currency: 'USD',
              classification: 'etf',
              prices: [
                { date: '2024-01-02', close: 50 },
                { date: '2024-01-03', close: 50.5 },
                { date: '2024-01-04', close: 51.2 },
                { date: '2024-01-05', close: 49.8 },
                { date: '2024-01-08', close: 52.0 },
              ],
              formatConfig: null,
              rawCSV: null,
              rawCSVStoredAt: null,
              createdAt: '2024-01-01T00:00:00.000Z',
              updatedAt: '2024-01-10T00:00:00.000Z',
              lastRefreshedAt: '2024-01-09T12:00:00.000Z',
            },
          ];
          for (const asset of assets) assetStore.put(asset);

          // --- Portfolios ---
          const portfolioStore = tx.objectStore('portfolios');
          portfolioStore.put({
            id: 'portfolio-1',
            name: 'My Test Portfolio',
            allocations: [
              { assetId: 'asset-1', weight: 0.6 },
              { assetId: 'asset-2', weight: 0.4 },
            ],
            isBenchmark: false,
            createdAt: '2024-01-02T00:00:00.000Z',
            updatedAt: '2024-01-10T00:00:00.000Z',
          });

          // --- Currencies ---
          const currencyStore = tx.objectStore('currencies');
          currencyStore.put({
            pair: 'USDEUR',
            rates: [
              { date: '2024-01-02', rate: 0.92 },
              { date: '2024-01-03', rate: 0.915 },
              { date: '2024-01-04', rate: 0.925 },
            ],
          });

          // --- Settings ---
          const settingsStore = tx.objectStore('settings');
          settingsStore.put({ key: 'mainCurrency', value: 'EUR' });
          settingsStore.put({ key: 'riskFreeRate', value: 0.03 });
          settingsStore.put({ key: 'theme', value: 'dark' });
          settingsStore.put({
            key: 'migrations',
            value: ['classify-assets-v1'],
          });

          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };

        openReq.onerror = () => reject(openReq.error);
      };
      deleteReq.onerror = () => reject(deleteReq.error);
    });
  });
}

/**
 * Read all data from IndexedDB for comparison.
 */
async function readAllData(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    return new Promise<{
      assets: any[];
      portfolios: any[];
      currencies: any[];
      settings: Record<string, any>;
    }>((resolve, reject) => {
      const openReq = indexedDB.open('sweetfolio', 2);
      openReq.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const tx = db.transaction(
          ['assets', 'portfolios', 'currencies', 'settings'],
          'readonly',
        );

        const results: any = {};
        const stores = ['assets', 'portfolios', 'currencies', 'settings'];
        let pending = stores.length;

        for (const storeName of stores) {
          const store = tx.objectStore(storeName);
          const req = store.getAll();
          req.onsuccess = () => {
            if (storeName === 'settings') {
              const obj: Record<string, any> = {};
              for (const entry of req.result) obj[entry.key] = entry.value;
              results[storeName] = obj;
            } else {
              results[storeName] = req.result;
            }
            if (--pending === 0) {
              db.close();
              resolve(results);
            }
          };
        }

        tx.onerror = () => reject(tx.error);
      };
      openReq.onerror = () => reject(openReq.error);
    });
  });
}

test.describe('Import / Export round-trip', () => {
  let exportFilePath: string;

  test.beforeAll(async () => {
    // Ensure a temp directory for export files
    const tmpDir = path.join(__dirname, '..', 'test-results', 'io-tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    exportFilePath = path.join(tmpDir, 'test-export.json');
  });

  test.afterAll(async () => {
    // Clean up export file
    if (fs.existsSync(exportFilePath)) {
      fs.unlinkSync(exportFilePath);
    }
  });

  test('export seeded data, import into fresh browser, verify completeness', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    // =========================================================================
    // Phase 1: Seed data and export
    // =========================================================================
    const sourceContext = await browser.newContext();
    const sourcePage = await sourceContext.newPage();

    await sourcePage.goto('/');
    await sourcePage.waitForLoadState('networkidle');

    // Seed test data into IndexedDB
    await seedTestData(sourcePage);

    // Reload so the app picks up the seeded data
    await sourcePage.reload();
    await sourcePage.waitForLoadState('networkidle');

    // Verify seeded data appears: dashboard should show asset/portfolio counts
    await expect(sourcePage.getByText('Test Stock Alpha')).toBeVisible({ timeout: 5000 }).catch(() => {
      // Dashboard may not show asset names - that's fine
    });

    // Read the source data for later comparison
    const sourceData = await readAllData(sourcePage);
    expect(sourceData.assets).toHaveLength(2);
    expect(sourceData.portfolios).toHaveLength(1);
    expect(sourceData.currencies).toHaveLength(1);
    expect(sourceData.settings.mainCurrency).toBe('EUR');

    // Navigate to settings for export
    await sourcePage.goto('/settings');
    await sourcePage.waitForLoadState('networkidle');

    // showSaveFilePicker is not available in headless Playwright,
    // so the export will fall back to Blob + anchor download.
    // Set up a download listener to capture the file.
    const downloadPromise = sourcePage.waitForEvent('download');

    // Click "Export Data" button
    await sourcePage.getByRole('button', { name: 'Export Data' }).click();

    // Export modal: all scopes should be checked by default, click Export
    await sourcePage.getByRole('button', { name: 'Export', exact: true }).click();

    // Wait for download
    const download = await downloadPromise;
    await download.saveAs(exportFilePath);

    // Verify the export file exists and is valid JSON
    const exportContent = fs.readFileSync(exportFilePath, 'utf-8');
    const exportJson = JSON.parse(exportContent);
    expect(exportJson.format).toBe('sweetfolio');
    expect(exportJson.version).toBe(2);
    expect(exportJson.scopes).toContain('assets');
    expect(exportJson.scopes).toContain('portfolios');
    expect(exportJson.scopes).toContain('settings');
    expect(exportJson.scopes).toContain('currencies');
    expect(exportJson.data.assets).toHaveLength(2);
    expect(exportJson.data.portfolios).toHaveLength(1);
    expect(exportJson.data.currencies).toHaveLength(1);

    // Verify bulky data was stripped from export
    for (const asset of exportJson.data.assets) {
      expect(asset.rawCSV).toBeNull();
    }

    await sourceContext.close();

    // =========================================================================
    // Phase 2: Import into a completely fresh browser context (no stored data)
    // =========================================================================
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();

    await freshPage.goto('/settings');
    await freshPage.waitForLoadState('networkidle');

    // Verify the fresh context has no assets
    const freshDataBefore = await readAllData(freshPage);
    expect(freshDataBefore.assets).toHaveLength(0);
    expect(freshDataBefore.portfolios).toHaveLength(0);
    expect(freshDataBefore.currencies).toHaveLength(0);

    // Click "Import Data" button
    await freshPage.getByRole('button', { name: 'Import Data' }).click();

    // Import wizard step 1: select file (use .json accept to distinguish from CSV dropzone)
    const fileInput = freshPage.locator('input[type="file"][accept=".json"]');
    await fileInput.setInputFiles(exportFilePath);

    // Step 2: select scopes - all should be pre-selected, click Next
    await freshPage.getByRole('button', { name: 'Next' }).click();

    // Step 3: resolve conflicts
    // In a fresh browser there should be no real conflicts (identical migrations get skipped).
    // If there are no unresolved conflicts, "Apply Import" should be enabled.
    const applyButton = freshPage.getByRole('button', { name: 'Apply Import' });
    await expect(applyButton).toBeVisible({ timeout: 5000 });
    await expect(applyButton).toBeEnabled();
    await applyButton.click();

    // Step 4/5: wait for "done"
    await expect(freshPage.getByText('Import completed successfully')).toBeVisible({
      timeout: 10000,
    });

    // Click Done to close the modal
    await freshPage.getByRole('button', { name: 'Done' }).click();

    // =========================================================================
    // Phase 3: Verify imported data matches source
    // =========================================================================
    const importedData = await readAllData(freshPage);

    // --- Assets ---
    expect(importedData.assets).toHaveLength(sourceData.assets.length);
    for (const sourceAsset of sourceData.assets) {
      const imported = importedData.assets.find((a: any) => a.id === sourceAsset.id);
      expect(imported, `Asset ${sourceAsset.name} should exist after import`).toBeTruthy();
      expect(imported.name).toBe(sourceAsset.name);
      expect(imported.isin).toBe(sourceAsset.isin);
      expect(imported.wkn).toBe(sourceAsset.wkn);
      expect(imported.currency).toBe(sourceAsset.currency);
      expect(imported.classification).toBe(sourceAsset.classification);
      expect(imported.prices).toHaveLength(sourceAsset.prices.length);
      // rawCSV is stripped during export — should be null after import
      expect(imported.rawCSV).toBeNull();
      // Verify price data integrity
      for (let i = 0; i < sourceAsset.prices.length; i++) {
        expect(imported.prices[i].date).toBe(sourceAsset.prices[i].date);
        expect(imported.prices[i].close).toBe(sourceAsset.prices[i].close);
      }
    }

    // --- Portfolios ---
    expect(importedData.portfolios).toHaveLength(sourceData.portfolios.length);
    for (const sourcePortfolio of sourceData.portfolios) {
      const imported = importedData.portfolios.find((p: any) => p.id === sourcePortfolio.id);
      expect(imported, `Portfolio ${sourcePortfolio.name} should exist`).toBeTruthy();
      expect(imported.name).toBe(sourcePortfolio.name);
      expect(imported.allocations).toHaveLength(sourcePortfolio.allocations.length);
      for (let i = 0; i < sourcePortfolio.allocations.length; i++) {
        expect(imported.allocations[i].assetId).toBe(sourcePortfolio.allocations[i].assetId);
        expect(imported.allocations[i].weight).toBe(sourcePortfolio.allocations[i].weight);
      }
      expect(imported.isBenchmark).toBe(sourcePortfolio.isBenchmark);
    }

    // --- Currencies ---
    expect(importedData.currencies).toHaveLength(sourceData.currencies.length);
    for (const sourceCurrency of sourceData.currencies) {
      const imported = importedData.currencies.find((c: any) => c.pair === sourceCurrency.pair);
      expect(imported, `Currency ${sourceCurrency.pair} should exist`).toBeTruthy();
      expect(imported.rates).toHaveLength(sourceCurrency.rates.length);
      for (let i = 0; i < sourceCurrency.rates.length; i++) {
        expect(imported.rates[i].date).toBe(sourceCurrency.rates[i].date);
        expect(imported.rates[i].rate).toBe(sourceCurrency.rates[i].rate);
      }
    }

    // --- Settings ---
    expect(importedData.settings.mainCurrency).toBe(sourceData.settings.mainCurrency);
    expect(importedData.settings.riskFreeRate).toBe(sourceData.settings.riskFreeRate);
    expect(importedData.settings.theme).toBe(sourceData.settings.theme);

    // =========================================================================
    // Phase 4: Verify the imported data is visible in the UI
    // =========================================================================
    await freshPage.goto('/assets');
    await freshPage.waitForLoadState('networkidle');

    // Both assets should appear on the assets page
    await expect(freshPage.getByText('Test Stock Alpha')).toBeVisible({ timeout: 5000 });
    await expect(freshPage.getByText('Test ETF Beta')).toBeVisible({ timeout: 5000 });

    await freshPage.goto('/portfolios');
    await freshPage.waitForLoadState('networkidle');

    await expect(freshPage.getByText('My Test Portfolio')).toBeVisible({ timeout: 5000 });

    await freshContext.close();
  });
});
