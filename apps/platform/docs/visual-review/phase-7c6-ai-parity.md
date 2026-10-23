# Phase 7C.6 — AI production parity

| Area | Design Lab | Production |
|------|------------|------------|
| AI Governance | `#/ai-governance` | `/ri/ai-governance` |
| AI Operations | `#/ai-operations` | `/ri/ai-operations` |
| Publication AI | publication AI panel | `/ri/publications/[id]#ai` |
| Human review | `#/ai-analysis/*` | `/ri/ai`, `/ri/ai/[runId]` |

**Intentional differences:** Clerk identity; real execution rows in Postgres when migrated; OpenAI only when `OPENAI_API_KEY` set (otherwise fixture + “not configured” messaging).

**Harness:** `scripts/acceptance-phase-7c6-golden-master.mjs` (fixture provider fingerprint vs lab `ai-runtime`).
