# RI AI (Design Lab) — Enhancement 5A

## Local development

| Setting | Value (inspected) |
|--------|-------------------|
| **LOCAL RI ORIGIN** | `http://localhost:3000` (repo root `package.json`: `serve -l 3000 .`) |
| **RI app URL** | `http://localhost:3000/design-lab/regulatory-intelligence/` |
| **LOCAL AI BRIDGE ORIGIN** | `http://127.0.0.1:3765` (`RI_AI_BRIDGE_PORT`, default `3765`) |

`RI_ALLOWED_ORIGINS` defaults to `http://localhost:3000` only when unset.

## Bridge location (development only)

Implementation: `%LOCALAPPDATA%\forgeniq-ri\ri-ai-bridge` (override with `RI_AI_BRIDGE_HOME`).

- Outside the BriefTick repo and outside OneDrive-synced project paths.
- Not retrievable via the static dev server (`GET /tools/ri-ai-bridge/...` must not return bridge source).
- Not part of the RI SPA module graph; Design Lab talks to the bridge only at `http://127.0.0.1:<port>`.
- No `vercel.json` rewrite to `/analyze`; no `api/` serverless handler.
- Set `FORGENIQ_REPO_ROOT` to the repo root when starting the bridge (`run-bridge.mjs`).

Client-safe shared modules: `js/ai/` (enums, context builder, validator, fixture provider) and `js/ai-bridge/ai-analysis-contract.js` (re-export shim).

## Schema v17 — Intelligence Assistant (Enhancement 5C)

- **RI schema:** `17` — Ask RI, deterministic `ri-retrieval.js`, insufficient-evidence short circuit (no provider call), text comparison (`text-diff.js` + AI interpretation), implementation mapping, management/board summaries (`intelligence-ai-service.js`), `riAskHistory`.
- **Task types:** `AI_RI_QA`, `AI_TEXT_COMPARISON`, `AI_IMPLEMENTATION_MAPPING`, `AI_EXECUTIVE_SUMMARY`.
- **Prompt metadata (client-safe):** `RI_ASK_V1`, `RI_TEXT_COMPARISON_V1`, `RI_IMPLEMENTATION_MAPPING_V1`, `RI_EXECUTIVE_SUMMARY_V1`.
- **UI:** `#/ask-ri` — evidence-used panel, fixture/live badges, board summary human review.
- **Acceptance:** `acceptance-ri-ai-5c.mjs`, `acceptance-ri-ai-5c-browser.mjs` (AI-005–007, AI-006B, AI-019–024).

```bash
node design-lab/regulatory-intelligence/scripts/acceptance-ri-ai-5c.mjs
node design-lab/regulatory-intelligence/scripts/acceptance-ri-ai-5c-browser.mjs
```

**Bridge fingerprint (5C):** allowlist `ACTIVE_TASK_TYPES_V17` in `%LOCALAPPDATA%\forgeniq-ri\ri-ai-bridge` (`analyze-handler.js`).

## Schema v16 — Compliance Workflow AI (Enhancement 5B)

- **RI schema:** `16` — extends v15 with workflow AI task types, `riAiWorkflowTraces`, and prompt metadata `RI_CHANGE_ANALYSIS_V1`, `RI_IMPACT_ASSESSMENT_V1`, `RI_OBLIGATION_SUGGESTION_V1`, `RI_POLICY_IMPACT_V1`, `RI_RISK_CONTROL_IMPACT_V1`.
- **Workflow principle:** AI analyses and suggests; humans review, edit, and create **draft** lifecycle records only (`Change` → `New`, `Impact Assessment` → `Draft`, `Obligation` → `Draft`). No auto-approval, no cascade to IA/Obligation/Policy/Risk/Control.
- **Services:** `workflow-ai-service.js`, `workflow-output-validator.js`, `fixture-scenarios-5b.js`, UI `ai-workflow-ui.js` on publication / change / assessment routes.
- **Personas:** Analyst and Compliance Manager may generate and create drafts; **Auditor** read-only (`AI-016`).
- **Acceptance:** `acceptance-ri-ai-5b.mjs` (AI-002–004, AI-014–018); browser `acceptance-ri-ai-5b-browser.mjs`.

```bash
node design-lab/regulatory-intelligence/scripts/acceptance-ri-ai-5b.mjs
node design-lab/regulatory-intelligence/scripts/acceptance-ri-ai-5b-browser.mjs
```

## Schema v15 — AI domain foundation

- **RI schema:** `15` (`riAiAnalysisResults`, `aiDomainAuditEvents`, `aiPromptCatalog`).
- **State dimensions:** `status` (REQUESTED/COMPLETED/FAILED/VALIDATION_FAILED), `reviewStatus`, `freshness` (CURRENT/OUTDATED).
- **FixtureAiProvider** (`providerMode = FIXTURE`) — deterministic `AI_SUMMARY` scenarios including AI-001, AI-008, AI-009.
- **AiContextBuilder** — bounded OFFICIAL_SOURCE + RI_RECORD context with deterministic `contextHash`.
- **AiOutputValidator** — citations, excerpts (≥20 chars), HTTPS official URLs, supported dates, XSS-safe text checks.
- **evidenceConfidence** — deterministic HIGH/MEDIUM/LOW (separate from `modelReportedConfidence`).
- **Retention** — max 50 analyses, 40 KB each, 2.5 MB total; protected ACCEPTED/PARTIALLY_ACCEPTED.
- **OpenAiResponsesProvider** — interface seam only (no network in this chunk).

