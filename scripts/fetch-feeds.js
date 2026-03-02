const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

// Hard timeout per feed — if it doesn't respond in 8s, skip it
const TIMEOUT_MS = 8000;
const BATCH_SIZE = 5; // fetch 5 at a time to avoid hammering
const MAX_ITEMS  = 15;

const parser = new Parser({
  timeout: TIMEOUT_MS,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
});

const FEEDS = [
  // ── Intune ──────────────────────────────────────────────────────────────
  { id:'intune-blog',    label:'Microsoft Intune Blog',      category:'intune',     color:'#0078d4',
    url:'https://techcommunity.microsoft.com/plugins/custom/microsoft/o365/custom-blog-rss?tid=2&board=MicrosoftIntuneBlog' },
  { id:'intune-support', label:'Intune Support Team',        category:'intune',     color:'#0078d4',
    url:'https://techcommunity.microsoft.com/plugins/custom/microsoft/o365/custom-blog-rss?tid=2&board=IntuneSupportTeam' },
  { id:'4sysops',        label:'4sysops',                    category:'intune',     color:'#0078d4',
    url:'https://4sysops.com/feed/' },

  // ── SCCM / ConfigMgr ────────────────────────────────────────────────────
  { id:'configmgr',      label:'Microsoft ConfigMgr Blog',   category:'sccm',       color:'#005a9e',
    url:'https://techcommunity.microsoft.com/plugins/custom/microsoft/o365/custom-blog-rss?tid=2&board=ConfigurationManagerBlog' },
  { id:'patchmypc',      label:'Patch My PC Blog',           category:'sccm',       color:'#005a9e',
    url:'https://patchmypc.com/feed' },
  { id:'niallbrady',     label:'Niall Brady',                category:'sccm',       color:'#005a9e',
    url:'https://www.niallbrady.com/feed/' },

  // ── Endpoint Security ───────────────────────────────────────────────────
  { id:'defender',       label:'Microsoft Defender Blog',    category:'security',   color:'#d13438',
    url:'https://techcommunity.microsoft.com/plugins/custom/microsoft/o365/custom-blog-rss?tid=2&board=MicrosoftDefenderBlog' },
  { id:'msrc',           label:'MS Security Response Center',category:'security',   color:'#d13438',
    url:'https://msrc.microsoft.com/blog/feed/' },
  { id:'krebs',          label:'Krebs on Security',          category:'security',   color:'#d13438',
    url:'https://krebsonsecurity.com/feed/' },

  // ── M365 / Office 365 ───────────────────────────────────────────────────
  { id:'m365',           label:'Microsoft 365 Blog',         category:'m365',       color:'#d83b01',
    url:'https://www.microsoft.com/en-us/microsoft-365/blog/feed/' },
  { id:'office365itpro', label:'Office 365 for IT Pros',     category:'m365',       color:'#d83b01',
    url:'https://office365itpros.com/feed/' },
  { id:'practical365',   label:'Practical 365',              category:'m365',       color:'#d83b01',
    url:'https://practical365.com/feed/' },

  // ── Azure AD / Entra ID ─────────────────────────────────────────────────
  { id:'entra',          label:'Microsoft Entra Blog',       category:'entra',      color:'#7719aa',
    url:'https://techcommunity.microsoft.com/plugins/custom/microsoft/o365/custom-blog-rss?tid=2&board=Identity' },
  { id:'dirkjan',        label:'dirkjanm.io',                category:'entra',      color:'#7719aa',
    url:'https://dirkjanm.io/feed.xml' },

  // ── PowerShell / Scripting ──────────────────────────────────────────────
  { id:'ps-blog',        label:'PowerShell Team Blog',       category:'powershell', color:'#4a9fff',
    url:'https://devblogs.microsoft.com/powershell/feed/' },
  { id:'adamauto',       label:'Adam the Automator',         category:'powershell', color:'#4a9fff',
    url:'https://adamtheautomator.com/feed/' },
  { id:'ps-magazine',    label:'PowerShell Magazine',        category:'powershell', color:'#4a9fff',
    url:'https://powershellmagazine.com/feed/' },

  // ── Windows Updates / WSUS ──────────────────────────────────────────────
  { id:'win-itpro',      label:'Windows IT Pro Blog',        category:'windows',    color:'#00788a',
    url:'https://techcommunity.microsoft.com/plugins/custom/microsoft/o365/custom-blog-rss?tid=2&board=Windows-ITPro-blog' },
  { id:'askds',          label:'Ask Directory Services',     category:'windows',    color:'#00788a',
    url:'https://techcommunity.microsoft.com/plugins/custom/microsoft/o365/custom-blog-rss?tid=2&board=AskDS' },

  // ── Apple ───────────────────────────────────────────────────────────────
  { id:'mosyle',         label:'Mosyle Blog',                category:'apple',      color:'#8e8e93',
    url:'https://mosyle.com/blog/feed/' },
  { id:'macadmins',      label:'MacAdmins News',             category:'apple',      color:'#8e8e93',
    url:'https://macadmins.software/feed' },
  { id:'kandji',         label:'Kandji Blog',                category:'apple',      color:'#8e8e93',
    url:'https://www.kandji.io/blog/rss.xml' },
];

// Wraps a promise with a hard timeout so one slow feed can't block everything
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    )
  ]);
}

async function fetchFeed(feed) {
  const start = Date.now();
  try {
    const parsed = await withTimeout(parser.parseURL(feed.url), TIMEOUT_MS, feed.label);
    const items = (parsed.items || []).slice(0, MAX_ITEMS).map(item => ({
      title:      item.title || 'Untitled',
      link:       item.link || item.guid || '',
      pubDate:    item.isoDate || item.pubDate || null,
      summary:    strip(item.contentSnippet || item.summary || item.content || '').slice(0, 300),
      author:     item.creator || item.author || null,
      categories: item.categories || []
    }));
    console.log(`  ✓ ${feed.label} (${items.length} items, ${Date.now()-start}ms)`);
    return { ...feed, items, fetchedAt: new Date().toISOString(), error: null };
  } catch (err) {
    console.warn(`  ✗ ${feed.label}: ${err.message} (${Date.now()-start}ms)`);
    return { ...feed, items: [], fetchedAt: new Date().toISOString(), error: err.message };
  }
}

function strip(html) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// Fetch in batches so we don't open 22 connections simultaneously
async function fetchInBatches(feeds, batchSize) {
  const results = [];
  for (let i = 0; i < feeds.length; i += batchSize) {
    const batch = feeds.slice(i, i + batchSize);
    console.log(`\nBatch ${Math.floor(i/batchSize)+1}: fetching ${batch.map(f=>f.label).join(', ')}`);
    const batchResults = await Promise.all(batch.map(fetchFeed));
    results.push(...batchResults);
  }
  return results;
}

async function main() {
  console.log(`\nEndpointFeed — fetching ${FEEDS.length} feeds in batches of ${BATCH_SIZE}...\n`);
  const results = await fetchInBatches(FEEDS, BATCH_SIZE);

  const ok    = results.filter(f => !f.error).length;
  const total = results.reduce((a, f) => a + f.items.length, 0);

  const output = { generatedAt: new Date().toISOString(), feeds: results };
  fs.writeFileSync(
    path.join(__dirname, '..', 'docs', 'feeds.json'),
    JSON.stringify(output, null, 2)
  );
  console.log(`\n✅ Done — ${ok}/${FEEDS.length} feeds OK · ${total} total items`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
