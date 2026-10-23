# RI AI golden-master productionisation map

**Canonical lab:** `ri-design-lab-global-sources` @ `5f95f223`  
**Production:** `apps/platform/lib/ri/ai/*`, `services/ai-analysis.ts`

| Design Lab module | Classification | Production target |
| --- | --- | --- |
| `js/ai/enums.js` | REUSE_BUSINESS_LOGIC | `lib/ri/ai/enums.ts` |
| `js/ai/analysis-service.js` | REUSE_WITH_ADAPTER | `services/ai-analysis.ts` (server + DB) |
| `js/ai/fixture-ai-provider.js` | REUSE_WITH_ADAPTER | `lib/ri/ai/fixture-provider.ts` |
| `js/ai-runtime/fixture-provider.js` | REUSE_WITH_ADAPTER | Same fixture semantics + `lab-compat/ai-fixture-provider.mjs` |
| `js/ai-runtime/external-provider.js` | REPLACE_PROVIDER_BRIDGE | `lib/ri/ai/openai-provider.ts` (optional key) |
| `js/ai/output-validator.js` | PORT_TO_SERVER | `output-schemas.ts` + `citation-validator.ts` |
| `js/ai-governance-views.js` | REUSE_UI | `/ri/ai-governance` |
| `js/ai-operations-views.js` | REUSE_UI | `/ri/ai-operations` |
| `js/ai-governance-seed.js` | REUSE_SCHEMA_CONCEPT | `use-case-catalog.ts` + `ai_use_cases` seed migration |
| `js/ai/ai-ri-qa` (Ask RI) | DEFER_TO_ASK_RI | Not productionised in 7C.6 |
| Browser `local-ai-bridge` | TEST_ONLY | Removed — server-only providers |
| `acceptance-ri-ai-5*.mjs` | TEST_ONLY | Lab regression (unchanged) |
| `acceptance-production-ai-master.mjs` | TEST_ONLY | Lab runtime verification |

## Flow

Official publication version → fixture/OpenAI provider → structured output → citation validation → human review → optional RI record lineage (`AI_ASSISTED` metadata on workflow events).

## Safety

- `lib/ri/ai/autonomy.ts` blocks autonomous approval mutations.
- Applicability human decision remains separate from AI recommendation.
- No Design Lab runtime imports under `app/ri`.
