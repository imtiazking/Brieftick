# BriefTick

Markets dashboard — live quotes, news, earnings, and AI summaries. Single-file HTML app.

## Setup

Open the site, click the gear icon in the top right, and paste your API keys for:

- **Anthropic** — https://console.anthropic.com (powers AI features)
- **Twelve Data** — https://twelvedata.com (live quotes)
- **Finnhub** — https://finnhub.io (news, earnings calendar)
- **Alpha Vantage** — https://www.alphavantage.co (sector data, technicals)

All providers have free tiers. Keys are stored only in your browser's localStorage — they never leave your machine.

## Deploy

This is a single static HTML file. Drop it on any static host:

- **Vercel** — import the GitHub repo, no build config needed
- **Netlify** — same
- **GitHub Pages** — enable in repo settings

## Notes

- Free tiers have rate limits (e.g. Twelve Data is 8 calls/min, Alpha Vantage is 25/day). Upgrade if you hit them.
- The Anthropic browser-direct call uses the `anthropic-dangerous-direct-browser-access` header. For production use, consider proxying through a serverless function.
