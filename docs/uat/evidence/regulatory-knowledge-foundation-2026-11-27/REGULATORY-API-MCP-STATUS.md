# Regulatory API / MCP integration status

**Programme:** External Regulatory Knowledge Integration  
**Updated:** 2026-11-27  
**Matrix:** `EXTERNAL-REGULATORY-KNOWLEDGE-INTEGRATION-MATRIX.json`  
**Staging deploy note:** eCFR connector in **this tranche** (post-`cf18e08`); staging DB seeded; **hosted code** ships with next deploy. Commercial MCPs remain **research-only**.

## Summary

| Class | Count | Policy |
|-------|------:|--------|
| Official APIs wired in FORGENIQ | **6** (incl. eCFR Title 12) | Reuse `integrations/regulatory-sources` connectors + scheduler; **no** duplicate extractors |
| Official APIs probed / backlog | **2** (EUR-Lex, EDGAR policy hold) | EDGAR bulk explicitly excluded by acceptance policy |
| Commercial MCPs | **4** | **Not** in Cursor MCP catalogue; **commercial approval** before any runtime use |

**Corpus G2 backfill:** unaffected; uses existing publication URLs and hardened PDF/HTML engines.

---

## Priority 1 — Cursor MCP (commercial)

| MCP | Configured | Connected | Auth | Read-only test | FORGENIQ |
|-----|------------|-----------|------|----------------|----------|
| RegAlert | **Yes** (`~/.cursor/mcp.json`) | Probe only | **OAuth Bearer** | 401 without token | No |
| UK Government Lex | **Yes** | Probe **200** | None on initialize | MCP initialize OK | No — use **legislation.gov.uk** Atom |
| OpenLaw | **Yes** | Probe **200** (SSE) | TBD on tool call | initialize OK | No |
| Ansvar | **Yes** | Probe only | **Token** | 401 `invalid_token` | No |

**Observed Cursor MCP servers (this workspace):** Supabase, Vercel, Clerk, Stripe, Zapier, IDE browser, Origin, Computer Use — **preserved** (marketplace plugins unchanged).

### Actions required from you (commercial MCPs only)

1. In **Cursor → Settings → Tools & MCP**, complete OAuth for **RegAlert** and token setup for **Ansvar** (URLs already in `~/.cursor/mcp.json`).
2. Approve commercial licensing for FORGENIQ before agents call these servers in ingestion or Ask RI paths.
3. **UK Gov Lex** and **OpenLaw** responded to initialize probes; confirm vendor terms before production research use.

---

## Priority 2 & 3 — Official sources in FORGENIQ

| Source | FORGENIQ integration | Connector / source ID | Horizon | Extraction / Ask RI | Staging enabled |
|--------|------------------------|----------------------|---------|-------------------|-----------------|
| **FCA Handbook** | Publications RSS + handbook HTML in UAT | `SRC-FCA-PUBLICATIONS-RSS`, `CONN-LEGACY-FCA` | Yes (RSS) | Snapshots + `html_article_v2` / controlled PDF | Yes |
| **UK legislation.gov.uk** | Atom feed | `SRC-UK-LEGISLATION-ATOM`, `CONN-LEGACY-UK-LEG` | Yes | Corpus tick + atom ingest | **Yes** (28 pubs) |
| **Federal Register API** | JSON API (no key) | `SRC-SEC-FEDERAL-REGISTER`, `CONN-FR-SEC` | Yes | Normalised publications → snapshot path | **Yes** |
| **eCFR API** | Versioner titles API (**new 2026-11-27**) | `SRC-ECFR-TITLE-12`, `CONN-ECFR-TITLE-12` | Yes (post-deploy code) | Title index + `ecfr.gov` HTML via corpus | **Yes** (seeded; ingest pending) |
| **EUR-Lex / CELLAR** | Not wired | — | No | No | No |
| **SEC EDGAR** | **Excluded** (bulk) | `SRC-SEC-RULEMAKING` HTML only | Partial | No bulk EDGAR (`acceptance-batch-1`) | Partial |

### Implementation principles (verified)

- Ingestion uses **`connector-registry.mjs`** → existing **`http-client`**, RSS/Atom/API connectors, **`ingest-engine`**.
- Document body extraction: **`createExtractionRevision`** / **`extractRegulatoryPdfContent`** — **unchanged**.
- G2 corpus backfill only **schedules** work; it does **not** introduce alternate parsers.

### eCFR (new, minimal)

- `integrations/regulatory-sources/core/ecfr-api-connector.mjs`
- `integrations/regulatory-sources/connectors/ecfr-connectors.mjs`
- Registered in `apps/platform/lib/ri/ingestion/connector-registry.mjs`
- Acceptance: `scripts/acceptance-ecfr-api-connector.mjs` → **LIVE_VERIFIED** (2026-11-27)

---

## Read-only retrieval tests (2026-11-27)

| Endpoint | HTTP |
|----------|-----:|
| `federalregister.gov/api/v1/documents.json?per_page=1` | 200 |
| `legislation.gov.uk/new/data.feed` | 200 |
| `ecfr.gov/api/versioner/v1/titles.json` | 200 |
| `handbook.fca.org.uk/` | 200 (HTML) |

---

## Ask RI implication

Indexed regulatory answers still depend on **staging corpus** (`html_article_v2` / `pdf_primary_v1`) and frozen offline eval packs. New API connectors improve **discovery and catalogue freshness**; they do not by themselves raise Ask RI PASS counts until snapshots and evidence-pack export complete.

---

## Related evidence

- `REGULATOR-CONNECTOR-STATUS.json`
- `TRANCHE-G2-DEFECT-RECONCILIATION.md`
- `acceptance-batch-1.mjs`, `acceptance-ecfr-api-connector.mjs`