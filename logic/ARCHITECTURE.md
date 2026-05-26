# Brieftick Logic — Interconnected Intelligence (Preview)

**Preview only.** No production merge without approval.

## Pipeline

```
Prompt
  → entityResolver
  → questionIntent + modeDetect
  → sourceRouter → multiSourceFetch → dataFusion
  → intelligenceContext (regime, marketGraph, narrative, positioning)
  → Logic module (ticker | briefing | causal | scenario | …)
  → intelligenceLayer (graph, memory, narrative, positioning, quality, synthesis)
  → watchlist/portfolio memory
  → confidenceEngine (with reasons)
  → responseComposer
  → Intelligence Cards UI (dynamic schema)
```

## Engines

| Module | Role |
|--------|------|
| `engines/marketGraph.js` | Cross-asset transmission chains (oil, rates, shipping, AI, …) |
| `relationshipMemory.js` | Prior themes (Iran, oil, inflation, AI, rates) |
| `engines/regimeEngine.js` | risk-on/off, inflation, geopolitical stress, AI momentum, … |
| `engines/narrativeEngine.js` | Focus shifts, acceleration, fatigue |
| `engines/positioningEngine.js` | Crowding, unwind, rotation pressure |
| `engines/causalReasoningEngine.js` | Mechanism-first sector Q&A |
| `engines/logicQualityValidator.js` | Question fit, concision, anti-headline-lead |
| `engines/intelligenceSynthesis.js` | Dense strategist-grade copy |
| `engines/intelligenceStream.js` | Hooks for future live feed (not streaming yet) |
| `cardSchemas.js` | Dynamic card labels per question type |

## Preview

`?preview=logic&tab=logic`
