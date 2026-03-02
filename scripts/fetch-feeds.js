const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EndpointFeed/1.0)' }
});

const FEEDS = [
  // Intune
  { id: 'intune-blog',    label: 'Microsoft Intune Blog',     url: 'https://techcommunity.microsoft.com/plugins/custom/microsoft/o365/custom-blog-rss?tid=2&board=MicrosoftIntuneBlog',   category: 'intune',     color: '#0078d4' },
  { id: 'intune-support', label: 'Intune Support Team',       url: 'https://techcommunity.microsoft.com/plugins/custom/microsoft/o365/custom-blog-rss?tid=2&board=IntuneSupportTeam',     category: 'intune',     color: '#0078d4' },
  { id: '4sysops',        label: '4sysops',                   url: 'https://4sysops.com/feed/',                                                                                            category: 'intune',     color: '#0078d4' },
  // SCCM / ConfigMgr
  { id: 'configmgr-blog', label: 'Microsoft ConfigMgr Blog',  url: 'https://techcommunity.microsoft.com/plugins/custom/microsoft/o365/custom-blog-rss?tid=2&board=ConfigurationManagerBlog', category: 'sccm',    color: '#005a9e' },
  { id: 'patchmypc',      label: 'Patch My PC Blog',          url: 'https://patchmypc.com/feed',                                                                                           category: 'sccm',     color: '#005a9e' },
  { id: 'niallbrady',     label: 'Niall Brady',               url: 'https://www.niallbrady.com/feed/',                                                                                     category: 'sccm',     color: '#005a9e' },
  // Endpoint Security
  { id: 'defender-blog',  label: 'Microsoft Defender Blog',   url: 'https://techcommunity.microsoft.com/plugins/custom/microsoft/o365/custom-blog-rss?tid=2&board=MicrosoftDefenderBlog', category: 'security',  color: '#d13438' },
  { id: 'msrc',           label: 'MS Security Response',      url: 'https://msrc.microsoft.com/blog/feed/',                                                                                category: 'security',  color: '#d13438' },
  { id: 'krebs',          label: 'Krebs on Security',         url: 'https://krebsonsecurity.com/feed/',                                                                                    category: 'security',  color: '#d13438' },
  // M365 / Office 365
  { id: 'm365-blog',      label: 'Microsoft 365 Blog',        url: 'https://www.microsoft.com/en-us/microsoft-365/blog/feed/',                                                             category: 'm365',      color: '#d83b01' },
  { id: 'office365itpro', label: 'Office 365 for IT Pros',    url: 'https://office365itpros.com/feed/',                                                                                    category: 'm365',      color: '#d83b01' },
  { id: 'practical365',   label: 'Practical 365',             url: 'https://practical365.com/feed/',                                                                                       category: 'm365',      color: '#d83b01' },
  // Azure AD / Entra ID
  { id: 'entra-blog',     label: 'Microsoft Entra Blog',      url: 'https://techcommunity.microsoft.com/plugins/custom/microsoft/o365/custom-blog-rss?tid=2&board=Identity',              category: 'entra',     color: '#7719aa' },
  { id: 'dirkjan',        label: 'dirkjanm.io',               url: 'https://dirkjanm.io/feed.xml',                                                                                        category: 'entra',     color: '#7719aa' },
  // PowerShell / Scripting
  { id: 'ps-blog',        label: 'PowerShell Team Blog',      url: 'https://devblogs.microsoft.com/powershell/feed/',                                                                     category: 'powershell', color: '#012456' },
  { id: 'adamauto',       label: 'Adam the Automator',        url: 'https://adamtheautomator.com/feed/',                                                                                  category: 'powershell', color: '#012456' },
  { id: 'ps-magazine',    label: 'PowerShell Magazine',       url: 'https://powershellmagazine.com/feed/',                                                                                category: 'powershell', color: '#012456' },
  // Windows Updates / WSUS
  { id: 'win-itpro',      label: 'Windows IT Pro Blog',       url: 'https://techcommunity.microsoft.com/plugins/custom/microsoft/o365/custom-blog-rss?tid=2&board=Windows-ITPro-blog',   category: 'windows',   color: '#00788a' },
  { id: 'askds',          label: 'Ask Directory Services',    url: 'https://techcommunity.microsoft.com/plugins/custom/microsoft/o365/custom-blog-rss?tid=2&board=AskDS',                category: 'windows',   color: '#00788a' },
  // Apple
  { id: 'mosyle',         label: 'Mosyle Blog',               url: 'https://mosyle.com/blog/feed/',                                                                                       category: 'apple',     color: '#888888' },
  { id: 'macadmins',      label: 'MacAdmins News',            url: 'https://macadmins.software/feed',                                                                                     category: 'apple',     color: '#888888' },
  { id: 'kandji',         label: 'Kandji Blog',               url: 'https://www.kandji.io/blog/rss.xml',                                                                                  category: 'apple',     color: '#888888' },
];

const MAX_ITEMS = 15;

async function fetchFeed(feed) {
  try {
    console.log(`  Fetching: ${feed.label}`);
    const parsed = await parser.parseURL(feed.url);
    const items = (parsed.items || []).slice(0, MAX_ITEMS).map(item => ({
      title: item.title || 'Untitled',
      link: item.link || item.guid || '',
      pubDate: item.isoDate || item.pubDate || null,
      summary: strip(item.contentSnippet || item.summary || item.content || '').slice(0, 300),
      author: item.creator || item.author || null,
      categories: item.categories || []
    }));
    return { ...feed, items, fetchedAt: new Date().toISOString(), error: null };
  } catch (err) {
    console.error(`  ✗ ${feed.label}: ${err.message}`);
    return { ...feed, items: [], fetchedAt: new Date().toISOString(), error: err.message };
  }
}

function strip(html) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

async function main() {
  console.log(`\nFetching ${FEEDS.length} feeds...\n`);
  const results = await Promise.all(FEEDS.map(fetchFeed));
  const ok = results.filter(f => !f.error).length;
  const total = results.reduce((a, f) => a + f.items.length, 0);
  fs.writeFileSync(
    path.join(__dirname, '..', 'docs', 'feeds.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), feeds: results }, null, 2)
  );
  console.log(`\n✅ ${ok}/${FEEDS.length} feeds OK · ${total} total items`);
}

main().catch(e => { console.error(e); process.exit(1); });
