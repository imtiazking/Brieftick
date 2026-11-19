# UK Legislation Live Source (Design Lab v12)

## Purpose

Connect **legislation.gov.uk** as an official UK legislation publisher behind Sector Regulatory Landscape frameworks where an Act or SI is the authoritative source.

## Official source

- Host: `https://www.legislation.gov.uk/`
- Authority: **The National Archives**
- Feeds (verified): `https://www.legislation.gov.uk/new/data.feed`, per-instrument `…/data.feed`

## Security

HTTPS only, host allowlist (`www.legislation.gov.uk`, `legislation.gov.uk`), blocked private/localhost URLs, bounded response size, redirect limit, regex Atom parse (no XXE).

## User-Agent

`FORGENIQ-Regulatory-Intelligence-Design-Lab/1.0` — low-frequency sequential requests.

## Coverage rules

Frameworks move to **LIVE SOURCE** only when `LEGISLATION_VERIFICATION_EVIDENCE.status === LIVE_VERIFIED` and the framework is in `verifiedFrameworkIds`. Handbook regimes (COBS, PRA Rulebook, etc.) are unchanged.

## Human review

Staging items do not auto-create Changes or Obligations. Hash changes create `legislationSourceChanges` with `REVIEW_REQUIRED` — not “legal change confirmed”.

## Scripts

```bash
node design-lab/regulatory-intelligence/scripts/acceptance-ri-legislation.mjs
node design-lab/regulatory-intelligence/scripts/verify-ri-live-legislation.mjs
```

## Limitations

No full statute book ingest, no AI relevance, no TPR connector, no deployment.
