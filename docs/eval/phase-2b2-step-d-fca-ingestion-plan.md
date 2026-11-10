# Phase 2B.2 Step D — FCA staging ingestion plan (30–50 publications)

**Status:** PLAN ONLY — no ingestion executed, no DB writes, no extraction revisions created.

**Pipeline reuse:** `ri-ingest.mjs` → `ingest-engine.mjs` → snapshots → `create-extraction-revision.mjs` / `create-primary-pdf-extraction-revision.mjs` → private Storage → `regulatory_source_extraction_revisions` (append-only).

---

## 1. Current pipeline capabilities

| Stage | Mechanism | Integrity |
|-------|-----------|-----------|
| Discovery | `SRC-FCA-PUBLICATIONS-RSS` + controlled `--only-url` | RSS canonical URLs, allowlisted hosts |
| HTML substantive extract | `html_article_v2` | `fingerprintContentV2`, storage paths, SHA-256 |
| Primary PDF extract | `pdf_primary_v1` | `regulatory-pdf-allowlist.mjs`, page-level blocks, `pageBoundaryConfirmed` |
| Publication row | `regulatory_publications` | `canonical_url`, `source_hash`, `external_document_id` |
| Revisions | Append-only INSERT | No UPDATE of verified revisions (FG22/CP26 guards) |
| Scheduling | Vercel cron → `/api/internal/ri-ingestion/scheduler-tick` | `ingestion_runs` metrics, retry via ops executor |
| Failure surface | `ingestion_runs.status`, per-document errors | Roll forward; no silent overwrite |

**Handbook:** Handbook PDF/HTML ingest is **not** validated on staging today — plan excludes COBS/PRIN primary sources until a dedicated Handbook profile exists (Ask RI eval uses abstention for handbook refs).

---

## 2. Coverage today (staging snapshot 2026-11-10)

| Metric | Value |
|--------|------:|
| FCA `regulatory_publications` rows (fca.org.uk canonical) in domain search | 16 |
| With `regulatory_source_extraction_revisions` | 3 |
| Full PDF+HTML | FG22/5, CP26/38 |
| HTML only | Fair value in consumer finance |

See `phase-2b2-step-d-staging-fca-catalogue-snapshot.json` for IDs and URLs.

---

## 3. Target catalogue (30–50 genuine FCA publications)

### Tier 1 — Verified staging rows (16 publications, official URLs in snapshot)

All URLs taken from staging `canonical_url` (operator may HEAD-verify before ingest).

| Ref (parsed from title) | Title (short) | URL (staging) | Type | Domain | In FORGENIQ | Extraction | Proposed method |
|-------------------------|---------------|---------------|------|--------|---------------|------------|-------------------|
| FG22/5 | Consumer Duty finalised guidance | `…/fg22-5.pdf` | Finalised guidance | Consumer Duty / fair value | Yes | **Complete** | Maintain only |
| — | Fair value in consumer finance | `…/fair-value-consumer-finance` | Supervisory examples | Fair value | Yes | html_v2 | Maintain |
| CP26/38 | Financial Crime Guide updates | `…/cp26-38-…` | Consultation | Financial crime | Yes | html+pdf | Maintain |
| — | Flood risk mortgages (data) | `…/flood-risk-exposure-mortgages-england` | Data | Risk / mortgages | Catalogue | None | `html_article_v2` |
| — | Access to cash 2025 H1 | `…/access-cash-coverage-uk-2025-h1` | Data | Conduct | Catalogue | None | `html_article_v2` |
| — | Access to cash 2024 H2 | `…/access-cash-coverage-uk-2024-h2` | Data | Conduct | Catalogue | None | `html_article_v2` |
| — | Conflicts / private markets MFR | `…/conflicts-interest-fair-customer-treatment-private-markets` | Multi-firm review | Conduct / fair value | Catalogue | None | `html_article_v2` |
| CP26/39 | Consolidated tape / incidents | `…/cp26-39-…` | Consultation | Ops / market infra | Catalogue | None | html + pdf if linked |
| — | Defence SMEs banking | `…/defence-smes-access-banking-services` | Multi-firm review | Access / SME | Catalogue | None | `html_article_v2` |
| — | Wholesale banks insights | `…/wholesale-banks-supervision-insights-3-autumn-2026` | Supervisory | Governance | Catalogue | None | `html_article_v2` |
| PS26/21 | EMIR intragroup | `…/ps26-21-…` | Policy statement | Operational / markets | Catalogue | None | html + pdf |
| DP26/2 | Guided retirement | `…/dp26-2-guided-retirement` | Discussion paper | Consumer | Catalogue | None | html + pdf |
| DP26/1 | Credit unions regime | `…/dp26-1-…` | Discussion paper | Prudential | Catalogue | None | html + pdf |
| GC26/8 | Primary market bulletin | `…/gc26-8-…` | Guidance consultation | Primary markets | Catalogue | None | `html_article_v2` |
| — | Primary market bulletin 67 | `…/primary-market-bulletin-67` | Newsletter | Markets | Catalogue | None | `html_article_v2` |
| — | SM&CR at FCA | `…/senior-management-responsibilities-at-fca` | Corporate | Governance | Catalogue | None | `html_article_v2` |

