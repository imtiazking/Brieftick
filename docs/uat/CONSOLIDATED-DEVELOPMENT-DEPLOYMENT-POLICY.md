# FORGENIQ — consolidated development and deployment policy

**Status:** Effective 2026-11-23  
**Scope:** `forgeniq-ri-classification` worktree, staging platform (`forgeniq-platform-staging`), autonomous agents  
**Not in scope:** Customer production (`brieftick` / `www.forgeniq.com`) without explicit approval

## 1. Batch development

Group related defects and improvements into coherent **tranches**.

For each tranche:

1. Identify related outstanding defects.
2. Investigate root causes.
3. Implement all related fixes locally.
4. Run unit and integration tests.
5. Run deterministic AI extraction tests using saved responses.
6. Validate database changes locally.
7. Run relevant regression and acceptance suites.
8. Resolve all local failures.
9. Commit the tested changes.
10. Deploy the consolidated tranche to **staging once**.

Do **not** deploy an individual fix because implementation completed.

## 2. Deployment frequency

- Target **maximum 1–3 staging deployments per day** during normal development.
- This is **not** permission to deploy unnecessary changes.

Deploy only when:

- A meaningful development milestone is complete.
- Local acceptance tests pass.
- Changes require **hosted** staging validation.
- The deployment has a **defined UAT objective**.

Exceptions: urgent security issues, outages, confirmed release-blocking problems.

Use `apps/platform/scripts/staging/phase85h-deploy-staging-platform.mjs` with deploy throttle; set `FORCE_STAGING_DEPLOY=1` only when tranche is ready.

## 3. Pre-deployment quality gates

Before deploying, verify locally:

- Build passes.
- TypeScript checks pass.
- Relevant regression suites pass.
- Migration validation passes.
- Provision extraction deterministic tests pass.
- Classification safeguards pass.
- No secrets in commit.
- No unrelated changes bundled.

Do not deploy known broken builds to discover failures detectable locally.

## 4. Staging UAT

After deployment:

- Execute the **planned** hosted test suite once.
- Capture results in `docs/eval/` and log in `docs/uat/EXECUTION-LOG.md`.
- Consolidate findings; fix defects **locally**.
- Group fixes into the **next tranche**.

Avoid immediately redeploying after each failed test.

Redeploy immediately only for critical issues that block essential validation or threaten data integrity.

## 5. Resource controls

Reduce Vercel Hobby usage:

- Consolidated deployments (see `docs/eval/VERCEL-RESOURCE-AUDIT-2026-11-23.md`).
- Fewer repeated hosted tests; prefer local and fixture-based tests.
- Local PDF processing where possible.
- Recorded AI-response fixtures.
- Cached provision evidence (org-scoped, revision-hash keys).
- Reduced API polling (exponential backoff in UAT runners).
- Reuse completed extraction results; no paid retries on failed runs.

Monitor CPU and deployment storage. **Do not delete deployments** without operator approval (`docs/eval/STAGING-DEPLOYMENT-CLEANUP-INVENTORY-*.json`).

## 6. Current workstreams

Apply batching before the next staging deploy:

| Workstream | Notes |
|------------|--------|
| PS22 batch 5 remediation | Deterministic acceptance before any paid hosted extraction |
| FCA accuracy | Local benchmark scripts; preserve PS26/1 and batches 0–4 evidence |
| SEC-DB-003 | Hosted blocked on `STAGING_DATABASE_URL`; local harness ready |
| Vercel CPU optimisation | Code in repo; deploy as part of resource tranche |
| Orchestration reliability | Spend-cap patch, suffix merge baseline |

## 7. Reporting

Deliver one **milestone report** per tranche (`docs/uat/MILESTONE-REPORT-*.md`):

- Issues resolved
- Tests passed
- Git commit
- Staging deployment (id/url if any)
- UAT results
- Outstanding issues
- Vercel usage impact (measured only; do not claim estimates as measurements)

## References

- Deploy safety: `docs/uat/VERCEL-DEPLOY-SAFETY.md`
- Cursor rule: `.cursor/rules/forgeniq-autonomous-execution.mdc`