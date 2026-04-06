#!/usr/bin/env node
import { readFileSync } from 'fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// ── Argument validation ────────────────────────────────────────────────────

const filePath = process.argv[2];
if (!filePath) {
  console.error('Error: No export file path provided.');
  console.error('Usage: node dist/index.js /path/to/sweetfolio-ai-export.json');
  process.exit(1);
}

// ── Load and validate export file ─────────────────────────────────────────

let exportData: SweetfolioAiExport;
try {
  const raw = readFileSync(filePath, 'utf-8');
  exportData = JSON.parse(raw) as SweetfolioAiExport;
} catch (err) {
  console.error(`Error: Could not read or parse file "${filePath}":`, err);
  process.exit(1);
}

if (exportData.format !== 'sweetfolio-ai') {
  console.error(
    `Error: Invalid export format. Expected "sweetfolio-ai", got "${exportData.format}".`
  );
  process.exit(1);
}

// ── Type definitions ───────────────────────────────────────────────────────

interface Transaction {
  id: string;
  date: string;
  type: string;
  shares?: number;
  price?: number;
  amount: number;
  currency: string;
  [key: string]: unknown;
}

interface Portfolio {
  id: string;
  name: string;
  currency?: string;
  transactions?: Transaction[];
  [key: string]: unknown;
}

interface AssetPrice {
  date: string;
  price: number;
  [key: string]: unknown;
}

interface Asset {
  id: string;
  name: string;
  symbol?: string;
  isin?: string;
  currency?: string;
  prices?: AssetPrice[];
  [key: string]: unknown;
}

interface SweetfolioAiExport {
  format: string;
  exportedAt?: string;
  portfolios?: Portfolio[];
  assets?: Asset[];
  [key: string]: unknown;
}

// ── Helper: strip large arrays for summary views ───────────────────────────

function portfolioSummary(p: Portfolio) {
  const { transactions, ...meta } = p;
  return {
    ...meta,
    transactionCount: transactions?.length ?? 0,
  };
}

function assetSummary(a: Asset) {
  const { prices, ...meta } = a;
  return {
    ...meta,
    priceHistoryCount: prices?.length ?? 0,
  };
}

// ── MCP Server setup ───────────────────────────────────────────────────────

const server = new Server(
  { name: 'sweetfolio', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_portfolios',
      description:
        'Returns all portfolios with metadata and transaction count (no raw transactions).',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'get_transactions',
      description: 'Returns all transactions for a specific portfolio by its ID.',
      inputSchema: {
        type: 'object',
        properties: {
          portfolioId: {
            type: 'string',
            description: 'The ID of the portfolio whose transactions to retrieve.',
          },
        },
        required: ['portfolioId'],
      },
    },
    {
      name: 'get_assets',
      description:
        'Returns all assets with metadata and price history count (no raw price history).',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'get_asset_prices',
      description: 'Returns the full price history for a specific asset by its ID.',
      inputSchema: {
        type: 'object',
        properties: {
          assetId: {
            type: 'string',
            description: 'The ID of the asset whose price history to retrieve.',
          },
        },
        required: ['assetId'],
      },
    },
  ],
}));

// Call tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'get_portfolios': {
      const portfolios = (exportData.portfolios ?? []).map(portfolioSummary);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(portfolios, null, 2),
          },
        ],
      };
    }

    case 'get_transactions': {
      const portfolioId = (args as Record<string, string>)?.portfolioId;
      if (!portfolioId) {
        return {
          content: [{ type: 'text', text: 'Error: portfolioId is required.' }],
          isError: true,
        };
      }
      const portfolio = (exportData.portfolios ?? []).find((p) => p.id === portfolioId);
      if (!portfolio) {
        return {
          content: [
            { type: 'text', text: `Error: No portfolio found with ID "${portfolioId}".` },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(portfolio.transactions ?? [], null, 2),
          },
        ],
      };
    }

    case 'get_assets': {
      const assets = (exportData.assets ?? []).map(assetSummary);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(assets, null, 2),
          },
        ],
      };
    }

    case 'get_asset_prices': {
      const assetId = (args as Record<string, string>)?.assetId;
      if (!assetId) {
        return {
          content: [{ type: 'text', text: 'Error: assetId is required.' }],
          isError: true,
        };
      }
      const asset = (exportData.assets ?? []).find((a) => a.id === assetId);
      if (!asset) {
        return {
          content: [{ type: 'text', text: `Error: No asset found with ID "${assetId}".` }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(asset.prices ?? [], null, 2),
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: 'text', text: `Error: Unknown tool "${name}".` }],
        isError: true,
      };
  }
});

// ── Start server ───────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
