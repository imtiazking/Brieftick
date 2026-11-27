# Ask RI development programme — engineering handover

**Date:** 2026-11-27  
**Official staging (navigation + Tranche F):** `staging-app.forgeniq.com` · **`dpl_3BpCCT8nB4bUeqQPjxVFjtxR3Vsp`** · git **`bf2511f`**  
**Tranche G (in progress):** Regulatory knowledge foundation — inventory, pipeline audit, watchlist entity evaluate, deterministic retrieval eval (see below).

## Tranche G — regulatory knowledge foundation (Fable)

### Catalogue coverage (staging SQL 2026-11-27)

| Metric | Value |
|--------|------:|
| Total catalogue publications | **322** |
| With `regulatory_source_snapshots` | **27** |
| No snapshot (metadata path) | **295** |
| `html_article_v2` complete | **15** |
| `pdf_primary_v1` complete | **6** |
| Searchable (normalised text stored) | **15** |
| Provision-grade (`obligationGradeSuitable`) | **8** |
| Metadata-only for Ask RI substance | **~307** |

**Before (Tranche F inventory):** 322 pubs; **6** PDF primary complete.  
**After:** HTML indexed cohort **+15**; searchable total **15** (overlap HTML/PDF on some FCA rows).

### Searchable PDF-primary catalogue (quotation path)

PS26/1 · PS22/9 · FG22/5 · FG24/6 · Fair value vulnerable customers · CP26/38 — IDs in `docs/uat/evidence/regulatory-knowledge-foundation-2026-11-27/SUMMARY.json`.

### Extraction & indexing

- Deterministic: `html_article_v2`, `pdf_primary_v1`, storage-backed normalised text, evidence-pack full-text helpers (`evidence-pack-full-text.mjs`).
- **Not yet universal:** ingest creates catalogue rows for ~322 pubs; only **27** have snapshots; automatic post-ingest extraction queue still partial (`PIPELINE-AUDIT.json`).

### Ask RI retrieval evaluation

- Offline: `tranche-g-ask-ri-retrieval-eval.mjs` → `docs/uat/evidence/tranche-g-retrieval-eval-2026-11-27/`.
- **Do not treat `INSUFFICIENT_EVIDENCE` as successful regulatory answers** — correct abstention when index missing.
- Deterministic v2.1 suite mostly **FAIL vs ideal ANSWERED** until corpus-wide indexing catches up (expected).

### Horizon pipeline

`Source → ingest → publication → [snapshot gap] → extraction → evidence pack → Ask RI` — bottleneck is **snapshot + deterministic extract** on ~295 rows.

### Watchlists (Tranche G)

`POST /api/ri-lab/watchlists/evaluate` accepts `obligationId` or `regulatoryChangeId` for filtered watchlists (not only publications).

### OPEN-001 residual

Unattended 04:00 UTC scheduler: `dueCount=0`. Manual hosted ticks: `dueCount=1` recorded — still no single unattended tick with due>0 **and** successful connector batch in same artefact.

### Remaining architectural weaknesses for Fable

1. **Corpus gap:** 95% of catalogue is metadata-only for full-text Ask RI.  
2. **No paid embeddings/LLM** on staging — deterministic planner + indexed blocks only.  
3. **Tenant vs catalogue fusion** limited to fixtures + live DB reads.  
4. **Automatic extraction** after RSS ingest not end-to-end for all regulators.  
5. **Citation completeness** scales only with indexed publication count.

### Evidence

`regulatory-knowledge-foundation-2026-11-27/` · `TRANCHE-G-REGULATORY-KNOWLEDGE-FOUNDATION.md` · `tranche-g-retrieval-eval-2026-11-27/`

## Regulatory data architecture (verified)

