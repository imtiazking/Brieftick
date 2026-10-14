# TPR Live Source (Design Lab v13)

## 1. Purpose

Connect **The Pensions Regulator** official website as a live regulatory source for **Pension Providers** (SEC-011), covering Code of Practice, guidance, consultations, statements, and regulatory/enforcement policy — without treating TPR material as UK primary legislation.

## 2. Official authority

- **Authority:** The Pensions Regulator (TPR)
- **Host:** `https://www.thepensionsregulator.gov.uk/`
- **Allowlist:** `www.thepensionsregulator.gov.uk`, `thepensionsregulator.gov.uk` (redirects only)

## 3. Discovery strategy

1. `robots.txt` (references sitemap)
2. `sitemap.xml`
3. Prefix filter on `/document-library/…` regulatory paths
4. Bounded HTML metadata retrieval (no whole-site crawl)

No public JSON API or RSS is assumed or invented.

## 4. Document Library

Entry: `/document-library` — category indexes for Code, guidance, consultations, statements, policies, enforcement.

## 5. Source families (Phase 1)

| Family | Internal types |
|--------|----------------|
| Code of Practice | `TPR_CODE` |
| Scheme / AE guidance | `TPR_GUIDANCE` |
| Consultations | `TPR_CONSULTATION`, `TPR_CONSULTATION_RESPONSE` |
| Statements | `TPR_STATEMENT` |
| Regulatory / enforcement policy | `TPR_POLICY` |
| Enforcement activity | `TPR_ENFORCEMENT_PUBLICATION` |
| Press (supporting only) | `TPR_NEWS_SUPPORTING` |

## 6. Code vs legislation

Use `legalSourceType`:

- UK Acts on legislation.gov.uk → `PRIMARY_LEGISLATION` / `SECONDARY_LEGISLATION`
- TPR General Code modules → `REGULATOR_CODE`
- TPR guidance → `REGULATOR_GUIDANCE`

UI shows **Legal basis** (legislation) separately from **TPR regulatory expectations**.

## 7. Adapter architecture

- `createTprConnector()` — `OfficialTprSource` behaviour via `tpr-connector.js`
- `tpr-sitemap.js` — safe XML parse + prefix filter
- `tpr-relevance.js` — deterministic config mapping (no AI)
- Fixture sitemap: `fixtures/tpr/sample-sitemap.xml`

## 8. Security

Reuses RI `http-client` / `url-safety`: HTTPS, host allowlist, SSRF blocks, redirect cap, size cap, timeout, safe HTML parse.

**User-Agent:** `FORGENIQ-Regulatory-Intelligence-Design-Lab/1.0`

## 9. Rate limiting

~2.5s minimum interval, max concurrency 1, bounded target verification (5 core pages).

## 10. Metadata normalisation

`TprPublicationRecord` fields: title, `documentType`, `canonicalUrl`, dates when present, `legalReferences`, sector/framework/theme IDs, `sourceHash` (FORGENIQ SHA-256), `sourceStatus`, staging/review flags. No full-site copy in Git or localStorage.

## 11. Staging & change detection

New items → `tprStaging` (`REVIEW_REQUIRED`). Hash changes → `tprSourceChanges` — **not** automatic RI Changes or Obligations.

## 12. Consultation lifecycle

Staging fixtures model consultation → response linkage; no automatic “final rule” inference.

## 13. General Code

Flagship targets: Code index + verified module (e.g. *Role of the governing body* under board structure). Structure follows live sitemap, not hard-coded module lists.

## 14. Legal-reference linkage

Code modules may reference Acts; links point to existing `legislationRecords` (e.g. Pensions Act 2004) without duplicating Acts.

## 15. Landscape integration

- `FWK-TPR-REQ`, `FWK-TPR-GCOP` → **LIVE SOURCE** only when `TPR_VERIFICATION_EVIDENCE.status === LIVE_VERIFIED`
- Pension Providers page: two-layer provenance (legislation vs TPR)
- Coverage gaps derive from framework `coverageStatus` (TPR drops off gaps when live)

## 16. Coverage rules

Do not promote LIVE from a single reachable page; require verification script PASS and evidence record.

## 17. Live verification

```bash
node design-lab/regulatory-intelligence/scripts/verify-ri-live-tpr.mjs
```

Updates `js/tpr-verification-evidence-data.js` and `fixtures/tpr-verification-evidence.json`.

## 18. Deterministic acceptance

```bash
node design-lab/regulatory-intelligence/scripts/acceptance-ri-tpr.mjs
```

Scenarios TPR-001–006 (Code, consultation, response, hash change, legislation traceability, source unavailable).

## 19. Source failure

`SOURCE_UNAVAILABLE` retains last metadata; Landscape must not show current LIVE verification; no silent fixture fallback.

## 20. Limitations

Design Lab only; no deployment; no AI relevance; no legal applicability engine; no TPR API key; press releases are supporting intelligence only.

## 21. Future production considerations

Durable fetch queue, operator review workflows, explicit consent/rate policies with TPR, and separation of Design Lab evidence from production connectors.
