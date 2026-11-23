# Vercel deploy safety (FORGENIQ)

## Authorised staging

| Field | Value |
| --- | --- |
| Project name | `forgeniq-platform-staging` |
| Project ID | `prj_y9O1A1zGFXe3GvJITnLL9mJUqve7` |
| Team | `imis-projects-8e15dca0` |
| App root | `apps/platform` |
| Production branch (staging project) | `production/ri-golden-master` |
| Customer URL | `https://staging-app.forgeniq.com` |

## Live production (do not deploy from agent)

| Surface | Typical Vercel project | Notes |
| --- | --- | --- |
| `www.forgeniq.com` | Root `brieftick` static / MI | Not `apps/platform` |
| RI production | Separate golden-master flow | Not feature branches |

## Incident 2026-11-23 — stray project `platform`

**Cause:** Autonomous agent ran `vercel deploy` from `apps/platform` without `--project=forgeniq-platform-staging`. Vercel **created** project `platform` (`prj_ZqJgzCO1p2SpfNJPgqacKvPbEDHj`) and attached **GitHub** `imtiazking/Brieftick`. Push to `feature/ri-classification-triage` (`0983c8a`) triggered a **Production** Git deployment on that project (not on `forgeniq-platform-staging`).

**Build failure:** Git build used **repository root** with `buildCommand: npm run build`; root `package.json` has **no `build` script** → `npm error Missing script: "build"`.

**Customer impact:** **None** — deployment status **Error**; aliases only on `*.vercel.app` for `platform`, not `www.forgeniq.com` or `staging-app.forgeniq.com`.

**Operator actions (manual, required once):**

1. Vercel → project **`platform`** → **Settings → Git** → **Disconnect** (or delete the stray project).
2. Confirm **`forgeniq-platform-staging`** remains the only Git-linked Next.js RI project with root directory `apps/platform`.
3. Never link `apps/platform/.vercel` to any project other than `forgeniq-platform-staging`.

## Agent / CLI rules

- **Never** run bare `vercel deploy` from `apps/platform` without `--project=forgeniq-platform-staging`.
- **Prefer** `node apps/platform/scripts/staging/phase85h-deploy-staging-platform.mjs` from authorised commits — **once per development tranche**, not after every fix (see `CONSOLIDATED-DEVELOPMENT-DEPLOYMENT-POLICY.md`).
- Target **1–3 staging deploys per day** in normal development.
- Run `node apps/platform/scripts/staging/assert-vercel-staging-target.mjs` before any custom deploy.
- **No production** deploy to www / customer tenants without explicit user approval.