```bash
node design-lab/regulatory-intelligence/scripts/acceptance-ri-ai-5a-foundation.mjs
```

## Public asset scan scope (acceptance 56E)

Acceptance scans **all files in the transitive RI browser asset graph** rooted at `design-lab/regulatory-intelligence/index.html` (ES modules + linked CSS/JS). That is what the RI app loads in the browser — not arbitrary repo paths.

Required:

- `SERVER PROMPT MARKER FOUND IN PUBLIC ASSETS: NO` (RI module graph only)
- `BRIDGE STATICALLY RETRIEVABLE: NO` (HTTP probes against static dev origin)
- `SERVER PROMPT FILE STATICALLY RETRIEVABLE: NO`
- `BRIDGE IN CLIENT BUNDLE: NO`
- `BRIDGE EXPOSED AS VERCEL FUNCTION: NO`

## Policy summary (5A clarifications)

- `AiAnalysisResult.status`: `REQUESTED`, `COMPLETED`, `FAILED`, `VALIDATION_FAILED` only.
- Failure detail via `errorCode` (`TIMEOUT`, `CONTEXT_HASH_MISMATCH`, `UNSAFE_AI_CACHE_PATH`, etc.) — not extra status values.
- `POST /analyze`: allowlisted `Origin` only; no wildcard CORS; `OPTIONS` uses the same allowlist.
- `RI_AI_CACHE_DIR`: canonicalised; rejects OneDrive, repo, and Design Lab tree; if unset/unsafe, disk cache **disabled** without fabricating an analysis record for config-only failures.
- Server-only prompt marker: `FORGENIQ_RI_SERVER_PROMPT_ONLY_RI_AI_BRIDGE_5A` (distinct from AI-009 canary).

```bash
node design-lab/regulatory-intelligence/scripts/acceptance-ri-ai-5a.mjs
node design-lab/regulatory-intelligence/scripts/verify-ri-live-ai.mjs
```

## Enhancement 5A complete (Design Lab)

- **OpenAI Responses provider** (`OpenAiResponsesProvider`): `store: false`, strict JSON schema, configured `RI_AI_MODEL` (no fallback), max one retry on transient errors.
- **Local bridge** (`%LOCALAPPDATA%\\forgeniq-ri\\ri-ai-bridge`): `GET /health`, `POST /analyze`, `OPTIONS /analyze`; Origin allowlist `http://localhost:3000`; double `contextHash` validation; bridge output validation; optional disk cache via `RI_AI_CACHE_DIR`.
- **Browser**: `LocalAiBridgeClient`, publication **AI Summary** panel (fixture + optional live), citations, review accept/reject, history, freshness; **Admin → AI** at `#/admin/ai`.
- **Tests**: AI-001–010 (foundation), **AI-011** mock transport, **AI-012** bridge trust boundary, **AI-013** personas. Acceptance mock uses `RI_AI_BRIDGE_MOCK_OPENAI=1` (acceptance only, not production).
- **Live verification**: `verify-ri-live-ai.mjs` reports `NOT CONFIGURED` when `OPENAI_API_KEY` or `RI_AI_MODEL` is absent.
- **Production handoff**: OpenAI live, vector search, and production deployment remain out of scope for Design Lab.

## Obligation portfolio taxonomy (Ask RI & UI)

Implementation: `js/ai/obligation-portfolio.js`. Counts are always computed from hydrated RI records — never hard-coded.

### Primary buckets (mutually exclusive)

| Bucket | Meaning | Status labels (case-insensitive) |
|--------|---------|----------------------------------|
| **DRAFT** | Proposed / AI-suggested / awaiting human confirmation | `Draft` |
| **ACTIVE** | Confirmed obligation still requiring implementation work | `Open`, `In Progress`, `Overdue` |
| **REVIEW** | Confirmed obligation under governance or implementation review | `In Review` |
| **CLOSED** | Terminal | `Complete`, `Historic`, `Closed` |
| **UNCLASSIFIED** | Unknown labels until mapped | (everything else) |

### Secondary flag

- **`overdueActive`** — subset of **ACTIVE** with status `Overdue` (not a separate primary bucket; not double-counted in reconciliation).

### User-facing labels (must not be mixed)

- **“Open obligations”** — **ACTIVE** only. Used for Ask RI *“How many open obligations are there?”*, dashboard metric, obligations register row labelled “Open obligations”, and deterministic fact `openObligationCount`.
- **“Active + in-review obligations”** — **ACTIVE ∪ REVIEW**. Used for landscape sector stats, sector overview samples, and graph/compound copy when reporting linked obligation counts (`obligationStatusIsOpenForLinkedWork`).

**In Review** is never included in **“Open obligations”**.

### Ask RI behaviour

- Count question → `openObligationCount` = ACTIVE count; also exposes `draftObligationCount`, `reviewObligationCount`, `overdueActiveCount`, and full `obligationPortfolio` on deterministic facts.
- Compound / graph queries that ask which obligations “remain open” or linked open **work** use ACTIVE ∪ REVIEW for traversal filters, but user-visible copy must say **active + in-review**, not “open”, unless the question is strictly the ACTIVE count.

### Closed / unclassified

- **CLOSED** obligations are excluded from open and linked-work counts.
- **UNCLASSIFIED** statuses are surfaced in `unclassifiedObligationStatuses` for review; they are not treated as open or closed until mapped.
