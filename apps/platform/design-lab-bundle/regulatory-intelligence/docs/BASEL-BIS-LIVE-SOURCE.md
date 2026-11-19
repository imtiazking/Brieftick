# Basel / BIS Live Source (Design Lab v14)

## Purpose

Connect **Basel Committee on Banking Supervision** standards on **bis.org** as international prudential intelligence for Banking (SEC-001), with deterministic **international → UK implementation** mappings to existing PRA sources — without treating Basel text as UK law.

## Authorities

- **Organisation:** Bank for International Settlements (BIS)
- **Standard setter:** Basel Committee on Banking Supervision (BCBS)
- **Host:** `https://www.bis.org/`
- **Framework root:** `/committees/bcbs/basel-framework`
- **Modules (verified):** `/committees/bcbs/basel-framework/standard/{cap,cre,ope,srp,dis,...}`

## Jurisdiction layers

| Layer | Example | Meaning |
|-------|---------|---------|
| Basel / BCBS | CAP standard | International prudential standard |
| PRA / BoE | PUB-003 SS | UK implementation / supervision |
| UK legislation | Banking Act 2009 | Statutory UK source |

## Architecture

- `createBaselConnector()` — bounded HTML metadata retrieval
- `basel-constants.js` — allowlist, verification targets, document types
- `basel-parser.js` — current/future/draft hints from official HTML
- `basel-seed.js` — records, staging, `internationalImplementationMappings`, coverage promotion
- `SRC-BASEL` / `CONN-BASEL-001` in ingestion seed

## Security & rate limiting

HTTPS, host allowlist, path gate, SSRF blocks, ~2.5s sequential requests, metadata-first storage.

**User-Agent:** `FORGENIQ-Regulatory-Intelligence-Design-Lab/1.0`

## Coverage

`FWK-BASEL` → **LIVE SOURCE** only when `BASEL_VERIFICATION_EVIDENCE.status === LIVE_VERIFIED`.

## Human review

Staging and hash changes do **not** auto-create Changes, Obligations, or legal conclusions.

## Scripts

```bash
node design-lab/regulatory-intelligence/scripts/acceptance-ri-basel.mjs
node design-lab/regulatory-intelligence/scripts/verify-ri-live-basel.mjs
node design-lab/regulatory-intelligence/scripts/acceptance-ri-master.mjs
```

## Scenarios BAS-001–006

Framework live provenance, future standard staging, consultation staging, UK implementation traceability, source change event, source unavailable.

## Limitations

No full Basel Framework ingest, no AI mapping, no production scheduling, no deployment.

## Design Lab freeze

When deterministic master passes (Landscape, Legislation, TPR, Basel), major RI source expansion is **complete** for the Design Lab; further work should be customer-driven or production engineering.
