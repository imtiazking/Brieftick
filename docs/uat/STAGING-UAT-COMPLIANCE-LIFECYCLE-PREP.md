# Consolidated staging UAT — five-stage compliance lifecycle

**Status:** Preparation complete (local). **Baseline commit:** `f89b8f5` + audit fix (reopen/re-close). Prep migration `20261125200000` on branch, not yet deployed.  
**Policy:** [`CONSOLIDATED-DEVELOPMENT-DEPLOYMENT-POLICY.md`](CONSOLIDATED-DEVELOPMENT-DEPLOYMENT-POLICY.md) — **one** controlled deploy when gates and capacity allow.

---

## 1. Release manifest

| Item | Value |
|------|--------|
| **Branch** | `feature/ri-classification-triage` |
| **Local baseline** | `f89b8f56ec390ec29d7eb5521909786e8f2956f5` |
| **Ahead of remote** | 6 commits + audit fix (push required before hosted UAT) |
| **Offline CI** | 25/25 PASS (`npm run qa --mode=ci`) |
| **Scope** | Stages 1–5 compliance lifecycle + assurance execution + evidence integrity |

### Implementation commits (lifecycle tranche)

| SHA | Summary |
|-----|---------|
| `5d0f2f1` | Stage 2: obligation OPEN → DRAFT impact (UC-RI-004 fixture) |
| `444e225` | Stages 3–5: impact → risk → control → assurance plan orchestration |
| `830d1ab` | Assurance execution; guarded lifecycle closure (not plan-approve) |
| `b595cc9` | Minor assurance cleanup |
| `f89b8f5` | Evidence binding, closure hardening, governance security matrix |

### Acceptance gates (offline, mapped to hosted UAT)

| ID | Command | Hosted relevance |
|----|---------|------------------|
| `RI-STAGE2-OBLIGATION-IMPACT` | `acceptance-ri-stage2-obligation-to-impact.mjs` | Stage 2 API + DB |
| `RI-COMPLIANCE-LIFECYCLE-E2E` | `acceptance-ri-compliance-lifecycle-e2e.mjs` | Full happy path |
| `RI-ASSURANCE-LIFECYCLE-GAPS` | `acceptance-ri-assurance-lifecycle-gaps.mjs` | Fail / remediate / retest |
| `RI-ASSURANCE-GOVERNANCE-SECURITY` | `acceptance-ri-assurance-governance-security.mjs` | SoD, evidence, RLS, idempotent close |

### Promote pipeline (mandatory order)

1. **CI** — offline 25 gates  
2. **Candidate** — `verify-candidate-deployment.mjs` on `candidate-staging.forgeniq.com`  
3. **Authenticated** — `staging-design-lab-authenticated-smoke.mjs` + lifecycle UAT (this plan)  
4. **Security** — hosted RLS probes as applicable  

`npm run qa --mode=promote` enforces candidate + authenticated; **do not skip candidate-first.**

---

## 2. Test accounts (preserve sessions — do not re-login unless EXPIRED)

| Persona | Role (staging) | Clerk user (staging) | Use in lifecycle UAT |
|---------|----------------|----------------------|----------------------|
| **A** | COMPLIANCE_MANAGER (maker) | `user_3LA76vR4CueutWtEpcAxvqYKkEv` | Create/submit impact, risk, control, record tests, upload evidence |
| **B** | REVIEWER | `user_3Fa9TcFi8izkxHdDP58Qb3UY4mr` | AI review where applicable; **not** lifecycle approver |
| **C** | COMPLIANCE_MANAGER (checker) | `user_3LBBtwYR4mmFisfpzMj3n7DVtVh` | Obligation OPEN, impact/risk/control/assurance **approve**, independent closure |

