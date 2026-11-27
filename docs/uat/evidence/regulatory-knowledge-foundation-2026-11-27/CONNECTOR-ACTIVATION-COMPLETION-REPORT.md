# Connector activation and operational verification — completion report

**Date:** 2026-11-27  
**Staging prior deploy:** `cf18e08` / `dpl_HcTt3tGRUYVcpmmhZo5Kt39KPUaZ`  
**Tranche:** eCFR connector + catalogue 42nd source + MCP probe + operational matrix  
**Corpus G2 loop:** **unchanged** (session `442518`, 200-tick run in progress)

## Executive summary

| Objective | Status |
|-----------|--------|
| Enable eligible staging connectors | **40/42** enabled on scheduler; **2** policy-disabled (OFAC SDN, CBUAE) |
| UK Legislation Atom, Federal Register, eCFR | **Atom + FR operational** on staging; **eCFR** seeded + enabled (await hosted ingest post-deploy) |
| Official APIs backlog (FCA Handbook JSON, UK Gov Lex API, EUR-Lex) | **Documented** — use existing RSS/Atom/HTML paths; no duplicate extractors |
| Cursor MCP (4 commercial) | **`~/.cursor/mcp.json` merged**; marketplace plugins preserved; **OAuth required** for RegAlert & Ansvar |
| End-to-end workflow | **Verified** for 39 sources with publications; corpus/indexing continues via G2 loop |
| OPEN-001 unattended cron | **Partial** — `due=1` (eCFR) after seed; mass due expected **2026-11-28 04:00 UTC**; prior cron ticks `due=0` |
| Promote gate | **56/56 PASS** (after eCFR coverage + catalogue count 42) |
| Staging DB migration | **`20261127204500_ri_ecfr_title_12_catalogue.sql`** applied on `forgeniq-ri-staging` |

**Authoritative matrix:** `CONNECTOR-OPERATIONAL-VERIFICATION-MATRIX.json`

### Consolidated totals (from matrix generator)

| Metric | Count |
|--------|------:|
| Regulators | 36 |
| Regulatory sources (catalogue) | **42** (+1 eCFR) |
| Implemented connectors | 41 |
| Enabled on staging | 40 |
| Operational (last success + enabled) | 39 |
| Automatically scheduled | 40 |
| Disabled (documented) | 2 |
| Restricted / policy | 5 |
| Awaiting first ingest (enabled, no success) | 1 (eCFR) |
| Awaiting external approval / auth | 3 |

## Disabled connectors (justification)

| Source | Reason |
|--------|--------|
| `SRC-OFAC-SDN-LISTS` | Hosted scheduler exclusion: structured SDN bulk lists require sanctions handling controls |
| `SRC-CBUAE-DIGITAL-RULEBOOK` | No connector; `ingestion_mode=DISABLED`; official API not verified |

## New / updated integrations

### eCFR Title 12 (`CONN-ECFR-TITLE-12`)

- Code: `ecfr-api-connector.mjs`, registered in `connector-registry.mjs`
- Staging: source + ops row **enabled**, `next_run_at` due (scheduler batch size 5)
- Acceptance: `acceptance-ecfr-api-connector.mjs` → **LIVE_VERIFIED** (local)

### Already operational (no rebuild)

- **UK Legislation Atom** — 28 publications, last success 2026-11-27
- **Federal Register API** — 1 publication, connector on staging, scheduler registered

### Not implemented (genuine gap — official free alternatives in use)

| Capability | Policy |
|------------|--------|
| FCA structured Handbook JSON API | FCA publications RSS + handbook HTML UAT path |
| UK Government Lex API | legislation.gov.uk Atom connector (`SRC-UK-LEGISLATION-ATOM`) |
| EUR-Lex / CELLAR | Backlog; no duplicate EU source until CELLAR contract defined |

## MCP configuration and probes (2026-11-27)

| Server | URL | Initialize probe | FORGENIQ runtime |
|--------|-----|------------------|------------------|
| RegAlert | `https://mcp.regalert.today/mcp` | **401** — Bearer OAuth required | Research-only until licence |
| UK Gov Lex | `https://lex.lab.i.ai.gov.uk/mcp` | **200** — tools/resources advertised | Research-only; official Atom preferred |
| OpenLaw | `https://openlawmcp.legalaispace.com/v1/mcp` | **200** (SSE) | Research-only until licence |
| Ansvar | `https://gateway.ansvar.eu/mcp` | **401** `invalid_token` | Research-only until licence |

**User actions:** Complete OAuth for RegAlert / Ansvar in Cursor MCP UI; confirm commercial licensing before any ingestion wiring.

**Preserved:** Supabase, Vercel, Clerk, Stripe, Zapier, IDE browser MCPs (Cursor marketplace).

## Workflow verification

For enabled sources the chain **Source → Connector → Scheduler → Horizon → Feed → Catalogue → Snapshot → Extraction → Index → Ask RI** is implemented. Staging evidence:

- Publications in `regulatory_publications` for **39** sources
- G2 corpus loop processing snapshots without alternate parsers
- Ask RI retrieval eval unchanged (corpus gap; not connector regression)
- Watchlist / consultation / calendar suites **PASS** in promote gate

## OPEN-001 / automation

| Evidence | Finding |
|---------|---------|
| `open-001-scheduler-tranche-g2.json` | VERCEL_CRON 04:00 & 12:00 UTC **due=0** on 2026-11-27 |
| Staging SQL post-eCFR seed | **`due_now=1`** (eCFR only until 2026-11-28 00:12Z rollover) |
| Manual hosted | **due≥1** COMPLETED MOCI (not closing OPEN-001) |

**Expected closure window:** **2026-11-28T04:00:00Z** VERCEL_CRON with ~40 due sources + successful batch **after** this tranche deploy lands eCFR connector code.

## Tests executed

- `acceptance-ecfr-api-connector.mjs` — PASS  
- `phase8d4-hosted-scheduler-readiness.test.mjs` — ALL PASS  
- `npm run qa:promote` — **56/56 PASS**  
- Supabase migration apply — success  

## Corpus preservation

Tranche G2 **200-tick** loop **not** stopped or duplicated. New publications from connectors join existing corpus queue via standard ingestion + snapshot ticks.

## Outstanding after this tranche

1. **Deploy** connector tranche to `forgeniq-platform-staging` and confirm **eCFR** first scheduled ingest  
2. **OPEN-001** unattended artefact with `dueCount>0` + COMPLETED batch  
3. **EUR-Lex / CELLAR** design when prioritised  
4. Commercial MCP **licensing** before runtime use  