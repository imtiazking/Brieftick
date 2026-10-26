# Phase 8C.1 — Regulatory source snapshot foundation (RFC)

**Status:** Implementation-ready design (not applied to infrastructure)  
**Branch:** `production/ri-golden-master`  
**App:** `apps/platform`  
**Staging:** `forgeniq-ri-staging` (`lhgzdicffkhaaykzthep`)

---

## 1. Final technical architecture

### 1.1 Goals

- Preserve **exact bytes** and **normalised derivatives** retrieved at ingestion time.
- Enable **version-to-version** comparison without inferring regulatory change from fingerprint alone.
- **Additive** to Phase 8B: `source_hash`, duplicate detection, and version semantics unchanged.

### 1.2 Artefacts per capture (FCA HTML v1 scope)

| Artefact | Purpose | Typical size |
|----------|---------|--------------|
| **Raw document** | Evidence of HTTP response body as retrieved | 50 KB–2 MB |
| **Normalised article HTML** | Same input family as `html_article_v1` fingerprint | ~20–80 KB |
| **Normalised regulatory text** | Plain text from article region for diff/AI | ~5–50 KB |
| **Metadata sidecar (JSON)** | Retrieval context, HTTP metadata, licence notice, hash manifest | &lt; 4 KB |

### 1.3 Hash and fingerprint roles (see §7)

| Identifier | Algorithm | Input bytes |
|------------|-----------|-------------|
| **Source fingerprint** (`source_hash`) | SHA-256 | `normaliseHtmlForFingerprint(rawHtmlUtf8)` — existing `html_article_v1` |
| **Raw integrity** | SHA-256 | Raw response body bytes (as stored) |
| **Normalised HTML integrity** | SHA-256 | UTF-8 of normalised article HTML string |
| **Normalised text integrity** | SHA-256 | UTF-8 of plain text from article region |

**Invariant:** `source_hash === SHA-256(normalised_article_html)` for `fingerprint_normalisation = html_article_v1`.

### 1.4 PostgreSQL vs Supabase Storage

- **Postgres:** `regulatory_source_snapshots` — one row per `regulatory_publication_versions` row (unique), insert-only, RLS platform-operator read.
- **Storage bucket:** `regulatory-source-snapshots` — private, content-addressed object keys, service-role writes.

### 1.5 Publication-version relationship

```
regulatory_publications (1) ──< regulatory_publication_versions (N)
                                      │
                                      │ 1:1 (when snapshot exists)
                                      ▼
                              regulatory_source_snapshots
```

- Snapshot created only on ingest paths **`NEW`** and **`UPDATED`** (new version row).
- **`UNCHANGED`** (hash match): no snapshot write.

### 1.6 Ingestion-run provenance

Each snapshot stores:

- `ingestion_run_id` (FK)
- Optional `ingestion_item_id` (FK, when item row exists)
- `canonical_url` at retrieval
- `retrieved_at` (from document)
- `provenance` JSONB: connector id, regulator/source external keys, `finalUrl`, content-type, byte sizes, **no raw body**

### 1.7 Access controls

| Actor | Postgres snapshots | Storage objects |
|-------|-------------------|-----------------|
| Ingestion worker (service role) | INSERT | INSERT (upload) |
| Platform operator (JWT + `platform_operators`) | SELECT | SELECT (signed URL or server-side proxy) |
| Authenticated tenant users | **Deny** | **Deny** |
| Anonymous | **Deny** | **Deny** |

### 1.8 Retention and audit

- **Application immutability:** no UPDATE/DELETE on `regulatory_source_snapshots`; new source version → new snapshot only.
- **Storage-level immutability:** optional Object Lock / bucket versioning in production (ops); not required for 8C.1 code path.
- **Retention:** hot indefinite for catalogue; lifecycle rules (e.g. archive after 7y) via Supabase/Ops — documented, not automated in 8C.1.
- **Audit:** link `snapshot_id` in version `provenance.snapshotId`; `ingestion_operational_events` on snapshot failures.
- **Licensing:** `licence_notice` field — internal provenance only; no public redistribution of FCA HTML.

### 1.9 Phase 8B FCA publications

- Five pilot rows: **`snapshot_status = unavailable`** (no row) until a **future** ingest creates a new version.
- **No backfill** posing as ingest-time evidence.
- Defence SMEs hash drift and metadata disclosure **unchanged**.

---

## 2. Snapshot persistence sequence (non-atomic cross-store)

Storage and Postgres **cannot** share one transaction. Use **upload-then-commit** with **content-addressed idempotency** and **orphan reconciliation**.

### 2.1 Phases

