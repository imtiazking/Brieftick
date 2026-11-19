# FORGENIQ Regulatory Intelligence — Design Lab

Demo-only regulatory intelligence prototype (`/design-lab/regulatory-intelligence/`). Not production.

## Basel / BIS live source (schema v14)

BCBS Basel Framework — [docs/BASEL-BIS-LIVE-SOURCE.md](docs/BASEL-BIS-LIVE-SOURCE.md)

```bash
node design-lab/regulatory-intelligence/scripts/acceptance-ri-basel.mjs
node design-lab/regulatory-intelligence/scripts/verify-ri-live-basel.mjs
node design-lab/regulatory-intelligence/scripts/acceptance-ri-master.mjs
```

## TPR live source (schema v13)

The Pensions Regulator — [docs/TPR-LIVE-SOURCE.md](docs/TPR-LIVE-SOURCE.md)

```bash
node design-lab/regulatory-intelligence/scripts/acceptance-ri-tpr.mjs
node design-lab/regulatory-intelligence/scripts/verify-ri-live-tpr.mjs
```

## UK Legislation live source (schema v12)

Official **legislation.gov.uk** connector — see [docs/UK-LEGISLATION-LIVE-SOURCE.md](docs/UK-LEGISLATION-LIVE-SOURCE.md).

```bash
node design-lab/regulatory-intelligence/scripts/acceptance-ri-legislation.mjs
node design-lab/regulatory-intelligence/scripts/verify-ri-live-legislation.mjs
```

## Sector Regulatory Landscape (schema v11+)

Navigation: **Regulatory Landscape ▾** → twelve sectors + **View all sectors**. See [docs/SECTOR-REGULATORY-LANDSCAPE.md](docs/SECTOR-REGULATORY-LANDSCAPE.md).

```bash
node design-lab/regulatory-intelligence/scripts/acceptance-ri-sector-landscape.mjs
node design-lab/regulatory-intelligence/scripts/validate-data.mjs
```
