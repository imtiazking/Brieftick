# Batch 1B — Saudi / UAE source resolution

Resolves Batch 1 gaps for `SRC-SAMA-RULEBOOK`, `SRC-CMA-SA-RULES`, `SRC-DFSA-RULEBOOK`, `SRC-CBUAE-DIGITAL-RULEBOOK`.

## Run

```bash
node integrations/regulatory-sources/scripts/run-batch-1b-live.mjs
node integrations/regulatory-sources/scripts/acceptance-batch-1b.mjs --live
```

## Findings summary

| Source | Route | Notes |
|--------|-------|-------|
| SAMA | `https://rulebook.sama.gov.sa` | `www.sama.gov.sa` TLS chain fails Node default trust (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`); official rulebook subdomain verifies |
| CMA SA | `https://cma.gov.sa/RulesRegulations/...` + `cma.org.sa/.../Documents/*.pdf` | Canonical regulatory index on `cma.gov.sa`; PDFs on `cma.org.sa` |
| DFSA | `https://dfsaen.thomsonreuters.com/rulebook/` | Official DFSA rulebook platform; `www.dfsa.ae` returns 403 to lab client |
| CBUAE | `https://rulebook.centralbank.ae` | CNAME to Thomson Reuters AWS; HTTP 403 from this environment; `cbuae.thomsonreuters.com` not in local DNS |

## Recommended catalogue updates (not applied)

- **REG-SAMA:** note official rulebook host `rulebook.sama.gov.sa` alongside `www.sama.gov.sa`
- **REG-CMA-SA:** canonical content domain `cma.gov.sa` (sitemap uses gov; org.sa serves documents)
- **REG-DFSA:** document `dfsaen.thomsonreuters.com` as official rulebook delivery host
- **REG-CBUAE:** document TR-hosted rulebook + `cbuae.thomsonreuters.com` alias where DNS resolves
