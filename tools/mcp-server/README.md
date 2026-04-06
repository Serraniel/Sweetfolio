# Sweetfolio MCP Server

A local [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that exposes your Sweetfolio portfolio data to AI assistants such as Claude Code.

## Why file-based?

Sweetfolio is a fully client-side application — it runs entirely in the browser with no backend server. This means a live HTTP-based MCP integration is not possible. Instead, you export your data to a `sweetfolio-ai-export.json` file from within the app, and this MCP server reads that file. The AI assistant then has a point-in-time snapshot of your portfolio data to work with.

## Setup

### 1. Install dependencies and build

```sh
cd tools/mcp-server
npm install
npm run build
```

### 2. Export your data from Sweetfolio

Inside Sweetfolio, use the **AI Export** feature to download a `sweetfolio-ai-export.json` file.

### 3. Run the server manually (optional test)

```sh
node dist/index.js /path/to/sweetfolio-ai-export.json
```

The server communicates over stdio and follows the MCP protocol. It is not meant to be run interactively — use it as an MCP server configured in your AI tool.

## Configure in Claude Code

Add the following to your `.claude/settings.json`:

```json
{
  "mcpServers": {
    "sweetfolio": {
      "command": "node",
      "args": [
        "/path/to/sweetfolio/tools/mcp-server/dist/index.js",
        "/path/to/sweetfolio-ai-export.json"
      ]
    }
  }
}
```

Replace the paths with the actual absolute paths on your machine.

## Available tools

| Tool | Arguments | Description |
|---|---|---|
| `get_portfolios` | — | Returns all portfolios with metadata and transaction count (transactions excluded for brevity) |
| `get_transactions` | `portfolioId: string` | Returns all transactions for the specified portfolio |
| `get_assets` | — | Returns all assets with metadata and price history count (price history excluded for brevity) |
| `get_asset_prices` | `assetId: string` | Returns the full price history for the specified asset |

## Refreshing data

Re-export from Sweetfolio whenever you want the AI assistant to see your latest portfolio state. The MCP server reads the file at startup, so restart the server (or the MCP host) after replacing the export file.
