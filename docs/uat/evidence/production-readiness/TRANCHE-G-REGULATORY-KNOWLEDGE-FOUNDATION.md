# Tranche G — Regulatory Knowledge Foundation (in progress)

**Staging baseline:** `bf2511f` (pre–Tranche G code) · **Evidence date:** 2026-11-27

## 1. Catalogue inventory (authoritative staging)

| Metric | Before (Tranche F) | After (2026-11-27 SQL) |
|--------|-------------------:|----------------------:|
| Total publications | 322 | **322** |
| Source snapshots | — | **27** (295 metadata-only / no snapshot) |
| `html_article_v2` complete | — | **15** |
| `pdf_primary_v1` complete | **6** | **6** |
| Searchable (stored normalised text) | 6 (PDF cohort) | **15** |
| Provision-grade indexed | — | **8** |
| Metadata-only / not searchable | ~316 | **307** |

Evidence: `docs/uat/evidence/regulatory-knowledge-foundation-2026-11-27/SUMMARY.json`

**Indexed PDF primary (Ask RI quotation path):** PS26/1, PS22/9, FG22/5, FG24/6, fair value guidance, CP26/38 (IDs in SUMMARY).

## 2. Extraction architecture (deterministic)

- `html_article_v2` — `evidence-capture-v2.mjs` / `create-extraction-revision.mjs`
- `pdf_primary_v1` — `create-primary-pdf-extraction-revision.mjs`
- Controlled batch ingest: `run-batch-b2-staging-ingest.mjs`
- **Gap:** RSS/catalogue ingest does not yet auto-create snapshots + extractions for all 322 rows.

## 3. Horizon → Ask RI pipeline

| Stage | Status |
|-------|--------|
| Regulatory source connectors | 39/41 ingested (existing) |
| Publication discovery | Catalogue 322 rows |
| Document retrieval / snapshot | **27** only |
| Deterministic extraction | **21** revision rows (15 HTML + 6 PDF) |
| Full-text / provision index | Evidence packs + semantic helpers (offline) |
| Ask RI retrieval | Deterministic engine; **limited by indexed corpus** |

Pipeline audit: `PIPELINE-AUDIT.json` (same evidence folder).

## 4. Ask RI retrieval evaluation (deterministic v2.1, offline)

| Outcome | Count (45 cases) |
|---------|----------------:|
| PASS | See `tranche-g-retrieval-eval-2026-11-27/SUMMARY.json` |
| FAIL | Majority — fixture expects ANSWERED; engine returns INSUFFICIENT_EVIDENCE/UNRESOLVED without full catalogue index |
| INSUFFICIENT_EVIDENCE (engine) | Expected for catalogue gaps — **not counted as substantive answers** |

No paid AI; no live Ask RI API in eval harness.

## 5. Engineering (Tranche G slice)

| Item | Status |
|------|--------|
| Full catalogue inventory script | `regulatory-knowledge-foundation-inventory.mjs` |
| Watchlist obligation/change evaluate API | `POST .../watchlists/evaluate` + `watchlists.ts` |
| OPEN-001 | `dueCount>0` on **manual** hosted scheduler (1); unattended 04:00 UTC tick **dueCount=0** — residual |
| Reports hosted verify | Re-run `hosted-reports-browser.mjs` on promote |

## 6. Fable handover

Update `ASK-RI-DEVELOPMENT-HANDOVER.md` — Tranche G section with this inventory and retrieval posture.

## 7. Remaining (coherent next tranche)

1. Deterministic snapshot backfill for eligible catalogue URLs (rate-limited, no paid AI).
2. Post-snapshot auto-`html_article_v2` re-derive queue on staging ingest completion.
3. Expand evidence-pack export for all complete extractions (read-only fixture refresh).
4. Corpus-wide retrieval eval pass/fail only after searchable coverage increases.