```
┌─────────────────────────────────────────────────────────────┐
│ A. CAPTURE (in connector / adapter — in-memory only)        │
│    raw bytes, normalised HTML/text, all SHA-256s, source_hash │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ B. STORAGE UPLOAD (idempotent)                              │
│    keys = f(regulator, source, sha256) — skip if HEAD matches │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ C. DB TRANSACTION (single publication document)             │
│    C1. existing publication logic (unchanged hash rules)    │
│    C2. INSERT version row (if NEW/UPDATED)                  │
│    C3. INSERT regulatory_source_snapshots (status=committed)│
│    C4. patch version.provenance.snapshotId                  │
│    COMMIT                                                   │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ D. On DB failure after B: ROLLBACK — orphans remain         │
│    Reconciler deletes unreferenced objects (see §5)         │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Ordering rules

1. **Never INSERT snapshot row** unless all required storage uploads succeeded and HEAD verifies size/hash.
2. **Never COMMIT** publication version bump without snapshot row when snapshot policy is **required** for source (FCA HTML: required).
3. If snapshot required and storage fails → **fail document** (`ingestion_items` FAILED), **no** version bump.

### 2.3 Idempotency

- Object path includes **content SHA-256**; re-upload of identical bytes is no-op.
- DB: `UNIQUE (publication_version_id)` prevents duplicate snapshots for same version.
- Retry same ingest item: if version already exists with snapshot, second insert hits unique constraint → treat as success (link item).

### 2.4 Partial upload recovery

| State | Recovery |
|-------|----------|
| Upload 2/3 objects, crash | Retry upload; content-addressed keys complete set |
| Upload complete, DB rollback | Orphan objects; nightly job deletes objects not referenced |
| DB committed, upload later verified missing | **Alert**; snapshot row `integrity_status = broken` (future column) — 8C.1 uses insert-time verify only |

### 2.5 Explicit failure behaviour

- FCA HTML + snapshot required: failure → `normalisation_status = FAILED`, `error_detail = snapshot_retention_failed:…`, run may be `PARTIAL`.
- Does **not** create `regulatory_changes` or alter summaries beyond existing ingest path.

---

## 3. Connector and ingestion integration

### 3.1 Extension point: `SourceEvidenceCapture`

Add optional field on normalised document (adapter output):

```ts
// Design types (not yet implemented)
evidenceCapture?: {
  rawBody: Buffer;
  contentType: string;
  finalUrl: string;
  normalisedArticleHtml: string;
  normalisedArticleText: string;
  fingerprint: { algorithm: 'SHA-256'; normalisation: 'html_article_v1'; hash: string };
  rawSha256: string;
  normalisedHtmlSha256: string;
  normalisedTextSha256: string;
};
```

### 3.2 FCA RSS connector (`rss-connector.mjs`)

After `httpGet` + existing `fingerprintContent` / summary:

- Build `normalisedArticleHtml` via `normaliseHtmlForFingerprint(html)`.
- Build `normalisedArticleText` via `stripHtmlToPlainText` on article region (same family as summaries).
- Attach `evidenceCapture` to `buildNormalisedPublication` payload.
- **Do not log** `rawBody`; pass by reference only.

### 3.3 Adapter (`adapter.mjs`)

- Pass through `evidenceCapture` unchanged into ingest document.

### 3.4 Ingest engine (`ingest-engine.mjs`)

- After version insert (NEW/UPDATED), call `persistSourceSnapshot(client, { versionId, publicationId, runId, doc })`.
- Gate: `doc.evidenceCapture` present and `sourceId === 'SRC-FCA-PUBLICATIONS-RSS'` and `contentType` includes `html`.
- **UNCHANGED** path: skip snapshot (unchanged).
- Wrap version + snapshot in **one DB transaction** per document (extend `processDocument`).

### 3.5 Future: PDF / PRA / international

- `fingerprint_normalisation`: `pdf_raw_v1` etc.
- Raw bytes retained; normalised text via extractor plugin.
- Snapshot policy per `regulatory_sources.external_key` in catalogue config (not in 8C.1 code).

---

## 4. Implementation sequence

| Step | Deliverable |
|------|-------------|
| 8C.1a | Migration SQL + storage policy doc (this package) |
| 8C.1b | `lib/ri/ingestion/snapshot/` — hash, paths, upload, verify |
| 8C.1c | Connector + adapter evidence capture (FCA only) |
| 8C.1d | `ingest-engine` integration + transaction boundary |
| 8C.1e | Acceptance scripts + phase-8c1 acceptance in RI master |
| 8C.1f | Staging: apply migration, create bucket, enable on TEST ingest only |
| 8C.1g | Ops: orphan reconciler cron (documented) |

---

## 5. Application vs storage immutability

| Mechanism | What it provides |
|-----------|------------------|
| **Application** | Insert-only table; no API to mutate/delete snapshots; ingestion worker only creates on new version |
| **Storage versioning** | Recover overwritten objects; audit trail of replacements |
| **Object Lock / legal hold** | WORM for compliance; protects against operator mistake and ransomware |
| **Content-addressing** | New content → new key; old keys remain for old versions |

8C.1 implements **application** immutability + private ACLs. WORM is **production ops** optional.

---

## 6. Files in this package

| File | Role |
|------|------|
| `docs/PHASE-8C1-SNAPSHOT-FOUNDATION-RFC.md` | This RFC |
| `docs/PHASE-8C1-STORAGE-POLICY-DESIGN.md` | Bucket policies |
| `docs/PHASE-8C1-ACCEPTANCE-PLAN.md` | Test matrix |
| `supabase/migrations/20261026120000_ri_source_snapshots.sql` | Draft migration (do not apply yet) |

---

## 7. Remaining risks

- Ingest currently **autocommits** per query; transaction wrapper must be carefully scoped.
- Large PDFs may exceed 2 MB connector cap — need size policy before PRA rules.
- Backfill pressure — resist treating live re-fetch as historical evidence.
- Service role key handling — only on worker, never in client bundles.

---

## 8. Readiness

| Gate | Result |
|------|--------|
| Design complete | **PASS** |
| Migration drafted | **PASS** |
| Storage policy drafted | **PASS** |
| Safe to apply infra | **FAIL** until review + staging apply window |

**Phase 8C.1 design package: PASS** — ready for implementation sprint after approval.