**Tier 1 ingest goal:** 13 new extractions (+ 3 already complete) = **16 authentic publications**.

### Tier 2 — RSS backfill to 30–50 (URLs assigned at ingest time, not pre-invented)

Use existing `SRC-FCA-PUBLICATIONS-RSS` with `maxItems` batches and **keyword filters** on title/description after normalisation. Operator approves each batch manifest before extraction.

**Priority domain keywords (for RSS selection, not URL invention):**

1. Consumer Duty, PRIN 2A cross-references in non-Handbook guidance  
2. Fair value, price and value  
3. Financial Crime Guide, AML, SAR, financial crime systems  
4. Sanctions, proliferation financing  
5. Fraud, scam, authorised push payment  
6. Operational resilience, important business services  
7. Outsourcing, third-party risk, critical third parties  
8. Consultation / policy statement pairs (e.g. CP→PS same topic)  
9. Supervisory communications, Dear CEO, multi-firm reviews  
10. Finalised guidance FG*, discussion papers DP* creating ambiguity with CP/PS  

**Target:** 14–34 additional publications (total **30–50**) once RSS harvest confirms canonical `fca.org.uk` URLs and publication type.

**Deduplication:** Match on `canonical_url`, `external_document_id`, and `source_hash`; never create a second revision for unchanged bytes (append new revision only on hash change).

**Version handling:** New `regulatory_publications.source_version` + new extraction revision; prior revisions remain addressable for citations.

---

## 4. Recommended ingestion sequence

| Batch | Size | Content | Rationale |
|-------|-----:|---------|-----------|
| B0 | 3 | Already extracted (smoke + re-export eval packs) | Baseline integrity |
| B1 | 5 | Consumer Duty / fair value Tier-1 rows without revisions | Highest Ask RI eval overlap |
| B2 | 5 | Financial crime adjacent (CP26/39, wholesale insights, conflicts MFR) | Distractors for crime questions |
| B3 | 5 | PS/DP consultations (PS26/21, DP26/*) | Status ambiguity CP vs PS |
| B4 | 5 | Data / supervisory / newsletters | Lexical overlap, non-binding status |
| B5–B8 | 4×5 | RSS-filtered Tier-2 | Reach 30–50 without synthetic text |

Run **html_article_v2** first per URL; enqueue **pdf_primary_v1** only when allowlisted primary PDF is discovered on-page (`create-primary-pdf-extraction-revision.mjs`).

---

## 5. Estimates (order-of-magnitude)

| Resource | Estimate |
|----------|----------|
| Storage per HTML revision | 0.5–2 MB normalised artefacts + raw snapshot |
| Storage per PDF primary | 2–15 MB PDF + derived JSON/text |
| **30 pubs mixed** | ~150–400 MB private Storage (staging) |
| Extraction runtime | ~2–8 min/pub (HTML+PDF sequential, local/staging worker) |
| **Batch of 5** | ~15–40 min wall clock (serial controlled ingest) |
| Embeddings (future, not in Step D) | ~300–2k chunks × 384-dim — defer until Edge/local parity proven |

**Integrity checks per publication:** snapshot SHA, revision SHA match, page boundary flag, block count > 0, quality tier, compare `contentSha256` to eval pack export.

**Failure / retry:** Failed runs stay in `ingestion_runs`; retry with same `only-url`; no revision overwrite.

**Rollback:** Disable publication from Ask RI index; retain revisions (append-only). Delete index vectors only after operator sign-off (future pgvector phase).

---

## 6. Post-ingestion retrieval evaluation (Step E preview)

- Corpus: **only** publications with `regulatory_source_extraction_revisions` and verified SHA.  
- Metrics: Recall@1/@5, passage substance, page accuracy, explicit-ref integrity, abstention rate, latency — same probes as Step C **plus** expanded competition.  
- **Exclude** supplemental-corpus-2b2 fixture packs permanently.  
- Do **not** claim Ask RI answer PASS from retrieval metrics alone (Phase 2A boundary unchanged).  
- No private held-out suite access.

---

## 7. Approval gate

Operator sign-off required before:

1. First Tier-1 controlled extraction (13 pubs).  
2. RSS Tier-2 batch manifests.  
3. Any embedding/index generation.
