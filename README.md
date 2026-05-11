# BriefTick

Markets dashboard with server-side API key management and request caching.

## Architecture

- **Frontend:** Single-file HTML/JS app (`index.html`)
- **Backend:** Vercel serverless proxy (`api/proxy.js`) — caches API responses, hides keys
- **Providers:** Twelve Data (quotes), Finnhub (news/earnings), Alpha Vantage (sectors/technicals), Anthropic (AI summaries)

## How API keys work

Keys live as **environment variables on Vercel**, not in the browser. The proxy at `/api/proxy?provider=...` attaches the right key server-side before forwarding requests upstream.

This means:
- Visitors don't need their own keys
- Keys never appear in client code or browser storage
- One API call serves many visitors (response cached for 30s-30min depending on endpoint)
- Free-tier rate limits stretch much further

## Setup (Vercel deployment)

1. Push this repo to GitHub
2. Import in Vercel
3. Go to Project Settings → Environment Variables and add:

   | Name | Value |
   |---|---|
   | `TWELVE_DATA_KEY` | your Twelve Data key |
   | `FINNHUB_KEY` | your Finnhub key |
   | `ALPHA_VANTAGE_KEY` | your Alpha Vantage key |
   | `ANTHROPIC_KEY` | your Anthropic key |

4. Redeploy (Vercel → Deployments → ⋯ → Redeploy on the latest)

## Cache TTLs

| Endpoint | TTL |
|---|---|
| Twelve Data quotes / time series | 30s |
| Finnhub quote | 30s |
| Finnhub news | 60s |
| Finnhub company news | 5min |
| Finnhub earnings calendar | 30min |
| Alpha Vantage (all) | 5min |
| Anthropic | not cached |

Edit `api/proxy.js` to tune these.

## Local development

```
npx vercel dev
```

This boots the proxy locally. Add the same env vars to a `.env.local` file (gitignored) for local testing.
