# Sweetfolio MCP server

Lets AI assistants (Claude Desktop, Claude Code, …) read your Sweetfolio data. Sweetfolio has no backend, so the server works on an export file instead of a live connection:

1. In Sweetfolio open **Settings › Data › AI export** and download `sweetfolio-ai-export-YYYY-MM-DD.json` (optionally with full price history).
2. Build the server:

   ```bash
   cd tools/mcp-server
   npm install
   npm run build
   ```

3. Register it with your client, e.g. Claude Code:

   ```bash
   claude mcp add sweetfolio -- node /path/to/tools/mcp-server/dist/index.js /path/to/sweetfolio-ai-export.json
   ```

   or in a JSON config:

   ```json
   { "mcpServers": { "sweetfolio": { "command": "node", "args": ["/path/to/dist/index.js", "/path/to/export.json"] } } }
   ```

The file is re-read on every request — export again to refresh the data.

## Tools

| Tool               | Description                                                           |
| ------------------ | --------------------------------------------------------------------- |
| `get_portfolios`   | Portfolios with mode, currency, market value and target allocations   |
| `get_transactions` | Transactions of a portfolio, filterable by type, date range and asset |
| `get_holdings`     | Current positions (FIFO) valued at the latest price                   |
| `get_assets`       | Assets with identifiers and latest price                              |
| `get_asset_prices` | Price history of an asset (if included in the export)                 |

Everything stays on your machine; the server is read-only.
