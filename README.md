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
│   └── feeds.json              # Auto-generated feed data
└── scripts/
    ├── fetch-feeds.js          # Feed fetcher script
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
