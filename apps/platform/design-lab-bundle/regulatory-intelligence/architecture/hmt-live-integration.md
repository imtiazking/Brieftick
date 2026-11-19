# HM Treasury live horizon-scanning integration

**POST-MASTER ENHANCEMENT** — added after Final Master Verification (2026-10-09).

## Official source

| Field | Value |
|-------|--------|
| Feed | `https://www.gov.uk/government/organisations/hm-treasury.atom` |
| Organisation page | `https://www.gov.uk/government/organisations/hm-treasury` |
| Host allowlist | `www.gov.uk`, `gov.uk` |
| Connector | `HMT-GOVUK-ATOM-1.0` |

## Classification

| Field | Value |
|-------|--------|
| Authority | HM Treasury |
| Authority Type | Government / Policy |
| Source Role | Horizon Scanning |
| Source Trust | Official Government Source |
| Jurisdiction | United Kingdom |

## Modes

- `live-verification`: enabled (manual, max 3 relevant items per run)
- `production`: disabled
- No automatic workflow or AI on live retrieve

## Verification

Run: `node design-lab/regulatory-intelligence/scripts/live-hmt-verification.mjs`  
Acceptance: `node design-lab/regulatory-intelligence/scripts/acceptance-live-hmt.mjs`

Evidence: `fixtures/live-verification-evidence.json` (merged with existing FCA/PRA blocks).
