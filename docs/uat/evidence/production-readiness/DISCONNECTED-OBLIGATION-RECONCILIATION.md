# Disconnected obligation reconciliation (Tranche C → D)

**As at:** 2026-11-27T02:20Z · staging deployment **`33d0912`** (`dpl_9z7z4Q5aNA4UVBwyxxN2GjgvKHHK`)

## Original claim vs scope

| Narrative | Count | Actual scope |
|---|---|---|
| “11 synthetic disconnected” (early audit) | 11 | Mixed tenants; included **7 legacy OPEN rows** in main FORGENIQ org (`cd25bb17-…`) that were never in the AI-dev repair programme |
| **AI-dev pilot repair** (`hosted-repair-disconnected-synthetic-uat.mjs`) | **10** | `b8f5e3a1-00ad-4000-8000-000000000001` — all transitioned `DISCONNECTED` → **LINKED** via maker/checker OPEN recovery |
| **Preserved without change** | **8** | By policy (no bulk backfill, no partner edit without approval) |

## Current staging truth (`obligation_stage2_integrity.stage2_state = DISCONNECTED`)

| Organisation | Count | Notes |
|---|---|---|
| `cd25bb17-d575-4109-8432-4b63c75f9617` (main FORGENIQ) | **7** | Legacy UAT / manual obligations — **preserved** |
| `4d871541-e0d4-4581-828d-72073f763f85` (partner) | **1** | `b8f5e3a1-0021-4000-8000-000000000001` · `_uat_label` **UAT-PARTNER** — **not modified** (awaiting owner decision) |
| AI-dev (`b8f5e3a1-00ad-4000-8000-000000000001`) | **0** | All former pilot synthetics repaired |

## Partner obligation (read-only investigation)

- **Id:** `b8f5e3a1-0021-4000-8000-000000000001`
- **Purpose:** Internal partner-isolation / interpretation test row; explicitly labelled synthetic, not regulator-issued.
- **Disposition:** Remains `DISCONNECTED` until product/security authorises repair or retirement. No data mutation in Tranche D.

## Evidence

- Repair run: `docs/uat/evidence/repair-disconnected-2026-11-27/`
- Hosted Stage 2 security regression: PASS after create (201)
- SQL source: Supabase staging `obligation_stage2_integrity` join (2026-11-27)