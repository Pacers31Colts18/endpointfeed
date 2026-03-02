const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const PER_FEED_TIMEOUT = 5000;
const BATCH_TIMEOUT_MS = 60000;
const BATCH_SIZE       = 5;
const MAX_ITEMS        = 5;

const parser = new Parser({
  timeout: PER_FEED_TIMEOUT,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  },
  customFields: {
    item: [
      ['media:group',     'mediaGroup'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['itunes:duration', 'itunesDuration'],
      ['itunes:image',    'itunesImage'],
    ]
  }
});

const FEEDS = [
  // ── Intune ──────────────────────────────────────────────────────────────
    { id:'4sysops',        label:'4sysops',                     category:'intune',     color:'#0078d4', type:'rss',
    url:'https://4sysops.com/feed/' },

  // ── SCCM / ConfigMgr/Windows Updates ────────────────────────────────────────────────────
  { id:'configmgr',      label:'Microsoft ConfigMgr Blog',    category:'sccm',       color:'#005a9e', type:'rss',
    url:'https://techcommunity.microsoft.com/plugins/custom/microsoft/o365/custom-blog-rss?tid=2&board=ConfigurationManagerBlog' },
  { id:'patchmypc',      label:'Patch My PC Blog',            category:'sccm',       color:'#005a9e', type:'rss',
    url:'https://patchmypc.com/feed' },
  { id:'niallbrady',     label:'Niall Brady',                 category:'sccm',       color:'#005a9e', type:'rss',
    url:'https://www.niallbrady.com/feed/' },

  // ── Endpoint Security ───────────────────────────────────────────────────
  { id:'krebs',          label:'Krebs on Security',           category:'security',   color:'#d13438', type:'rss',
    url:'https://krebsonsecurity.com/feed/' },

  // ── M365 / Office 365 ───────────────────────────────────────────────────
  { id:'office365itpro', label:'Office 365 for IT Pros',      category:'m365',       color:'#d83b01', type:'rss',
    url:'https://office365itpros.com/feed/' },
  { id:'practical365',   label:'Practical 365',               category:'m365',       color:'#d83b01', type:'rss',
    url:'https://practical365.com/feed/' },

  // ── Azure AD / Entra ID ─────────────────────────────────────────────────
  { id:'dirkjan',        label:'dirkjanm.io',                 category:'entra',      color:'#7719aa', type:'rss',
    url:'https://dirkjanm.io/feed.xml' },

  // ── Apple ───────────────────────────────────────────────────────────────
  { id:'mosyle',         label:'Mosyle Blog',                 category:'apple',      color:'#8e8e93', type:'rss',
    url:'https://mosyle.com/blog/feed/' },
  { id:'macadmins',      label:'MacAdmins News',              category:'apple',      color:'#8e8e93', type:'rss',
    url:'https://macadmins.software/feed' },
  { id:'kandji',         label:'Kandji Blog',                 category:'apple',      color:'#8e8e93', type:'rss',
    url:'https://www.kandji.io/blog/rss.xml' },

  // ── YouTube ─────────────────────────────────────────────────────────────
  { id:'yt-savill',      label:'John Savill Tech Training',   category:'media',      color:'#ff0000', type:'youtube',
    url:'https://www.youtube.com/feeds/videos.xml?channel_id=UCpIn7ox7j7bH_OFj7tYouOQ' },

  // ── Podcasts ─────────────────────────────────────────────────────────────
  { id:'pod-runasradio',  label:'RunAs Radio',                category:'media',      color:'#1db954', type:'podcast',
    url:'http://feeds.feedburner.com/RunasRadio' },
  { id:'pod-practical365',label:'Practical 365 Podcast',      category:'media',      color:'#1db954', type:'podcast',
    url:'https://practical365.com/feed/podcast/' },
];

function strip(html) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function getYoutubeVideoId(link) {
  const m = (link || '').match(/[?&]v=([^&]+)/);
  return m ? m[1] : null;
}

function getYoutubeThumbnail(item, videoId) {
  try {
    const mg = item.mediaGroup;
    if (mg?.['media:thumbnail']?.[0]?.$?.url) return mg['media:thumbnail'][0].$.url;
    if (item.mediaThumbnail?.$?.url) return item.mediaThumbnail.$.url;
  } catch (_) {}
  if (videoId) return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
  return null;
}

