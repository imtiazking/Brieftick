# Remaining engineering defects (vs external blockers)

**Updated:** 2026-11-27T04:15Z · staging **`8c58e2e`**

## Resolved (Tranche D closure)

| ID | Evidence |
|---|---|
| ENG-LINEAGE-001 | `regulatoryTrace` API + hosted lineage UAT; MOCI `NONE`, FCA `TENANT_CHANGE` |
| ENG-CRON-001 | `vercel-cron-2026-11-27/RESULT.json` — `VERCEL_CRON` @ 04:00:24 UTC |
| ENG-A11Y-001 | `acceptance-accessibility.mjs` PASS; ops suite PASS |
| ENG-OPS-002 | `load-baseline-2026-11-27/RESULT.json` |
| OPEN-007 | Staging RPC includes `reviewer_stage2_content_forbidden`; `RI-OBLIGATION-OPEN-ATOMIC` in promote gate |

## Remaining engineering

| ID | Sev | Item | Next step |
|---|---|---|---|
| ENG-OPS-001 | Medium | Isolated restore drill | Authorised Supabase branch restore — see `BACKUP-VERIFICATION-2026-11-27.md` |
| OPEN-009 | Medium | DEF-011 intermittent assurance loading | Monitor diagnostics on recurrence |

## External blockers (unchanged)

OPEN-002 regulatory expert · OPEN-003 cross-tenant · OPEN-005 classification policies · OPEN-006 external notifications · production/commercial/security gates — see `GO-LIVE-CHECKLIST.md`.