# FORGENIQ Logic — Personalized AI-Native Intelligence (Preview)

**Preview only.** No production merge without approval.

## Capabilities

- **Live intelligence stream** — proactive strategist notes (`executeLiveIntelligenceSession`)
- **Portfolio paste & import** — `portfolioParser.js`, `portfolioImportEngine.js` (CSV, XLSX, PDF text, image OCR)
- **Portfolio profile** — sector, theme, AI/rates/vol/geo sensitivity
- **Watchlist store** — persist `brieftick_watchlist_v1`, infer exposure
- **Portfolio Logic mode** — personalized holdings-aware answers
- **Market structure stack** — structure, cross-asset, divergence, stress, priority, live narrative

## Key modules

| Module | Role |
|--------|------|
| `portfolioParser.js` | Paste box parsing + save |
| `portfolioProfile.js` | Concentration & sensitivity inference |
| `engines/portfolioImportEngine.js` | File import + OCR hooks |
| `watchlistStore.js` | Watchlist CRUD + exposure |
| `engines/portfolioIntelligenceEngine.js` | Personalized portfolio intelligence |
| `engines/intelligenceFeedEngine.js` | Continuous feed + anti-repetition |
| `engines/intelligenceStreamOrchestrator.js` | Coordinates all engines |

## Preview UI (Logic page only)

`logic-portfolio-panel.js` injects paste/import/watchlist into `#page-logic` hub — no dashboard redesign.

## Test prompts

- What matters most to markets right now?
- Analyze my portfolio
- What risks matter most for my holdings?
- How exposed is my portfolio to rates and AI concentration?

`?preview=logic&tab=logic`
