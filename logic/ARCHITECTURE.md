# Brieftick Logic — Structured Intelligence Pipeline (Preview)

**Preview branch only.** Do not merge to `main` / production without explicit approval.

## Target architecture

```
Prompt
  ↓
entityResolver
  ↓
intent + modeDetect
  ↓
sourceRouter
  ↓
multiSourceFetch
  ↓
dataFusion
  ↓
Logic module
  ↓
fallbackIntelligence
  ↓
watchlist + portfolioMemory
  ↓
confidenceEngine
  ↓
Intelligence Cards UI (#logicResultSurface)
```

## Stage reference

| Stage | Module | Responsibility |
|-------|--------|----------------|
| 1 | `entityResolver.js` | Companies, tickers, ETFs, sectors, indices, macro; aliases (Nvidia→NVDA, AI stocks→XLK); no first-word ticker false positives |
| 2 | `intentDetect.js` + `modeDetect.js` | User intent label + Logic module (ticker, market pulse, risk, portfolio, sector, brief, scenario) |
| 3 | `sourceRouter.js` | Route quote / news / macro / earnings / sentiment / volatility to Finnhub, Polygon, Twelve Data, macro feed, portfolio context |
| 4 | `multiSourceFetch.js` | Parallel fetch all routed sources |
| 5 | `dataFusion.js` | Merge price, news, sentiment, vol, sector moves, portfolio into `FusionBundle` |
| 6 | `*Logic.js` | Module-specific narrative + structured cards |
| 7 | `fallbackIntelligence.js` | Never blank; never “Unable to analyze”; historical + macro + sector context |
| 8 | `watchlistMemory.js` + `portfolioMemory.js` | Watchlist, themes, interactions, concentration, exposure |
| 9 | `confidenceEngine.js` | High / Moderate / Limited live confirmation / Partial market data |
| 10 | `preview/logic-preview.js` | Render Snapshot, Catalyst, Macro, Sector, Volatility, Summary (+ optional cards) |

Orchestrator: `logicEngine.js` (`executeLogicPipeline`).

Public API: `logicRouter.js` → `routeLogicPrompt`, `detectLogicMode`, `detectIntent`.

## Mock vs live

| State | Behavior |
|-------|----------|
| **Live** | Finnhub (+ Twelve Data / Polygon when keys set in Settings) |
| **Limited** | Banner: “Live market confirmation currently limited.” |
| **Contextual** | `fallbackIntelligence.js` — partial intelligence, not an error |

## Safety

Every response: **Market intelligence, not financial advice.**  
No buy/sell/hold or trade execution.

## Preview

`?preview=logic&tab=logic` on the PR Vercel deployment, or **Logic** tab when signed in.  
Add `&logic_debug=1` for `[Brieftick Logic]` console logs.
