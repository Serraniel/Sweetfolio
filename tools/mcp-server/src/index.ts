#!/usr/bin/env node
/**
 * Sweetfolio MCP server (EX-8). Reads an AI export file (Settings › Data ›
 * Download AI export) and exposes it read-only over stdio. The file is
 * re-read on every call, so re-exporting updates the data without a restart.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getAssetPrices, getAssets, getHoldings, getPortfolios, getTransactions, parseExport } from './data.ts';

const file = process.argv[2] ?? process.env.SWEETFOLIO_EXPORT;
if (!file) {
	console.error('Usage: sweetfolio-mcp <path/to/sweetfolio-ai-export.json>');
	process.exit(1);
}
const path = resolve(file);
const load = () => parseExport(readFileSync(path, 'utf-8'));
load();

const server = new McpServer({ name: 'sweetfolio', version: '1.0.0' });

function json(value: unknown) {
	return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function safe<A>(fn: (args: A) => unknown) {
	return async (args: A) => {
		try {
			return json(fn(args));
		} catch (err) {
			return { content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }], isError: true };
		}
	};
}

server.registerTool(
	'get_portfolios',
	{
		title: 'List portfolios',
		description: 'All portfolios with mode, currency, market value, transaction count and target allocations.',
		inputSchema: {}
	},
	safe(() => getPortfolios(load()))
);

server.registerTool(
	'get_transactions',
	{
		title: 'Portfolio transactions',
		description:
			'Transactions of a portfolio (by id or name), oldest first. Optional filters: type (buy|sell|dividend|deposit|withdrawal|fee|tax), date range, asset (id, ISIN, WKN or name).',
		inputSchema: {
			portfolio: z.string().describe('Portfolio id or name'),
			type: z.string().optional(),
			from: z.string().optional().describe('YYYY-MM-DD'),
			to: z.string().optional().describe('YYYY-MM-DD'),
			asset: z.string().optional()
		}
	},
	safe(({ portfolio, ...filter }: { portfolio: string; type?: string; from?: string; to?: string; asset?: string }) =>
		getTransactions(load(), portfolio, filter)
	)
);

server.registerTool(
	'get_holdings',
	{
		title: 'Current holdings',
		description: 'Open positions of a portfolio computed with FIFO, valued at the latest known price.',
		inputSchema: { portfolio: z.string().describe('Portfolio id or name') }
	},
	safe(({ portfolio }: { portfolio: string }) => getHoldings(load(), portfolio))
);

server.registerTool(
	'get_assets',
	{ title: 'List assets', description: 'Assets with ISIN/WKN, currency, classification and latest price.', inputSchema: {} },
	safe(() => getAssets(load()))
);

server.registerTool(
	'get_asset_prices',
	{
		title: 'Asset price history',
		description: 'Daily closing prices of an asset (by id, ISIN, WKN or name), optionally within a date range.',
		inputSchema: { asset: z.string(), from: z.string().optional(), to: z.string().optional() }
	},
	safe(({ asset, from, to }: { asset: string; from?: string; to?: string }) => getAssetPrices(load(), asset, { from, to }))
);

await server.connect(new StdioServerTransport());
