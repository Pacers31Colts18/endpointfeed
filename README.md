# EndpointFeed Dashboard

A self-hosted RSS dashboard for Microsoft Intune, SCCM, Endpoint, and M365 content — deployed on GitHub Pages with automatic feed updates via GitHub Actions.

## 🚀 Setup

### 1. Create a GitHub Repository
Create a new public repo (e.g. `endpoint-feed`) and push this project to it.

### 2. Enable GitHub Pages
1. Go to **Settings → Pages**
2. Set **Source** to `Deploy from a branch`
3. Set **Branch** to `main` and **Folder** to `/docs`
4. Click **Save**

Your dashboard will be live at `https://<your-username>.github.io/<repo-name>/`

### 3. Run the First Feed Fetch
The workflow runs every 4 hours automatically, but to populate data immediately:

1. Go to **Actions** tab in your repo
2. Click **Fetch RSS Feeds**
3. Click **Run workflow → Run workflow**

After it completes, refresh your GitHub Pages URL.

## 📁 Project Structure

```
├── .github/
│   └── workflows/
│       └── fetch-feeds.yml     # Scheduled GitHub Action
├── docs/
│   ├── index.html              # Dashboard UI
│   ├── mcp.html                # MCP server docs page
│   └── feeds.json              # Auto-generated feed data
├── scripts/
│   ├── fetch-feeds.js          # Feed fetcher script
│   └── package.json
└── mcp-server/                 # Remote MCP server (Cloudflare Worker)
    ├── src/index.ts
    ├── wrangler.jsonc
    └── package.json
```

## ➕ Adding More Feeds

Edit `scripts/fetch-feeds.js` and add entries to the `FEEDS` array:

```js
{
  id: 'my-feed',
  label: 'My Feed Name',
  url: 'https://example.com/feed.xml',
  category: 'my-category',   // used for filter buttons
  color: '#ff6600'           // accent color in UI
}
```

Then add a filter button in `docs/index.html` in the `.toolbar` section.

## 🔌 MCP Server

EndpointFeed's data is also queryable by AI tools via a public remote [MCP](https://modelcontextprotocol.io) server (`mcp-server/`), hosted on Cloudflare Workers at **https://mcp.endpointfeed.com** — no authentication required, since the underlying data is already public. A human-readable version of this section lives at [endpointfeed.com/mcp.html](https://endpointfeed.com/mcp.html).

### Add it to your client

**Claude Code**
```
claude mcp add --transport http endpointfeed https://mcp.endpointfeed.com
```

**Claude Desktop** — Settings → Connectors → Add → Add custom connector → paste `https://mcp.endpointfeed.com` (leave auth blank).

**OpenAI Codex CLI** — add to `~/.codex/config.toml`:
```toml
[mcp_servers.endpointfeed]
url = "https://mcp.endpointfeed.com"
```

**GitHub Copilot (VS Code)** — add to `.vscode/mcp.json` (or your user `mcp.json`):
```json
{
  "servers": {
    "endpointfeed": { "type": "http", "url": "https://mcp.endpointfeed.com" }
  }
}
```

**Cursor** — add to `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "endpointfeed": { "url": "https://mcp.endpointfeed.com" }
  }
}
```

**Gemini CLI** — add to `~/.gemini/settings.json`:
```json
{
  "mcpServers": {
    "endpointfeed": { "httpUrl": "https://mcp.endpointfeed.com" }
  }
}
```

**Anything else** — any client that supports MCP's Streamable HTTP transport can connect straight to `https://mcp.endpointfeed.com`. No authentication required.

### Capabilities

**`list_feeds`** — no parameters. Lists every source EndpointFeed tracks (blogs, YouTube channels, podcasts, official vendor blogs) with each feed's `id`, `label`, `type`, `badge`, current item count, and last-fetch error if any. Call this first to discover valid `feed_id` / `type` values for the other tools.

**`search_items`** — keyword search across item title, summary, and author, newest matches first.

| Param | Type | Description |
|---|---|---|
| `query` | string | Keyword to match against title/summary/author |
| `category` | string | Filter to items tagged with this category |
| `type` | `rss` \| `video` \| `official` \| `audio` | Filter to feeds of this type |
| `feed_id` | string | Filter to a single feed (see `list_feeds`) |
| `since` | ISO 8601 date | Only items published on/after this date |
| `limit` | integer, 1–100 | Default 20 |

**`latest`** — the most recently published items across all feeds.

| Param | Type | Description |
|---|---|---|
| `limit` | integer, 1–100 | Default 10 |
| `type` | `rss` \| `video` \| `official` \| `audio` | Filter to feeds of this type |

**`feed_health`** — no parameters. Lists feeds whose last scheduled fetch failed, with the error message and timestamp.

### Data source, caching & architecture

Tools read the live `feeds.json` published at `endpointfeed.com/feeds.json` (regenerated every 4 hours by the `Fetch RSS Feeds` Action), fetched through Cloudflare's edge cache (`cacheTtl: 300`) — results are at most 5 minutes stale, with no per-call origin fetch. The server itself is stateless: `createMcpHandler` builds a fresh `McpServer` per request, no Durable Objects or stored state. `wrangler.jsonc` routes `mcp.endpointfeed.com` to the Worker as a custom domain within the existing `endpointfeed.com` zone.

```
cd mcp-server
npm install
npm run dev         # wrangler dev, local at http://127.0.0.1:8787/mcp
npm run typecheck
npm run deploy       # wrangler deploy
```

## ⚙️ Configuration

- **Fetch interval**: Edit the `cron` in `.github/workflows/fetch-feeds.yml` (default: every 4 hours)
- **Items per feed**: Change `MAX_ITEMS_PER_FEED` in `scripts/fetch-feeds.js` (default: 20)
- **"NEW" badge threshold**: Items published within 48 hours get a NEW badge (configurable in `index.html`)

## 📡 Feeds Included

| Source | Category | URL |
|---|---|---|
| Microsoft Intune Blog | intune | techcommunity.microsoft.com |
| Microsoft Intune Support | intune | techcommunity.microsoft.com |
| 4sysops | 4sysops | 4sysops.com |
