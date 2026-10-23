# RI Ask RI — Golden Master Productionisation (Phase 7C.7)

Design Lab canonical: `design-lab/regulatory-intelligence-global-sources` @ `ri-design-lab-global-sources`.

## Migration map

| Design Lab module | Decision | Production location |
|-------------------|----------|---------------------|
| `js/ai/ri-retrieval.js` | REUSE_AS_IS (ported) | `lib/ri/ask-ri/port/ai/ri-retrieval.js` |
| `js/ai/ri-query-executor.js` | REUSE_AS_IS | `lib/ri/ask-ri/port/ai/ri-query-executor.js` |
| `js/ai/ri-graph-plan.js` | REUSE_AS_IS | `lib/ri/ask-ri/port/ai/` |
| `js/ai/ri-entity-catalog.js` | REUSE_AS_IS | port |
| `js/ai/ri-canonical-links.js` | REUSE_AS_IS | port |
| `js/ai/obligation-attribution.js` | REUSE_AS_IS | port |
| `js/ai/ri-interpreted-as.js` | REUSE_AS_IS | port |
| `js/landscape-helpers.js` | REUSE_AS_IS | `lib/ri/ask-ri/port/` |
| `js/ai/intelligence-ai-service.js` (fixture AI wording) | REPLACE_PROVIDER_BRIDGE | Deterministic answer in `run-ask-ri.mjs`; optional OpenAI wording deferred |
| Design Lab store / migrate | REPLACE_FIXTURE_DATA | `production-state.mjs` + Supabase |
| Ask RI UI (`ask-ri-ui.js`) | REUSE_UI concepts | `app/ri/ask` + `ask-ri-panel.tsx` |

## Architecture

QUESTION → `parseAskQuery` → `retrieveRiRecords` (deterministic) → production response (+ audit log).

No runtime import of `design-lab/` from `app/ri`. Ported modules live under `lib/ri/ask-ri/port/`.

## Parity

Golden-master eval: Design Lab `acceptance-ask-ri-eval.mjs` (unchanged).

Production: `acceptance-phase-7c7-golden-master.mjs` compares lab vs port retrieval on hydrated lab state + local DB scenarios.
