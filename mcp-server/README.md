# EndpointFeed MCP Server

A remote [MCP](https://modelcontextprotocol.io) server that exposes EndpointFeed's aggregated Intune/SCCM/M365/endpoint-management feed data as tools, so any MCP client — not just the dashboard — can query it.

Hosted on Cloudflare Workers at **https://mcp.endpointfeed.com**. Public, no authentication — the underlying data is already public.

## Add it to a client

```
claude mcp add --transport http endpointfeed https://mcp.endpointfeed.com
```

Any MCP client that supports Streamable HTTP transport can point at the same URL.

## Capabilities

### `list_feeds`
No parameters. Lists every source EndpointFeed tracks — blogs, YouTube channels, podcasts, official vendor blogs — with each feed's `id`, `label`, `type`, `badge`, current item count, and last-fetch error (if any). Call this first to discover valid `feed_id` / `type` values for the other tools.

### `search_items`
Keyword search across item title, summary, and author, with optional filters. Returns newest matches first.

| Param | Type | Description |
|---|---|---|
| `query` | string | Keyword to match against title/summary/author |
| `category` | string | Filter to items tagged with this category |
| `type` | `rss` \| `video` \| `official` \| `audio` | Filter to feeds of this type |
| `feed_id` | string | Filter to a single feed (see `list_feeds`) |
| `since` | ISO 8601 date | Only items published on/after this date |
| `limit` | integer, 1–100 | Default 20 |

### `latest`
The most recently published items across all feeds.

| Param | Type | Description |
|---|---|---|
| `limit` | integer, 1–100 | Default 10 |
| `type` | `rss` \| `video` \| `official` \| `audio` | Filter to feeds of this type |

### `feed_health`
No parameters. Lists feeds whose last scheduled fetch failed, with the error message and timestamp — a quick way to see what's currently broken upstream.

## Data source & caching

Tools read the live `feeds.json` published at `endpointfeed.com/feeds.json`, which the `Fetch RSS Feeds` GitHub Action regenerates every 4 hours. Each request to this Worker fetches it through Cloudflare's edge cache (`cacheTtl: 300`), so results are at most 5 minutes stale relative to the published file — no per-call origin fetch.

## Architecture

Stateless: `createMcpHandler` builds a fresh `McpServer` per request (no Durable Objects, no stored state). See [`src/index.ts`](./src/index.ts).

## Development

```
npm install
npm run dev         # wrangler dev, local at http://127.0.0.1:8787/mcp
npm run typecheck
npm run deploy       # wrangler deploy
```

`wrangler.jsonc` routes `mcp.endpointfeed.com` to this Worker as a Cloudflare custom domain within the existing `endpointfeed.com` zone.
