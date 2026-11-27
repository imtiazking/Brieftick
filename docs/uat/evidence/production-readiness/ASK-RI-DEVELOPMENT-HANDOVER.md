# Ask RI development programme — engineering handover

**Date:** 2026-11-27  
**Official staging:** `staging-app.forgeniq.com` · **`dpl_644WDsZPXcMXKPB9Q2WzS3GuuGsg`** · git **`8c58e2e`**  
**Rollback:** `dpl_95TSoASLLpqQSwpkb1r8sJZy97xk` (prior official)

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

## Retrieval & Ask RI limitations

- Catalogue answers: Stage C caps (`PARTIAL_ANSWER` when human review pending).
- Live AI: `executionEnabled=false`; fixture stages for UAT.
- CBUAE: no connector. OFAC-SDN: disabled by policy.
- Seven legacy + one partner DISCONNECTED obligations preserved.

## Evidence index

- Lineage: `regulatory-lineage-2026-11-27/RESULT.json`
- Cron: `vercel-cron-2026-11-27/RESULT.json`
- Ops: `operational-readiness-2026-11-27/RESULT.json`, `load-baseline-2026-11-27/`
- Promote gate: 52/52 on `8c58e2e` deploy path