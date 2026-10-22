# Phase 7C.3 — Lifecycle visual parity evidence

**Date:** 2026-10-23  
**Design Lab:** `http://localhost:3000/design-lab/regulatory-intelligence/` (`#/changes`, `#/assessments`, `#/obligations`)  
**Production:** `http://localhost:3001/ri` (`/ri/changes`, `/ri/impact-assessments`, `/ri/obligations`)

## Manual side-by-side (structural)

| Screen | Classification | Notes |
| --- | --- | --- |
| Changes list | MATCH_WITH_INTENTIONAL_PRODUCTION_DIFFERENCE | Clerk shell; columns aligned to lab register (ID, title, publication, materiality, status) |
| Change detail (sample) | MATCH_WITH_INTENTIONAL_PRODUCTION_DIFFERENCE | Traceability + linked impacts/obligations; no lab AI lanes in production |
| Impact assessments list | MATCH_WITH_INTENTIONAL_PRODUCTION_DIFFERENCE | Register columns; owner shows Clerk user id |
| Impact detail (sample) | MATCH_WITH_INTENTIONAL_PRODUCTION_DIFFERENCE | Dimension form + server-governed approve/reject |
| Obligations list | MATCH_WITH_INTENTIONAL_PRODUCTION_DIFFERENCE | `ri-metrics-row` portfolio strip matches lab counts taxonomy |
| Obligation detail (sample) | MATCH_WITH_INTENTIONAL_PRODUCTION_DIFFERENCE | Citation/source section + downstream panels via explicit links only |

## Deterministic parity

Behavioural parity is enforced by `scripts/acceptance-phase-7c3-golden-master.mjs` (record sets, taxonomy buckets, flagship chains).

**No screenshot CI** — evidence is this checklist plus acceptance harness PASS.
