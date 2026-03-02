const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const PER_FEED_TIMEOUT  = 10000; // 10s per individual feed
const BATCH_TIMEOUT_MS  = 60000; // 60s max for an entire batch
const BATCH_SIZE        = 5;
const MAX_ITEMS         = 15;

const parser = new Parser({
  timeout: PER_FEED_TIMEOUT,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
});

const FEEDS = [
  // ── Intune ──────────────────────────────────────────────────────────────
  { id:'intune-blog',    label:'Microsoft Intune Blog',       category:'intune',     color:'#0078d4',
    url:'https://techcommunity.microsoft.com/plugins/custom/microsoft/o365/custom-blog-rss?tid=2&board=MicrosoftIntuneBlog' },
  { id:'intune-support', label:'Intune Support Team',         category:'intune',     color:'#0078d4',
    url:'https://techcommunity.microsoft.com/plugins/custom/microsoft/o365/custom-blog-rss?tid=2&board=IntuneSupportTeam' },
  { id:'4sysops',        label:'4sysops',                     category:'intune',     color:'#0078d4',
    url:'https://4sysops.com/feed/' },

  // ── SCCM / ConfigMgr/Windows Updates ────────────────────────────────────────────────────
  { id:'configmgr',      label:'Microsoft ConfigMgr Blog',    category:'sccm',       color:'#005a9e',
    url:'https://techcommunity.microsoft.com/plugins/custom/microsoft/o365/custom-blog-rss?tid=2&board=ConfigurationManagerBlog' },
  { id:'patchmypc',      label:'Patch My PC Blog',            category:'sccm',       color:'#005a9e',
    url:'https://patchmypc.com/feed' },
  { id:'niallbrady',     label:'Niall Brady',                 category:'sccm',       color:'#005a9e',
    url:'https://www.niallbrady.com/feed/' },

  // ── M365 / Office 365 ───────────────────────────────────────────────────
  { id:'m365',           label:'Microsoft 365 Blog',          category:'m365',       color:'#d83b01',
    url:'https://www.microsoft.com/en-us/microsoft-365/blog/feed/' },
  { id:'office365itpro', label:'Office 365 for IT Pros',      category:'m365',       color:'#d83b01',
    url:'https://office365itpros.com/feed/' },
  { id:'practical365',   label:'Practical 365',               category:'m365',       color:'#d83b01',
    url:'https://practical365.com/feed/' },

  // ── Azure AD / Entra ID ─────────────────────────────────────────────────
  { id:'dirkjan',        label:'dirkjanm.io',                 category:'entra',      color:'#7719aa',
    url:'https://dirkjanm.io/feed.xml' },

  // ── Apple ───────────────────────────────────────────────────────────────
  { id:'macadmins',      label:'MacAdmins News',              category:'apple',      color:'#8e8e93',
    url:'https://macadmins.software/feed' },
  { id:'kandji',         label:'Kandji Blog',                 category:'apple',      color:'#8e8e93',
    url:'https://www.kandji.io/blog/rss.xml' },
];

function strip(html) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// Fetch a single feed with its own timeout
async function fetchFeed(feed) {
  const start = Date.now();
  try {
    const raceResult = await Promise.race([
      parser.parseURL(feed.url),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timed out after ${PER_FEED_TIMEOUT}ms`)), PER_FEED_TIMEOUT)
      )
    ]);
    const items = (raceResult.items || []).slice(0, MAX_ITEMS).map(item => ({
      title:      item.title || 'Untitled',
      link:       item.link || item.guid || '',
      pubDate:    item.isoDate || item.pubDate || null,
      summary:    strip(item.contentSnippet || item.summary || item.content || '').slice(0, 300),
      author:     item.creator || item.author || null,
      categories: item.categories || []
    }));
    console.log(`  ✓ ${feed.label} — ${items.length} items (${Date.now() - start}ms)`);
    return { ...feed, items, fetchedAt: new Date().toISOString(), error: null };
  } catch (err) {
    console.warn(`  ✗ ${feed.label} — ${err.message} (${Date.now() - start}ms)`);
    return { ...feed, items: [], fetchedAt: new Date().toISOString(), error: err.message };
  }
}

// Run a batch, but resolve after BATCH_TIMEOUT_MS regardless.
// Any feed that hasn't finished by then gets marked as timed out.
async function fetchBatchWithTimeout(batch) {
  const settled = new Array(batch.length).fill(null);

  // Kick off all feeds in the batch
  const promises = batch.map((feed, i) =>
    fetchFeed(feed).then(result => { settled[i] = result; })
  );

  // Race the whole batch against a 60s wall clock
  await Promise.race([
    Promise.all(promises),
    new Promise(resolve => setTimeout(resolve, BATCH_TIMEOUT_MS))
  ]);

  // Fill in any that didn't finish in time
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
  console.log(`\nEndpointFeed — ${FEEDS.length} feeds, batches of ${BATCH_SIZE}, ${BATCH_TIMEOUT_MS/1000}s batch timeout\n`);

  const results = [];
  const batches = Math.ceil(FEEDS.length / BATCH_SIZE);

  for (let i = 0; i < FEEDS.length; i += BATCH_SIZE) {
    const batch     = FEEDS.slice(i, i + BATCH_SIZE);
    const batchNum  = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`\n── Batch ${batchNum}/${batches}: ${batch.map(f => f.label).join(', ')}`);
    const batchResults = await fetchBatchWithTimeout(batch);
    results.push(...batchResults);

    // Write partial results after every batch so we always have something
    fs.writeFileSync(
      path.join(__dirname, '..', 'docs', 'feeds.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), feeds: results }, null, 2)
    );
    console.log(`  └─ Batch ${batchNum} saved (${results.length} feeds written so far)`);
  }

  const ok    = results.filter(f => !f.error).length;
  const total = results.reduce((a, f) => a + f.items.length, 0);
  console.log(`\n✅ Complete — ${ok}/${results.length} feeds OK · ${total} total items`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
