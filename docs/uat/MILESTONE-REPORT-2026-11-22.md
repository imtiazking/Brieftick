# FORGENIQ — Autonomous execution milestone (2026-11-22)

**Scope:** PS26/1 functional UAT accepted; regulatory accuracy sign-off still open. Staging only — no production.

## Completed functionality

| Area | Status |
|------|--------|
| RI-UI-007 — Editable obligation statement + grounding (TS/JS) | Implemented in worktree; RPC stores reviewer statement |
| RI-CLS-009 — Cross-page provision index + quotation verify | Local 47/47 |
| RI-UI-006/008/001/002 — Workflow UI fixes | In design-lab bundle (not yet on staging host) |
| P4 implementation approach | `docs/architecture/P4-IMPLEMENTATION-APPROACH.md` / backlog |
| Staging DB `ri_submit_ai_finding_review` | Migration applied 2026-11-22 |

## Tests

| Suite | Result |
|-------|--------|
| `acceptance-ri-ai-finding-review-service.mjs` | **32/32 pass** (after RPC SHA fix) |
| `acceptance-ri-provision-eligibility-local-db.mjs` | **47/47 pass** |
| PS26/1 staging UAT (prior session) | Functional **PASS**; regulatory accuracy **NOT met** |
| P3 UAT gates (CLS-005 negative, E, fail-closed, triage) | **Not started** — blocked on app deploy + credentials for preflight |

## Defects fixed (this session)

- **RPC `finding_text_mismatch`** when reviewer submits `obligationStatement`: server now hashes **claim text** only for tamper binding; obligation row uses `coalesce(obligation_statement, claim_text)`.

## Outstanding defects / work

| ID | Item |
|----|------|
| Regulatory sign-off | Re-audit / remediate 4 OPEN obligations (≥2 exceed verified quotes) |
| RI-CLS-009 | Retest CONC 7.20.1R(2) after deploy |
| RI-UI-007 | Browser verification + staged remediation of OPEN rows |
| App deploy | Platform + design-lab bundle to `staging-app.forgeniq.com` |
| RI-CLS-005 | Negative conversion scenarios on staging |
| RI-CLS-004 | Positive **E** conversion (candidate PS22/9; preflight needs staging creds) |
| RI-CLS-001 | FRC/ICO/PSR/PRA fail-closed UI checks on staging |

## Regulatory accuracy

- `docs/eval/PS26-1-OBLIGATION-WORDING-AUDIT.json` — unsupported wording in register until remediation completes.
- Backend: client + RPC enforce quotations; obligation statement grounding in TS; **no** duplicate SHA-on-statement bug after fix.

## AI costs

| Run | Cost | Notes |
|-----|------|--------|
| PS26/1 `c8cb095e` | ~$0.14 | Authorised extraction consumed |
| Additional authorised | **0 / 2** | Gate: app deploy + post-deploy validation |

## Staging deployment

| Layer | Status |
|-------|--------|
| Supabase migration `20261122121500` | **Applied** (`lhgzdicffkhaaykzthep`) |
| Vercel platform app | **Deployed** — `dpl_CsCGHbQPjCzZtEBLNHGvMWjp6UJ9` → https://staging-app.forgeniq.com |
| Publication preflight script | **Blocked** — `missing_credentials` without staging service role in env |

## UAT completion gates (not met)

- All regulatory accuracy defects resolved in live register  
- Positive binding + **E** paths on staging  
- Negative guidance / non-binding refusals exercised  
- Three triage queues verified post-fix  
- Maker-checker + tenant isolation re-verified  
- DB + audit reconcile  
- ≤2 paid extractions recorded with coverage  

## Next mandatory steps

1. **Browser regression on staging** (sessions A/B/C valid): RI-UI-006/008/001/002, editable obligation statement, CONC 7.20.1R(2) cross-page quote.  
2. **Remediate four OPEN PS26/1 obligations** with grounded statements (controlled path; preserve audit).  
3. **Preflight** (needs `SUPABASE_SERVICE_ROLE_KEY` for `staging-plan-fca-publications-readonly.mjs`) — PS22/9 candidate for **E**.  
4. **≤2 paid extractions** only after (1)–(3): record cost/coverage; RI-CLS-005 negatives + E + fail-closed checks.  
5. **Git:** worktree changes remain uncommitted; commit/push when you want CI-linked deploys.  

**FCA classification / extraction UAT is not complete.**