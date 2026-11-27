# Ask RI development programme — engineering handover

**Date:** 2026-11-27  
**Official staging (pre–Tranche F deploy):** `staging-app.forgeniq.com` · **`dpl_EgqBYMQYmJVMZpKY8er81NzCNDgx`** · git **`67bcb17`** (Tranche E)  
**Tranche F implementation commit:** **`21594bd`** (watchlists/consultations completion, Ask RI baseline harnesses, PDF inventory artefact) — promote after candidate verification.  
**Rollback:** `dpl_644WDsZPXcMXKPB9Q2WzS3GuuGsg` (`8c58e2e`, Tranche D)

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