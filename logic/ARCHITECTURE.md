# Brieftick Logic — Interconnected Intelligence (Preview)

**Preview only.** No production merge without approval.

## Pipeline

```
Prompt
  → entityResolver
  → questionIntent + modeDetect
  → sourceRouter → multiSourceFetch → dataFusion
  → intelligenceContext (regime, marketGraph, narrative memory)
  → marketIntelligenceStack (structure, cross-asset, positioning, narrative shifts, divergence, stress, feed hooks)
  → Logic module (ticker | briefing | causal | scenario | macro-interpretation | …)
  → intelligenceLayer (graph, market intelligence apply, memory, quality, synthesis, polish)
  → watchlist/portfolio memory
  → confidenceEngine (with reasons)
  → responseComposer
  → Intelligence Cards UI (dynamic schema, optional structure sections)
```

## Engines

| Module | Role |
|--------|------|
| `engines/marketGraph.js` | Cross-asset transmission chains |
| `engines/regimeEngine.js` | risk-on/off, inflation, geopolitical stress, AI momentum, … |
| `engines/marketStructureEngine.js` | Breadth, concentration, AI leadership, fragile rallies |
| `engines/crossAssetEngine.js` | Dominant factor sensitivities (rates, oil, vol, liquidity, AI) |
| `engines/marketDivergenceEngine.js` | Conflicting equity/bond/vol/geopolitical signals |
| `engines/marketStressEngine.js` | Complacency, concentration, liquidity fragility |
| `engines/positioningEngine.js` | Crowding, de-grossing, rotation pressure |
| `engines/narrativeEngine.js` | Focus shifts, inflation→growth, AI→breadth fatigue |
| `engines/intelligenceFeedEngine.js` | Institutional notes + stream hooks (no live UI yet) |
| `engines/marketIntelligenceOrchestrator.js` | Runs stack; applies insights when query is complex |
| `engines/macroInterpretationEngine.js` | Conceptual macro Q&A |
| `engines/causalReasoningEngine.js` | Mechanism-first sector Q&A |
| `engines/intelligenceStream.js` | Hooks for future live feed |

## Preview

`?preview=logic&tab=logic`

## Test prompts

- What macro conditions would break the current AI-led market structure?
- Why can lower inflation become bearish for growth stocks?
- Why can falling yields signal recession risk instead of optimism?
- What relationships across oil, yields, volatility and AI matter most right now?
- Why have equities remained strong while bond markets price slower growth?
- What hidden fragilities are markets currently underpricing?
