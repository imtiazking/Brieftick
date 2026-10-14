# Sector Regulatory Landscape (Design Lab v11)

## Navigation

- Single top-level item: **Regulatory Landscape ▾** (not twelve sector tabs).
- Desktop: click/keyboard opens dropdown; outside click and **Escape** close; **View all sectors →** opens `#/landscape`.
- Mobile/tablet: same menu pattern inside horizontal top nav (scrollable panel, no mega-menu).

## Routes

| Route | Purpose |
|-------|---------|
| `#/landscape` | All sectors landing |
| `#/landscape/{slug}` | Sector detail (overview default) |
| `#/landscape/{slug}/{tab}` | Sector sub-views |
| `#/landscape/framework/{id}` | Framework detail |
| `#/landscape/regulator/{id}` | Regulator drill-down |
| `#/landscape/gaps` | Coverage gaps |
| `#/landscape/matrix` | Framework × sector matrix |
| `#/landscape/preferences` | My sectors |
| `#/landscape/search/{query}` | Landscape search |

## Sectors (SEC-001–SEC-012)

Banking, Asset Management, Wealth Management, Insurance, Investment Banking & Broker-Dealers, Consumer Credit & Lending, Mortgage Lenders & Brokers, Payments & E-Money, Fintech & Cryptoassets, Private Equity & Private Debt, Pension Providers, Financial Market Infrastructure.

## Coverage states

| Enum | UI label |
|------|----------|
| `LIVE_SOURCE` | LIVE SOURCE |
| `PARTIAL_COVERAGE` | PARTIAL COVERAGE |
| `SOURCE_PLANNED` | SOURCE PLANNED |
| `REFERENCE_ONLY` | REFERENCE ONLY |

Live status reflects **framework-level** RI source coverage, not “regulator connected ⇒ everything live”. TPR and UK legislation entries remain planned/reference unless a genuine connector exists.

## My sectors

Default fixture preference: Banking, Wealth Management, Payments & E-Money. Dashboard shows prioritised counts; all sectors remain reachable.

## Cross-sector publications

One publication record (e.g. `PUB-001`) with `publicationSectorMappings` — primary + related sectors, no duplicate publication rows.

## Applicability

Mappings are **relevant / mapped / potentially applicable** only. Final applicability requires entity permissions, activities, products, jurisdiction, and human legal/compliance review.

## Future official sources (not built here)

- legislation.gov.uk  
- The Pensions Regulator feeds  
- Additional Bank of England / Basel official bundles  

## Acceptance

```bash
node design-lab/regulatory-intelligence/scripts/acceptance-ri-sector-landscape.mjs
```

Scenarios: LAND-001–LAND-006, dropdown navigation, flagship `PUB-001` → `CHG-001` → `OBL-0142` chain preserved.