| Layer | Store / API | Scope |
|---|---|---|
| Sources | `regulatory_sources` + connector registry | 41 catalogue sources; 39 current ingest |
| Ingestion | `ingestion_runs`, `ingestion_operational_events` | Global; provenance on `regulatory_publications.provenance` |
| Catalogue | `regulatory_publications`, versions | Global read via `/api/ri-lab/publications` |
| Horizon / feed | Same catalogue + Design Lab views | UI: `#/feed`, `#/horizon`, `#/library` |
| Tenant overlay | `organisation_publications`, applicability | Per org |
| Regulatory change | `regulatory_changes` | **Per tenant — optional**; not auto-created on every ingest |
| Trace API | `GET /api/ri-lab/publications/:id` → `regulatoryTrace` | Ingestion run + `linkage: NONE \| TENANT_CHANGE` |
| Triage | `/api/ri-lab/triage`, findings registers | Tenant scoped |
| Compliance lifecycle | obligations → impacts → risks → controls → assurance | Maker-checker; atomic Stage 2 RPC |

**MOCI example (ingest without change):** publication `0a88c11f…` → run `4cac5a4c…` → **no** `regulatory_changes` row (expected).  
**FCA PS26/1 example (linked change):** publication `829c5472…` → change `cb1e415a…`.

## Resolved engineering (this tranche)

| ID | Resolution |
|---|---|
| ENG-LINEAGE-001 | `regulatoryTrace` on publication detail; UAT distinguishes NONE vs TENANT_CHANGE |
| ENG-CRON-001 | Unattended `VERCEL_CRON` **2026-11-27T04:00:24Z** (`vercel-cron-2026-11-27/RESULT.json`) |
| ENG-A11Y-001 | Badge `title` contract + connected feed status chips; static acceptance PASS |
| ENG-OPS-002 | `hosted-load-baseline.mjs` parallel reads PASS |
| OPEN-007 | RPC `approve_obligation_with_stage2` reviewer pin on staging (verified) |

## Remaining engineering

| ID | Item |
|---|---|
| ENG-OPS-001 | Isolated **restore** drill not run (Supabase PITR posture only — no destructive restore) |
| OPEN-009 | DEF-011 intermittent assurance load (monitor only) |

## External / programme blockers (not engineering)

Regulatory expert sign-off · cross-tenant harness (org B / users D–E) · classification policy approvals · paid AI · production deploy · pen-test procurement · business UAT sign-off · billing/onboarding.

## Hosted Ask RI baseline (Tranche F)

- Harness: `apps/platform/scripts/uat/hosted-ask-ri-browser-baseline.mjs` (Persona A, no paid AI).
- Evidence: `docs/uat/evidence/ask-ri-browser-baseline-2026-11-27/RESULT.json`.
- Verified: HTTP 200 + deterministic statuses (`ANSWERED`, `PARTIAL_ANSWER`, `INSUFFICIENT_EVIDENCE`, `UNRESOLVED`, `UNSUPPORTED`); publication-titled PS26/1 probe; tenant vs catalogue probes.
- **Not verified as full LLM coverage:** most matrix questions hit planner limits on staging without paid execution.
- PDF answers: only where `pdf_primary_v1` + `webpageExtraction.status=complete` (staging inventory: **6** publications — see `pdf-index-coverage-2026-11-27/INVENTORY.json`).

## Retrieval & Ask RI limitations

- Catalogue answers: Stage C caps (`PARTIAL_ANSWER` when human review pending).
- Live AI: `executionEnabled=false`; fixture stages for UAT.
- CBUAE: no connector. OFAC-SDN: disabled by policy.
- Seven legacy + one partner DISCONNECTED obligations preserved.

## Evidence index

- Lineage: `regulatory-lineage-2026-11-27/RESULT.json`
- Cron: `vercel-cron-2026-11-27/RESULT.json`
- Ops: `operational-readiness-2026-11-27/RESULT.json`, `load-baseline-2026-11-27/`
- Tranche E deploy: auth smoke 19/19 candidate + official (`67bcb17`); pre-promote gate on prior tranche 52/52 at `8c58e2e`