- **Organisation:** `b8f5e3a1-00ad-4000-8000-000000000001` (FORGENIQ AI Development)  
- **Session profiles:** `%LOCALAPPDATA%\forgeniq-uat-sessions\` (+ host-scoped under `candidate-staging_forgeniq_com\`)  
- **Status (2026-11-25):** A/B/C **VALID** on staging and candidate (`SESSION-RECOVERY.json`, `staging-user-sessions.mjs status`)  
- **Runner:** `node scripts/uat/staging-user-sessions.mjs` — **do not** run `logout` or overwrite profiles.

---

## 3. Database migration plan (staging apply — **not executed in this prep**)

Apply **in timestamp order** on staging Supabase after backup/snapshot. All are **additive** unless noted.

| Migration | Purpose | Depends on | Rollback |
|-----------|---------|------------|----------|
| `20261125180000_stage2_impact_per_obligation_unique.sql` | Unique Stage-2 impact per source obligation | `impact_assessments` | Drop unique index (may allow duplicates) |
| `20261125194500_compliance_lifecycle_stages_3_5.sql` | `impact_assessment_risk_links` + unique keys stages 3–5 | risks, controls, assurance_reviews | Drop table/indexes (orphan links) |
| `20261125200000_impact_assessment_risk_links_rls.sql` | **RLS for new link table** (staging blocker fix) | `20261120140000_ri_role_aware_rls.sql`, table above | Drop policies / disable RLS |

**Tenant isolation:** Existing link tables use `organisation_id` + `is_active_member` / `ri_has_min_role`. The new link table lacked RLS until `20261125200000`; **apply that migration before hosted cross-tenant tests.**

**No destructive DDL** in this tranche. Rollback strategy: restore DB snapshot; redeploy previous platform SHA.

Validate locally before apply: `applyAllMigrations` in embedded harness (CI already runs schema gates).

---

## 4. Evidence provenance (verification)

| Rule | Implementation |
|------|----------------|
| Locked evidence not rewritten | `bindEvidenceForAssuranceTest` throws `assurance_evidence_provenance_mismatch` if `labProvenanceLocked` and class mismatch |
| Unlocked evidence | Lineage **copied from control** via `buildLockedChildMetadataFromParentRecord` only for **metadata** lab fields — not obligation statement / PDF / source URLs |
| Wrong control | `assurance_evidence_wrong_control` if already linked to another control |
| Closure | `validateAssuranceEvidenceIntegrity` requires control link, binding to assurance review, tenant match |
| Create with control | `resolveEvidenceCreateMetadata` inherits locked control lineage for lifecycle controls |

**Original source documents** (publication, obligation text, evidence `source_url` / versions) are **not** modified by lifecycle binding.

---

## 5. Reopen / re-close audit (verification)

- `workflow_events` remain **append-only** (no deletes on reopen).  
- **Reopen:** `COMPLIANCE_LIFECYCLE_REOPENED` on **assurance_review** and **regulatory_obligation**; clears independent closure fields in metadata only.  
- **Re-close:** New `ASSURANCE_CLOSED` plus a **new** obligation `COMPLIANCE_LIFECYCLE_CLOSED` keyed by `lifecycle_close:{assuranceId}:{lifecycleReopenedAt|initial}` — duplicate `close_lifecycle` on an already-closed assurance is idempotent (no extra events).  
- Verified offline: `acceptance-ri-assurance-governance-security.mjs` (idempotent close, reopen audit on obligation, premature close after reopen blocked, retest + second close emits **two** distinct close events).

---

## 6. End-to-end UAT script (Design Lab + `/api/ri-lab/*`)

**Entry:** User **C** sets test obligation OPEN → downstream automation (fixture AI on staging unless live pilot authorised).

| Step | Stage | Actor | Design Lab / API | Pass criteria |
|------|-------|-------|------------------|---------------|
| 1 | Obligation approved | C | `#/obligation/{id}`, lifecycle panel | Status OPEN; panel shows Stage 1 |
| 2 | Impact draft | System + A | `#/assessment/{id}` | DRAFT impact; UC-RI-004 fixture or live if authorised |
| 3 | Impact approved | A submit, C approve | PATCH impact | APPROVED; `STAGE3_RISK_MAPPING_READY` |
| 4 | Risk draft/approve | A/C | `#/risk/{id}` | APPROVED risk; control draft exists |
| 5 | Control approve | A/C | `#/control/{id}` | ACTIVE; assurance plan `NOT_TESTED` |
| 6 | Assurance plan | A/C | `#/assurance/{id}`, execution panel | `TESTING_READY` after approve (not closed) |
| 7 | Evidence + test | A | Create evidence (control-linked), `record_test` PASS | Bindings + control link visible |
| 8 | Independent closure | C | `close_lifecycle` | `COMPLIANCE_LIFECYCLE_CLOSED` on obligation |
| 9 | Lifecycle panel | All | Obligation detail | Stage shows **Closed**; links navigable |

**Negative matrix (hosted or repeat offline evidence):**

| Case | Expected |
|------|----------|
| Self-approval assurance plan | `segregation_of_duties` |
| Close before test | `premature_compliance_lifecycle_closure` |
| Unrelated evidence | `assurance_evidence_wrong_control` |
| Cross-tenant read (B vs Org A data) | RLS 0 rows / API 404 |
| Duplicate close | Idempotent assurance row; single close event per closure epoch |
| Reopen + re-close | Two obligation close events; one reopen on obligation |
| Stale PATCH | `stale_record` |
| Open finding without exception | `assurance_closure_blocked` |

**Automation after deploy:** extend `staging-user-sessions.mjs` scenarios or manual checklist above; capture screenshots under `docs/uat/evidence/compliance-lifecycle-{date}/`.

---

## 7. Live AI validation (scenarios only — **not authorised to run**)

Staging defaults: `FORGENIQ_STAGE*_AI=FIXTURE` / `RI_AI_PROVIDER_MODE=FIXTURE`. Offline CI **does not** prove live model accuracy.

| Use case | Stage | Est. calls / lifecycle | Indicative cost (Sonnet-class, grounded) |
|----------|-------|--------------------------|------------------------------------------|
| UC-RI-004 | Impact suggestion | 1 | ~$0.05–0.20 |
| UC-RI-006 | Risk mapping | 1 | ~$0.08–0.25 |
| UC-RI-007 | Control mapping | 1 | ~$0.08–0.25 |
| UC-RI-008 | Assurance plan | 1 | ~$0.08–0.25 |
| **Total per full lifecycle** | | **4** | **~$0.30–1.00** (order-of-magnitude; input size dependent) |

**Authorisation required** before any paid run (per autonomous-execution policy). Recommended pilot: **one** obligation, compare fixture vs live output in staging only, no batch re-runs.

---

## 8. Vercel / hosting capacity

| Check | Result |
|-------|--------|
| Last audit (reference only) | `docs/eval/VERCEL-RESOURCE-AUDIT-2026-11-23.md` — do **not** use stale CPU snapshot for go/no-go |
| Policy | **No deploy** while quota constrained; batch **one** deploy per tranche |
| Fresh quota (2026-11-25) | Vercel MCP `list_projects` empty (auth/scope); no fresh Fluid CPU reading captured this session |
| **Conclusion** | Treat hosting restriction as **still unresolved** — confirm dashboard headroom immediately before the authorised deployment window |

**Before deploy:** confirm dashboard headroom; set `FORCE_STAGING_DEPLOY=1` only with defined UAT objective; use `phase85h-deploy-staging-platform.mjs` + candidate-first.

---

## 9. Outstanding blockers

| # | Blocker | Mitigation |
|---|---------|------------|
| 1 | Branch **not pushed** (6 + audit fix local) | `git push` triggers **GitHub Actions only** (`forgeniq-qa.yml`); Vercel may post preview build/check — **does not** alias staging per prior evidence |
| 2 | Staging migrations **not applied** | Apply `25180000`, `25194500`, `25200000` after backup |
| 3 | `impact_assessment_risk_links` RLS | Included in `20261125200000` (prep commit) |
| 4 | Vercel Hobby CPU/storage | Defer deploy until quota OK |
| 5 | Live AI | Optional post-fixture UAT; explicit budget approval |
| 6 | Deferred link recovery UI | Closure blocked server-side; manual link retry in Lab if `LIFECYCLE_LINK_DEFERRED` |

---

## 10. Readiness statement

**Local development baseline accepted:** `f89b8f5` — 25/25 offline QA, full lifecycle with guarded closure and evidence integrity.

**Ready for one controlled staging deployment when:**

1. Remote branch includes lifecycle + prep RLS migration  
2. Staging DB migrations applied and verified  
3. Vercel capacity acceptable  
4. `npm run qa --mode=promote` passes (candidate + authenticated)  
5. Hosted UAT executed per Section 6 with Users A/B/C **without** invalidating saved sessions  

**Not in scope for this tranche:** production promotion, paid AI batch runs, new feature development.