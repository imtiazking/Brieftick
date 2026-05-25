# Brieftick Logic — Intelligence Engine (Preview)

Structured market intelligence pipeline. **Preview branch only** until approved for `main`.

## Pipeline

```
User prompt
  → entityResolver (normalize companies, tickers, ETFs, sectors, indices, macro)
  → modeDetect (route to 7 Logic modules)
  → sourceRouter (Finnhub, Twelve Data, Polygon, macro, portfolio context)
  → dataFusion (multi-source quotes + news, cross-check, relevance filter)
  → Logic module (Market Pulse, Ticker, Portfolio, …)
  → fallbackIntelligence (if empty / API fail — never “unable to analyze”)
  → watchlistMemory (personalized hints)
  → confidence (High / Moderate / Limited live / Partial data)
  → UI cards in #logicResultSurface
```

## Files

| File | Role |
|------|------|
| `entityResolver.js` | Aliases, stopwords, no first-word ticker false positives |
| `modeDetect.js` | Module selection from prompt + entity |
| `sourceRouter.js` | Provider routing by intent |
| `dataFusion.js` | Multi-source fetch + agreement scoring |
| `confidence.js` | Structured confidence labels |
| `watchlistMemory.js` | Watchlist, themes, interaction memory |
| `fallbackIntelligence.js` | Always-on contextual cards |
| `logicEngine.js` | Orchestrator (`executeLogicPipeline`) |
| `logicRouter.js` | Public API: `routeLogicPrompt`, `detectLogicMode` |
| `shared.js` | LLM, headlines, quotes, debug logging |
| `*Logic.js` | Seven module handlers |
| `freeAccess.js` | Free tier limits (preview + signed-in Free) |
| `preview/logic-preview.js` | UI submit + card render |

## Mock vs live data

- **Live:** Finnhub news/quotes when API keys are set in Settings; Twelve Data used as secondary quote check when configured.
- **Partial:** `Live market confirmation currently limited.` banner + **Limited live confirmation** confidence.
- **Contextual:** Historical/sector/macro narrative via `fallbackIntelligence.js` — not an error state.

## Safety

Every response includes: **Market intelligence, not financial advice.**  
No buy/sell/hold or trade execution.

## Preview URL

`?preview=logic&tab=logic` on the Vercel PR deployment, or **Logic** tab when signed in.
