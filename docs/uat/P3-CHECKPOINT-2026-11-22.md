# P3 checkpoint — staging deploy + remaining paid gates

**Date:** 2026-11-22 (UTC)

## Completed without additional paid AI

| Item | Evidence |
|------|----------|
| Local regression (provision engine) | classification 116/116; eligibility 47/47; inventory 5/5; PS26 source 7/7; extraction engine 13/8/6 |
| Staging deploy (provision engine) | `dpl_HBUQgkWr4Eofg2ws1PtWjHRaevrY` → `staging-app.forgeniq.com`; `STAGING-P3-PROVISION-ENGINE-DEPLOY-2026-11-22.json` |
| Post-deploy verify | CONC `7.20.1R` pages **94, 95**; `2A.4.35E` page **126** — `STAGING-P3-PROVISION-ENGINE-VERIFY-2026-11-22.json` |
| P2 regression (19/19) | `STAGING-P2-REGRESSION-2026-11-22.json` |
| CONC 7.20.1R(2) on run `a06eb008` | Obligation `96dd98d9-ad1e-4549-8a74-a82591b94db1` — `TARGETED-PAID-EXTRACTION-TRANCHE-2026-11-22.json` |
| PS22 refusal (no link to `68051a63`) | API refuses review (quotation/binding validation) — `PS22-9-EVIDENTIAL-BINDING-CORRECTION-2026-11-22.json` |
| Simulated full publication (PS26/1) | `FULL-PUBLICATION-SIMULATED-P3-2026-11-22.json` |
| FRC suspension package | `REG-FRC-SUSPEND-CONVERSION-PROPOSAL-2026-11-22.json` — operator approval pending |

## Closed on staging (2026-11-22 PM)

- **Positive E:** run `3ed8c3e2` reviewed with authoritative **2A.4.34R** + **2A.4.35E** instrument quotes (p.126). DRAFT → OPEN: binding `2046ef71-f8b2-42f4-bdc4-3a1ec48b1b8a`, evidential `7143f1ff-c064-4123-bc2e-38e0102972df`; `supportsObligationId` = **2046ef71**, **not** `68051a63`.
- **Local commit** recommended for: autonomous rule, provision-engine hotfix, UAT scripts, PS22 fixture PDF, acceptance `acceptance-ri-provision-source-verification-ps22.mjs`.

## Remaining

- **Git commit/push** (local commit authorised; push only if requested).
- **PS22 simulated publication** may need higher `maxSteps` for 242 provisions (tuned in acceptance script).

## Explicitly not done

- Production deploy
- Additional paid extractions beyond the authorised tranche already consumed
- Multi-regulator ACTIVE policies (PRA/ICO/PSR) — research/docs only