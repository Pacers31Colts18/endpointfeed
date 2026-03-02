/**
 * EndpointFeed — RSS fetcher
 * Uses ONLY Node.js built-ins (https, http, zlib, fs).
 * No npm install required.
 */

const https   = require('https');
const http    = require('http');
const zlib    = require('zlib');
const fs      = require('fs');
const path    = require('path');
const { URL } = require('url');

const PER_FEED_TIMEOUT = 8000;
const BATCH_SIZE       = 4;
const MAX_ITEMS        = 5;

const FEEDS = [
  // ── Intune ──────────────────────────────────────────────────────────────
  { id:'4sysops',        label:'4sysops',                   category:'intune',   color:'#0078d4', type:'rss',
    url:'https://4sysops.com/feed/' },
  { id:'petervanderwoude', label:'petervanderwoude.nl', category:'intune', color:'#0078d4', type:'rss',
    url:'https://petervanderwoude.nl/feed/'},

  // ── ConfigMgr/WSUS ────────────────────────────────────────────────────
  { id:'patchmypc',      label:'Patch My PC Blog - patchmypc.com',          category:'sccm',     color:'#005a9e', type:'rss',
    url:'https://patchmypc.com/feed' },
  { id:'niallbrady',     label:'Niall Brady - niallbrady.com',               category:'sccm',     color:'#005a9e', type:'rss',
    url:'https://www.niallbrady.com/feed/' },
  { id:'garytown',     label:'Gary Blok - garytown.com',               category:'sccm',     color:'#005a9e', type:'rss',
    url:'https://garytown.com/feed' },

  // ── Endpoint Security ───────────────────────────────────────────────────
  { id:'krebs',          label:'Krebs on Security',         category:'security', color:'#d13438', type:'rss',
    url:'https://krebsonsecurity.com/feed/' },

  // ── M365 / Office 365 ───────────────────────────────────────────────────
  { id:'office365itpro', label:'Office 365 for IT Pros',    category:'m365',     color:'#d83b01', type:'rss',
    url:'https://office365itpros.com/feed/' },

  // ── Azure AD / Entra ID ─────────────────────────────────────────────────
  { id:'dirkjan',        label:'dirkjanm.io',               category:'entra',    color:'#7719aa', type:'rss',
    url:'https://dirkjanm.io/feed.xml' },

  // ── Apple ───────────────────────────────────────────────────────────────
  { id:'kandji',         label:'Kandji Blog',               category:'apple',    color:'#8e8e93', type:'rss',
    url:'https://www.kandji.io/blog/rss.xml' },

  // ── Video ─────────────────────────────────────────────────────────────
  { id:'yt-savill',      label:'John Savill Tech Training', category:'video',    color:'#ff0000', type:'youtube',
    url:'https://www.youtube.com/feeds/videos.xml?channel_id=UCpIn7ox7j7bH_OFj7tYouOQ' },
    { id:'5bytes-podcast',   label:'5 Bytes Podcast',               category:'video',      color:'#ff0000', type:'youtube',
    url:'https://www.youtube.com/feeds/videos.xml?channel_id=UC5CI6Etl3fmyhcmxovhowtw'},
  // ── Audio ─────────────────────────────────────────────────────────────
  { id:'pod-runasradio',   label:'RunAs Radio',               category:'audio',      color:'#1db954', type:'podcast',
    url:'https://feeds.simplecast.com/cRTTfxcT'},
  { id:'pod-powershell-podcast',   label:'PowerShell Podcast',               category:'audio',      color:'#1db954', type:'podcast',
    url:'https://feed.podbean.com/powershellpodcast/feed.xml'},
];

// ── HTTP fetch with redirect + gzip support ───────────────────────────────
function fetchUrl(rawUrl, redirects = 5) {
  return new Promise((resolve, reject) => {
    if (redirects < 0) return reject(new Error('Too many redirects'));

    const parsed  = new URL(rawUrl);
    const lib     = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      timeout:  PER_FEED_TIMEOUT,
      headers:  {
        'User-Agent':      'Mozilla/5.0 (compatible; EndpointFeed/2.0)',
        'Accept':          'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Encoding': 'gzip, deflate',
      },
    };

    const req = lib.request(options, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        const next = new URL(res.headers.location, rawUrl).toString();
        res.resume();
        return resolve(fetchUrl(next, redirects - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const chunks = [];
      const enc    = (res.headers['content-encoding'] || '').toLowerCase();
      let stream   = res;
      if (enc === 'gzip')    stream = res.pipe(zlib.createGunzip());
      if (enc === 'deflate') stream = res.pipe(zlib.createInflate());

      stream.on('data',  c => chunks.push(c));
      stream.on('end',   () => resolve(Buffer.concat(chunks).toString('utf8')));
      stream.on('error', reject);
    });

    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout after ${PER_FEED_TIMEOUT}ms`)); });
    req.on('error', reject);
    req.end();
  });
}

// ── Minimal XML helpers ───────────────────────────────────────────────────
function tag(xml, name) {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i');
  const m  = xml.match(re);
  return m ? m[1].trim() : '';
}

function tagAttr(xml, name, attr) {
  const re = new RegExp(`<${name}[^>]*\\s${attr}="([^"]*)"`, 'i');
  const m  = xml.match(re);
  return m ? m[1] : '';
}

