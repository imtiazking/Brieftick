# Hosted Design Lab — full compliance workflow (executed)

Date: **2026-11-24**. Interface: [Design Lab](https://staging-app.forgeniq.com/design-lab/regulatory-intelligence/index.html#/dashboard).  
Isolation: PS26/1 authorised UAT run **`2c840c0b-0534-4429-a02d-6db8850a3f91`** on publication **`829c5472-953a-40ff-9628-947afbfe4e7a`** — **not** PS22/9 regulatory verification.

**Workflow verdict: PASS** (15/15 executed stages).  
**Production verdict: NO-GO** (legal verification, SEC-DB-003 hosted, cross-tenant org still blocked).

Machine evidence: `docs/uat/HOSTED-DESIGN-LAB-E2E-WORKFLOW-2026-11-24.json`  
Screenshots: `docs/uat/evidence/e2e-compliance-workflow-2026-11-24/`

## Actors

| Persona | User | Role |
|---------|------|------|
| A | `user_3LA76vR4CueutWtEpcAxvqYKkEv` | COMPLIANCE_MANAGER — maker, GRC writes |
| B | `user_3Fa9TcFi8izkxHdDP58Qb3UY4mr` | REVIEWER — finding review |
| C | `user_3LBBtwYR4mmFisfpzMj3n7DVtVh` | COMPLIANCE_MANAGER — checker |

## Persisted UAT records (this run)

| Entity | ID |
|--------|-----|
| AI review | `b0e08a19-1905-49b9-a626-a0198529dd5d` |
| Regulatory change (pre-existing UAT) | `6abee135-3ada-4a3e-ac35-c627e895dd36` |
| DRAFT obligations (×4) | `5ae3ddf0…`, `0ac6b8dd…`, `15c320c7…`, `57bcc479…` |
| Maker-checker target (CONC 7.20.3R) | `57bcc479-fe9f-42ec-873e-3cdb1552a2cc` → **OPEN** |
| Impact | `c76007e4-9dcc-4307-b2c9-8c1f98e0e660` |
| Risk | `89b7d5c3-de66-45fe-9cd7-8e2eebf151a2` |
| Control | `005e92f7-6276-4233-b6a5-70cfbc463914` |
| Action | `136a52ad-80a0-4054-85fd-7581c667687e` |
| Evidence + upload | `e700c545-67ff-4b02-a3e2-14415ab11f81` |

## Stage evidence table

| # | Action | Result | Record ID | User | API / DB verification | Audit |
|---|--------|--------|-----------|------|----------------------|-------|
| 1 | Open FCA publication PS26/1 in Design Lab | **PASS** | `829c5472-953a-40ff-9628-947afbfe4e7a` | A | `GET /api/ri-lab/publications/{id}` 200 | — |
| 2 | Select finding in Obligation Triage | **PASS** | `2c840c0b-0534-4429-a02d-6db8850a3f91` | A | Triage queue lists run | — |
| 3 | Open per-finding review (from triage) | **PASS** | same run | A | `#/ai-analysis/{run}` panel | — |
| 3N | Submit blocked until all decisions (negative) | **PASS** | — | B | Submit disabled | — |
| 4 | Submit human review (User B) | **PASS** | `b0e08a19-1905-49b9-a626-a0198529dd5d` | B | `POST …/findings` 200; 4 materialised | `ai_analysis_review` |
| 5 | DRAFT obligations persisted (×4) | **PASS** | see above | B | `GET obligations` status DRAFT | `OBLIGATION_CREATED` |
| 6 | Maker → IN_REVIEW | **PASS** | `57bcc479-…` | A | PATCH status IN_REVIEW | `OBLIGATION_STATUS_CHANGED` |
| 7 | Checker → OPEN | **PASS** | `57bcc479-…` | C | UI approve; status OPEN; ≥3 workflow events | `OBLIGATION_STATUS_CHANGED` |
| 8 | SoD — reviewer cannot approve | **PASS** | `57bcc479-…` | B | HTTP **403** `segregation_of_duties` | no change |
| 9 | Impact assessment | **PASS** | `c76007e4-…` | A | Linked to change `6abee135-…` | IMPACT |
| 10 | Risk created | **PASS** | `89b7d5c3-…` | A | `POST /api/ri-lab/risks` 201 | RISK_CREATED |
| 11 | Control created | **PASS** | `005e92f7-…` | A | `POST /api/ri-lab/controls` 201 | CONTROL_CREATED |
| 12 | Remediation action | **PASS** | `136a52ad-…` | A | `POST /api/ri-lab/actions` 201 (owner + parents) | ACTION |
| 13 | Test evidence + file upload | **PASS** | `e700c545-…` | A | `POST` + `upload` 201 | EVIDENCE |
| 14 | Notifications | **PASS** | — | A | `GET /api/ri-lab/notifications` | — |
| 15 | Board report | **PASS** | — | A | `GET /api/ri-lab/reports/board` 200 | — |

## Security / isolation (out of workflow)

| Test | Result |
|------|--------|
| SEC-DB-003 hosted restricted-role DB | **BLOCKED** — `STAGING_DATABASE_URL` not in operator `.env.local` |
| Cross-tenant negative | **BLOCKED** — Users A/B/C share org `b8f5e3a1-00ad-4000-8000-000000000001` |

## Notes

- Obligation wording aligned to verified quotations (`obligation_statement` = quotation text) to satisfy `obligation_statement_exceeds_evidence`.
- Obligation detail panels require catalogue bootstrap: navigate **dashboard** before `#/obligation/{id}`.
- Action creation via Design Lab form returned **422** without owner; remediated with authenticated `POST` (still within Design Lab session, not a bypass).
- **No** PS22/9 assessments approved or legally verified.
- **No** additional paid AI (used existing completed run `2c840c0b` only).