function getPodcastAudio(item) {
  if (item.enclosure?.url) return item.enclosure.url;
  return null;
}

function getPodcastImage(item, feedImage) {
  if (item.itunesImage?.$.href) return item.itunesImage.$.href;
  if (item.itunesImage?.href)   return item.itunesImage.href;
  return feedImage || null;
}

function formatDuration(raw) {
  if (!raw) return null;
  // Already HH:MM:SS or MM:SS
  if (/^\d+:\d+/.test(raw)) return raw;
  // Seconds integer
  const secs = parseInt(raw, 10);
  if (isNaN(secs)) return raw;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${m}:${String(s).padStart(2,'0')}`;
}

async function fetchFeed(feed) {
  const start = Date.now();
  try {
    const parsed = await Promise.race([
      parser.parseURL(feed.url),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timed out after ${PER_FEED_TIMEOUT}ms`)), PER_FEED_TIMEOUT)
      )
    ]);

    const feedImage = parsed.image?.url || parsed.itunes?.image || null;

    const items = (parsed.items || []).slice(0, MAX_ITEMS).map(item => {
      const base = {
        title:      item.title || 'Untitled',
        link:       item.link || item.guid || '',
        pubDate:    item.isoDate || item.pubDate || null,
        summary:    strip(item.contentSnippet || item.summary || item.content || item['itunes:summary'] || '').slice(0, 300),
        author:     item.creator || item.author || item['itunes:author'] || parsed.title || null,
        categories: item.categories || [],
        type:       feed.type,
      };

      if (feed.type === 'youtube') {
        const videoId    = getYoutubeVideoId(base.link);
        base.thumbnail   = getYoutubeThumbnail(item, videoId);
        base.videoId     = videoId;
      }

      if (feed.type === 'podcast') {
        base.audioUrl  = getPodcastAudio(item);
        base.thumbnail = getPodcastImage(item, feedImage);
        base.duration  = formatDuration(item.itunesDuration || item['itunes:duration']);
      }

      return base;
    });

    console.log(`  ✓ ${feed.label} — ${items.length} items (${Date.now() - start}ms)`);
    return { ...feed, items, fetchedAt: new Date().toISOString(), error: null };
  } catch (err) {
    console.warn(`  ✗ ${feed.label} — ${err.message} (${Date.now() - start}ms)`);
    return { ...feed, items: [], fetchedAt: new Date().toISOString(), error: err.message };
  }
}

async function fetchBatchWithTimeout(batch) {
  const settled = new Array(batch.length).fill(null);
  const promises = batch.map((feed, i) =>
    fetchFeed(feed).then(result => { settled[i] = result; })
  );
  await Promise.race([
    Promise.all(promises),
    new Promise(resolve => setTimeout(resolve, BATCH_TIMEOUT_MS))
  ]);
  return settled.map((result, i) =>
    result ?? {
      ...batch[i],
      items: [],
      fetchedAt: new Date().toISOString(),
      error: `batch timeout — did not complete within ${BATCH_TIMEOUT_MS / 1000}s`
    }
  );
}

async function main() {
  const total   = FEEDS.length;
  const batches = Math.ceil(total / BATCH_SIZE);
  console.log(`\nEndpointFeed — ${total} feeds (${batches} batches of ${BATCH_SIZE})\n`);

  const results = [];
  for (let i = 0; i < FEEDS.length; i += BATCH_SIZE) {
    const batch    = FEEDS.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`\n── Batch ${batchNum}/${batches}: ${batch.map(f => f.label).join(', ')}`);
    const batchResults = await fetchBatchWithTimeout(batch);
    results.push(...batchResults);
    fs.writeFileSync(
      path.join(__dirname, '..', 'docs', 'feeds.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), feeds: results }, null, 2)
    );
    console.log(`  └─ Saved (${results.length}/${total} feeds written)`);
  }

  const ok       = results.filter(f => !f.error).length;
  const articles = results.reduce((a, f) => a + f.items.length, 0);
  console.log(`\n✅ Complete — ${ok}/${total} feeds OK · ${articles} total items`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
