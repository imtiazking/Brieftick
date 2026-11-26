# FORGENIQ — Final UAT corrections & live AI preparation report (2026-11-25)

## 1. Outstanding UAT defects resolved (this tranche)

| Defect | Resolution | Evidence |
| --- | --- | --- |
| Risk maker self-approve — no toast | Per-render bindings for `[data-connected-risk-action]` (mirror impact); `formatConnectedPatchError` surfaces server `message` / `segregation_of_duties` | `acceptance-design-lab-governance-patch-feedback.mjs` PASS; `acceptance-ri-governance-risk-sod.mjs` PASS (no DB mutation) |
| Assurance detail — no finding links | `renderAssuranceFindingLinks` + catalogue `linkedFindings` hydration | `acceptance-phase-8-step-85w-assurance-uat.mjs` `finding_nav` PASS |
| Stale risk/control detail after PATCH | `alwaysRevalidate` on `riskDetailsById` / `controlDetailsById` | Static acceptance + prebuild sync PASS |
| Server SoD | Unchanged — embedded test confirms `IN_REVIEW` after denied self-approve | `acceptance-ri-governance-risk-sod.mjs` |

**Hosted browser re-run:** execute `hosted-design-lab-stages-2-5.mjs` after staging promote of this tranche (expect `BROWSER-S3-SELF-APPROVE` PASS with segregation toast).

## 2. Staging & CI

| Item | Value |
| --- | --- |
| Prior green deployment | `dpl_6isCeKaCNMuAYR9PvCGfdSSXirPR` |
| Prior release commit | `9241298` |
| GitHub Actions | PASS (per handoff) |
| This tranche | Local gates + Design Lab bundle sync PASS; **candidate-first deploy pending/running** for UI fixes |

## 3. Live AI readiness (five stages)

See [LIVE-AI-READINESS-2026-11-25.md](./LIVE-AI-READINESS-2026-11-25.md).

- **Stage 1:** Live-capable (Anthropic/OpenAI) with budget guard.  
- **Stages 2–5:** Fixture-only in production code paths; disabling fixture does **not** invoke live providers yet.

## 4. Providers & models configured

- **Anthropic:** `claude-sonnet-4-5` default (`RI_ANTHROPIC_MODEL`).  
- **OpenAI:** `gpt-4o-mini` default (`RI_OPENAI_MODEL`).  
- **Fixture:** `fixture-ri` scenarios per stage.  
- **Mode:** `RI_AI_PROVIDER_MODE` (default `FIXTURE`).

## 5. Regulatory test cases

[eval/FCA-REGULATORY-EVAL-CASES-2026-11-25.md](./eval/FCA-REGULATORY-EVAL-CASES-2026-11-25.md) — CONC 7.20.1R primary; PS22/9 secondary; CONC 4.2A fixture baseline.

## 6. Evaluation methodology

Independent dual review; 0–2 rubric × 10 dimensions; hard fails on hallucinated citations/rules. Details in eval cases doc.

## 7. Estimated pilot cost

**$0.34–0.50** typical; **$0.75 USD ceiling** recommended. See [LIVE-AI-PILOT-BUDGET-2026-11-25.md](./LIVE-AI-PILOT-BUDGET-2026-11-25.md). **Awaiting explicit approval — no paid AI executed.**

## 8. Remaining limitations

- Downstream lifecycle stages lack live provider integration.  
- Staging lifecycle UAT obligation remains synthetic/fixture-backed.  
- Pilot requires downstream live wiring or UC-RI-005-only scope.  
- Anthropic spend guard enforced for UC-RI-005 only today.

## 9. Exact steps to execute live AI pilot

See [LIVE-AI-LIFECYCLE-PILOT-2026-11-25.md](./LIVE-AI-LIFECYCLE-PILOT-2026-11-25.md). Summary:

1. Approve `RI_LAB_ANTHROPIC_MAX_USD=0.75`.  
2. Enable execution flags on staging for pilot window only.  
3. Ship/wire live downstream providers OR scope pilot to Stage 1 + human stages.  
4. Run FCA-EVAL-001 through UC-RI-005 → review → OPEN.  
5. Continue lifecycle with checker approvals; capture telemetry pack.  
6. Disable execution; revert stage AI flags to `FIXTURE`.

## Synthetic UAT chain (reference IDs)

`b330fc90…` → `bfba3c56…` → `a483d450…` → `01319003…` → `122e9511…` (hosted evidence folder `docs/uat/evidence/compliance-lifecycle-2026-11-25/`).