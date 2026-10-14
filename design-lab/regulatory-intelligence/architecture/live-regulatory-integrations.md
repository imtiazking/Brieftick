# Live regulatory integrations

## Pipeline

Regulatory Source Registry → Connector → Discovery → Source Item → Retrieval → Raw Artifact → Normalisation → Identity → Fingerprint → Duplicate/Version → Parser → Source Sections → (optional) Publication → AI handoff (mock only in Design Lab).

## Operating modes

| Mode | Purpose |
|------|---------|
| `fixture` | Deterministic tests; default |
| `live-verification` | Small manual RSS/HTML checks; `allowLiveRegulatoryVerification` must be true |
| `production` | Architecture only — **disabled** in Design Lab |

## HTTP safety

- Central `http-client.js`: timeouts, redirects (max 5), size limits, User-Agent `FORGENIQ-Regulatory-Research/DesignLab`
- Rate limiting: per-host minimum interval (default 3s), concurrency 1
- Retries: transient 5xx/429 with Retry-After respect
- Domain allowlist per connector
- SSRF guards: block localhost, private IPs, non-http(s) schemes

## Identity vs hash

- **Identity**: official reference → canonical URL → external ID
- **Content hash**: SHA-256 of normalised retrieved bytes
- Same identity + different hash → version update
- Same identity + same hash → duplicate

## Parsing

- HTML: safe text extraction; **no script execution**; `UNTRUSTED_SOURCE_CONTENT`
- PDF: boundary only in Design Lab (fixture text or metadata-only)
- Parser quality: Complete / Complete with Warnings / Partial / Failed

## Provenance labels

- `fixture` / `demo` / `live-verification` on raw items and documents
- AI analysis remains **DEMO / SEEDED** when source is live

## Checkpointing & backfill

- Checkpoint stored on connector record (feed URL + timestamp cursor)
- Lookback window configurable (`lookbackDays`)
- Backfill: manual, capped items, rate-limited, idempotent — not auto-run

## Reset behaviour

Reset Demo Environment removes `live-verification` raw items and staging collections.

## Production transition

Future: queue worker executes connector jobs, object storage for artifacts, server-side SSRF enforcement, malware scan on PDFs.
