# Tranche F — core RI engineering completion report

**Date:** 2026-11-27  
**Handover anchor:** `931d637` (docs) · **Implementation:** `21594bd` (Tranche F) · prior official staging **`67bcb17`** / `dpl_EgqBYMQYmJVMZpKY8er81NzCNDgx`  
**Branch:** `feature/ri-classification-triage` (pushed to origin)

## Executive summary

Tranche F completes the **engineering substrate** for Watchlists, Consultation Tracker, hosted Ask RI baseline harnesses, PDF indexing inventory, and reporting UAT scripts. **Advanced Ask RI** (paid models, deep interpretation, board-pack automation) remains a **separate programme** — see `ASK-RI-DEVELOPMENT-BACKLOG.md`.

PS26/1 grounding was **not reworked** (no new regression evidence).

---

## 1. Watchlists — **IMPLEMENTED** (hosted re-verify after staging deploy)

| Capability | Status |
|---|---|
| Create / edit / enable-disable | Design Lab POST upsert + edit modal (`connected-watchlists.js`) |
| Personal vs organisation scope | RLS + `owner_user_id` on personal rows |
| Filters (regulator, jurisdiction, topic/keyword, pub type, pub IDs, change/obligation IDs) | JSON `filters` on `ri_watchlists` |
| Match history | `GET /api/ri-lab/watchlists/matches` |
| In-app alerts | `WATCHLIST` tenant notifications + `ri_watchlist_matches` |
| Duplicate prevention | Pre-insert check + unique index `ri_watchlist_matches_watchlist_publication_uidx` (staging applied) |
| Staging evaluate (no ingest) | `POST /api/ri-lab/watchlists/evaluate` (blocked on production) |
| Hosted E2E script | `hosted-watchlist-consultation-uat.mjs` |

**Hosted note:** E2E create/evaluate **failed on pre-deploy `67bcb17`** (API/UI not yet live); inbox navigation to publication **passed** using prior alerts.

---

## 2. Consultation Tracker — **IMPLEMENTED**

| Capability | Status |
|---|---|
| List catalogue consultations + tenant overlay | `GET /api/ri-lab/consultations` |
| Edit workflow fields | Design Lab modal → `POST` upsert |
| Regulatory vs internal deadlines | UI labels regulatory close; internal `date` on tracking row |
| Related regulatory changes only | `relatedChangeIds` from tenant `regulatory_changes` linked to publication — **no fabricated PS/instrument links** |
| Audit history | `CONSULTATION_TRACKING_UPDATED` workflow event on POST |

**Hosted:** Tracking modal exercise **PASS** (or skip when zero catalogue consultation rows).

---

## 3. Ask RI hosted baseline — **BASELINE ESTABLISHED**

Script: `hosted-ask-ri-browser-baseline.mjs` (Persona A, `runAs`).

| Check | Result (staging `67bcb17`) |
|---|---|
| UI visible | PASS |
| 13-question matrix | 15/16 PASS (obligations question: deterministic `INSUFFICIENT_EVIDENCE` — harness tightened in `21594bd`) |
| Tenant vs catalogue probes | PASS |
| Paid AI | **Not invoked** (`executionEnabled=false`) |
| Fixture vs live | Most matrix items return `UNRESOLVED` / `INSUFFICIENT_EVIDENCE` (query planner limits) — **not** claimed as full LLM answers |

Evidence: `docs/uat/evidence/ask-ri-browser-baseline-2026-11-27/RESULT.json`

---

## 4. PDF indexing inventory — **EVIDENCED**

Staging read-only SQL (authoritative):

| Metric | Value |
|---|---|
| Total publications | **322** |
| `pdf_primary_v1` revisions | **6** |
| Indexed (`webpageExtraction.status=complete`) | **6** (100% of primary-PDF cohort) |
| Catalogue-wide PDF knowledge coverage | **Low** — Ask RI can use PDF text only for the indexed six; remainder is largely metadata unless further indexing runs |

Artefact: `docs/uat/evidence/pdf-index-coverage-2026-11-27/INVENTORY.json`  
Script (fixed): `pdf-index-coverage-inventory.mjs` (no longer references non-existent `extraction_status` column).

---

## 5. Reports — **PARTIAL**

| Item | Status |
|---|---|
| Executive / exposure / obligations / risk-controls / assurance / remediation / deadlines routes | Hosted browser script `hosted-reports-browser.mjs` |
| Export buttons | Observed where present; accuracy not fully audited |
| Scheduled reports | **NOT IMPLEMENTED / NOT VERIFIED** |
| Board-pack generation | **NOT IMPLEMENTED / NOT VERIFIED** |

---

## 6. Horizon Scanning cron — **PARTIAL (OPEN-001 residual)**

| Item | Evidence |
|---|---|
| Unattended `VERCEL_CRON` **2026-11-27T04:00:24Z** | `vercel-cron-2026-11-27/RESULT.json` |
| `dueCount > 0` + successful connector processing in same tick | **NOT CAPTURED** — metadata on staging events does not persist `dueCount`; latest tick had **zero** due sources |
| Connector coverage | **39/41** operational (unchanged policy) |

---

## 7. Design Lab verification

- Watchlists / Consultations: connected views wired (`#/horizon/watchlists`, `#/horizon/consultations`).
- Nav capability sweep updated with API probes for new routes.
- FORGENIQ visual system preserved (navy/charcoal, gold, collapsible nav).

---

## 8. Regression and deployment

| Gate | Result |
|---|---|
| `orchestrator.mjs --mode=promote` | **55 PASS / 1 FAIL** — `RI-BROWSER-SMOKE` local demo fallback (pre-existing; not Watchlist-specific) |
| Change gate (post-edit) | 5/5 PASS |
| Git push | `931d637` + `21594bd` on `origin/feature/ri-classification-triage` |
| Staging deploy Tranche F | **In progress** at report time (`phase85h-deploy-staging-platform.mjs`) — re-run hosted UAT after promote |

---

## 9. Documentation updates

| Artefact | Action |
|---|---|
| `ASK-RI-DEVELOPMENT-HANDOVER.md` | Update staging SHA after deploy |
| `ASK-RI-DEVELOPMENT-BACKLOG.md` | Advanced programme scoped post-baseline |
| `DEFECT-REGISTER.md` | OPEN-001 residual; OPEN-010 partial |
| `GO-LIVE-CHECKLIST.md` | Watchlists/consultations/baseline items |
| `EXECUTION-LOG.md` | Tranche F entry |

---

## Completed vs advanced Ask RI programme

| Completed (engineering) | Advanced programme (not started) |
|---|---|
| Deterministic Ask RI production path, Stage C caps | Paid model orchestration |
| `pdf_primary_v1` retrieval for indexed publications | Corpus-wide PDF indexing at scale |
| Citation schema foundations (RI-CITE-002) | Regulatory interpretation sign-off |
| Hosted baseline harness + evidence | Cross-tenant AI isolation proof |
| Tenant notifications for watchlists | External notification fan-out |

---

## Known limitations (honest)

- Ask RI answers for broad natural-language questions often return **UNRESOLVED** until query-plan expansion (advanced programme).
- PDF regulatory knowledge: **6/322** publications with complete primary PDF extraction on staging.
- Watchlist obligation/change filters are stored but **publication ingest matching** remains publication-centric (change/obligation hooks = future work).
- Cron evidence lacks **dueCount > 0** operational tick in the Nov 2026 window.