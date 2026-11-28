# Ask RI development programme — engineering handover

**Programme status (2026-11-28):** **ON HOLD** — Tranche G2 is the RI baseline; Ask RI deferred to final RI stage. Active engineering priority: **standalone Risk & Controls** (`RISK-CONTROLS-STANDALONE-READINESS-ASSESSMENT.md`). Do not start new RI remediation or corpus loops.

**Date:** 2026-11-27 (Fable handover refresh)  
**Official staging:** `staging-app.forgeniq.com` · **`b3c328e`** / **`dpl_AeGwhGCEfGiyCLfNtnQKNStFvnDQ`** (G2 loop fix + telemetry; includes connector **`fe027e8`**)  
**Corpus backfill (G2):** **62** missing snapshots · **260/322** with snapshots · **232** html_v2 · **6** pdf_v1 · resume plateau exit **2** (evidence `CORPUS-BACKFILL-LOOP-RESUME-2.json`); **277** terminal_excluded — no resume-3 without queue RCA.  
**Loop RCA:** `TRANCHE-G2-LOOP-EXIT-RCA.md` (bogus `remaining <= terminal_excluded` stop — fixed).

## Tranche G2 — corpus population (in progress)

| Layer | Mechanism |
|--------|-----------|
| Execution | Hosted `POST /api/internal/ri-ingestion/corpus-snapshot-tick` (no local `STAGING_DATABASE_URL`) |
| HTML backlog | Fetch canonical URL → snapshot → `html_article_v2` |
| PDF-primary | Attachments from HTML revision + PDF-canonical URLs |
| Failure policy | `provenance.corpusBackfill` terminal after restricted access or 3 transient failures |
| Post-ingest | `queueCorpusBackfillIfNeeded` marks new catalogue rows for hosted priority |
| Batch | `tranche-g-corpus-backfill-loop.mjs` · evidence `CORPUS-BACKFILL-LOOP.json` |
| APIs/MCP | `REGULATORY-API-MCP-STATUS.md` + `EXTERNAL-REGULATORY-KNOWLEDGE-INTEGRATION-MATRIX.json`; `~/.cursor/mcp.json` for four commercial URLs (OAuth for RegAlert/Ansvar); **`CONNECTOR-OPERATIONAL-VERIFICATION-MATRIX.json`** |

**Reports:** `TRANCHE-G2-COMPLETION-REPORT.md`, `CONNECTOR-ACTIVATION-COMPLETION-REPORT.md`, **`TRANCHE-G2-POST-ACCEPTANCE-COMPLETION-REPORT.md`**  
**Not complete (on hold):** corpus backfill (plateau **62**; no resume-3); live eval-pack re-export needs service role in agent env. **OPEN-001 capture script:** completed **2026-11-28T03:55Z** → `open-001-vercel-cron-2026-11-28.json` — **DB rows skipped** (no `STAGING_DATABASE_URL` in that shell); re-run locally with DB URL to close OPEN-001 fully if needed. eCFR first ingest pending scheduler proof.

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

Unattended 04:00 UTC scheduler 2026-11-27: `dueCount=0`. Staging post-eCFR seed: `due=1` (eCFR). Target: **2026-11-28 04:00Z** mass due after nightly rollover + this deploy. Manual hosted MOCI ingest does not close OPEN-001.

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
| Sources | `regulatory_sources` + connector registry | **42** catalogue sources; **40** enabled; **39** with successful ingest |
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