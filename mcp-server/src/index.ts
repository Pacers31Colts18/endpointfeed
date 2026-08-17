import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { z } from "zod";

const FEEDS_URL = "https://endpointfeed.com/feeds.json";
const FEED_TYPES = ["rss", "video", "official", "audio"] as const;

type FeedItem = {
  title: string;
  link: string;
  pubDate: string | null;
  summary: string;
  author: string;
  categories: string[];
  type: string;
  videoId?: string | null;
  thumbnail?: string | null;
};

type Feed = {
  id: string;
  label: string;
  type: string;
  badge?: string;
  url: string;
  items: FeedItem[];
  fetchedAt: string;
  error: string | null;
};

type FeedsPayload = {
  generatedAt: string;
  feeds: Feed[];
};

async function loadFeeds(): Promise<FeedsPayload> {
  const res = await fetch(FEEDS_URL, {
    cf: { cacheTtl: 300, cacheEverything: true }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch feeds.json: HTTP ${res.status}`);
  }
  return res.json();
}

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function createServer() {
  const server = new McpServer({
    name: "endpointfeed",
    version: "1.0.0"
  });

  server.registerTool(
    "list_feeds",
    {
      description:
        "List every source EndpointFeed tracks (blogs, YouTube channels, podcasts, official vendor blogs) with its id, label, type, and last-fetch error if any. Call this first to discover valid feed_id/type values for the other tools.",
      inputSchema: z.object({})
    },
    async () => {
      const data = await loadFeeds();
      return json({
        generatedAt: data.generatedAt,
        feeds: data.feeds.map((f) => ({
          id: f.id,
          label: f.label,
          type: f.type,
          badge: f.badge ?? null,
          itemCount: f.items.length,
          error: f.error
        }))
      });
    }
  );

  server.registerTool(
    "search_items",
    {
      description:
        "Search EndpointFeed items by keyword against title/summary/author, with optional filters for category, feed type, a specific feed, and a minimum publish date. Returns newest matches first.",
      inputSchema: z.object({
        query: z.string().optional().describe("Keyword to match against title, summary, and author"),
        category: z.string().optional().describe("Filter to items tagged with this category"),
        type: z.enum(FEED_TYPES).optional().describe("Filter to feeds of this type"),
        feed_id: z.string().optional().describe("Filter to a single feed by id (see list_feeds)"),
        since: z.string().optional().describe("ISO 8601 date; only items published on/after this"),
        limit: z.number().int().min(1).max(100).optional().default(20)
      })
    },
    async ({ query, category, type, feed_id, since, limit }) => {
      const data = await loadFeeds();
      const sinceMs = since ? Date.parse(since) : null;
      const q = query?.toLowerCase();

      const results: (FeedItem & { feedId: string; feedLabel: string })[] = [];
      for (const feed of data.feeds) {
        if (type && feed.type !== type) continue;
        if (feed_id && feed.id !== feed_id) continue;
        for (const item of feed.items) {
          if (category && !item.categories.some((c) => c.toLowerCase() === category.toLowerCase())) continue;
          if (sinceMs !== null && (!item.pubDate || Date.parse(item.pubDate) < sinceMs)) continue;
          if (q) {
            const haystack = `${item.title} ${item.summary} ${item.author}`.toLowerCase();
            if (!haystack.includes(q)) continue;
          }
          results.push({ ...item, feedId: feed.id, feedLabel: feed.label });
        }
      }

      results.sort((a, b) => (b.pubDate ?? "").localeCompare(a.pubDate ?? ""));
      const limited = results.slice(0, limit ?? 20);

      return json({ totalMatches: results.length, returned: limited.length, items: limited });
    }
  );

  server.registerTool(
    "latest",
    {
      description: "Get the most recently published items across all feeds, optionally filtered by feed type.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).optional().default(10),
        type: z.enum(FEED_TYPES).optional()
      })
    },
    async ({ limit, type }) => {
      const data = await loadFeeds();
      const items: (FeedItem & { feedId: string; feedLabel: string })[] = [];
      for (const feed of data.feeds) {
        if (type && feed.type !== type) continue;
        for (const item of feed.items) {
          items.push({ ...item, feedId: feed.id, feedLabel: feed.label });
        }
      }
      items.sort((a, b) => (b.pubDate ?? "").localeCompare(a.pubDate ?? ""));
      return json(items.slice(0, limit ?? 10));
    }
  );

  server.registerTool(
    "feed_health",
    {
      description: "List feeds that failed on their last scheduled fetch, with the error message, so you can see what's currently broken.",
      inputSchema: z.object({})
    },
    async () => {
      const data = await loadFeeds();
      const failing = data.feeds
        .filter((f) => f.error)
        .map((f) => ({ id: f.id, label: f.label, error: f.error, fetchedAt: f.fetchedAt }));
      return json({
        generatedAt: data.generatedAt,
        totalFeeds: data.feeds.length,
        failingCount: failing.length,
        failing
      });
    }
  );

  return server;
}

// A fresh server is created per request; feeds.json itself is cached at
// Cloudflare's edge for 5 minutes via the `cf` fetch option above.
export default createMcpHandler(createServer);