function allTags(xml, name) {
  const re = new RegExp(`<${name}[\\s>][\\s\\S]*?<\\/${name}>`, 'gi');
  return xml.match(re) || [];
}

function stripTags(s)     { return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }
function decodeCdata(s)   { return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c) => c); }
function decodeEntities(s) {
  return s
    .replace(/&amp;/g,  '&').replace(/&lt;/g,  '<').replace(/&gt;/g,  '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g,      (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
function clean(s) { return decodeEntities(decodeCdata(s)).trim(); }

// ── Parse feed XML ────────────────────────────────────────────────────────
function parseXml(xml, feedType) {
  const isAtom  = /<feed[\s>]/i.test(xml);
  const itemTag = isAtom ? 'entry' : 'item';
  const rawItems = allTags(xml, itemTag);

  return rawItems.slice(0, MAX_ITEMS).map(raw => {
    const title = clean(stripTags(tag(raw, 'title') || 'Untitled'));

    let link = '';
    if (isAtom) {
      link = tagAttr(raw, 'link', 'href') || clean(tag(raw, 'link'));
    } else {
      link = clean(tag(raw, 'link')) || clean(tag(raw, 'guid'));
    }

    const pubDate = clean(
      tag(raw, 'pubDate') || tag(raw, 'published') || tag(raw, 'updated')
    ) || null;
    let isoDate = null;
    if (pubDate) { try { isoDate = new Date(pubDate).toISOString(); } catch(_) {} }

    const rawSummary = tag(raw, 'description') || tag(raw, 'summary') ||
                       tag(raw, 'content') || tag(raw, 'media:description') || '';
    const summary = clean(stripTags(rawSummary)).slice(0, 300);
    const author  = clean(
      tag(raw, 'dc:creator') || tag(raw, 'author') || tag(raw, 'name') || ''
    );

    const base = { title, link, pubDate: isoDate, summary, author, categories: [], type: feedType };

    if (feedType === 'youtube') {
      const videoId  = (link.match(/[?&]v=([^&]+)/) || [])[1] || null;
      const thumbUrl = tagAttr(raw, 'media:thumbnail', 'url');
      base.videoId   = videoId;
      base.thumbnail = thumbUrl || (videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : null);
    }

    return base;
  });
}

// ── Fetch + parse one feed ────────────────────────────────────────────────
async function fetchFeed(feed) {
  const start = Date.now();
  try {
    const xml   = await fetchUrl(feed.url);
    const items = parseXml(xml, feed.type);
    console.log(`  ✓ ${feed.label} — ${items.length} items (${Date.now()-start}ms)`);
    return { ...feed, items, fetchedAt: new Date().toISOString(), error: null };
  } catch (err) {
    console.warn(`  ✗ ${feed.label} — ${err.message} (${Date.now()-start}ms)`);
    return { ...feed, items: [], fetchedAt: new Date().toISOString(), error: err.message };
  }
}

// ── Batch with wall-clock cap ─────────────────────────────────────────────
async function fetchBatch(batch) {
  const BATCH_MS = (PER_FEED_TIMEOUT * batch.length) + 3000;
  const settled  = new Array(batch.length).fill(null);
  const promises = batch.map((feed, i) =>
    fetchFeed(feed).then(r => { settled[i] = r; })
  );
  await Promise.race([
    Promise.all(promises),
    new Promise(res => setTimeout(res, BATCH_MS))
  ]);
  return settled.map((r, i) => r ?? {
    ...batch[i], items: [], fetchedAt: new Date().toISOString(),
    error: `batch timeout after ${BATCH_MS}ms`
  });
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nEndpointFeed — ${FEEDS.length} feeds, zero npm deps\n`);
  const outFile = path.join(__dirname, '..', 'docs', 'feeds.json');
  const results = [];
  const batches = Math.ceil(FEEDS.length / BATCH_SIZE);

  for (let i = 0; i < FEEDS.length; i += BATCH_SIZE) {
    const batch    = FEEDS.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`\n── Batch ${batchNum}/${batches}: ${batch.map(f => f.label).join(', ')}`);
    const res = await fetchBatch(batch);
    results.push(...res);
    fs.writeFileSync(
      outFile,
      JSON.stringify({ generatedAt: new Date().toISOString(), feeds: results }, null, 2)
    );
    console.log(`  └─ saved (${results.length}/${FEEDS.length} feeds written)`);
  }

  const ok    = results.filter(f => !f.error).length;
  const items = results.reduce((a, f) => a + f.items.length, 0);
  console.log(`\n✅ Complete — ${ok}/${results.length} feeds OK · ${items} total items`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
