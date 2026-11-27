# Tranche G2 post–connector-acceptance — consolidated completion report

**Generated:** 2026-11-27T21:30Z  
**Staging baseline:** `fe027e8` / `dpl_7q6UCoGHTmncvgUw7TgL96Yh6kG5`  
**In-flight deploy:** `4dfe3d5` (G2 corpus loop fix + backfill telemetry)

---

## Classification legend

| Class | Meaning |
|-------|---------|
| **CONFIRMED_DEFECT** | Root-caused bug; fix committed where stated |
| **INCOMPLETE_EXECUTION** | Work started; objective not fully evidenced yet |
| **EXPECTED_SECURITY_RESTRICTION** | Policy/by design; not a product bug |
| **EXTERNAL_RESTRICTION** | Missing local credentials, cron wall-clock, or vendor auth |
| **OPTIONAL_ENHANCEMENT** | Out of current programme scope |

---

## 1. G2 corpus resume

| Item | Status | Class |
|------|--------|-------|
| Resume ~119 eligible publications | **IN PROGRESS** — single loop session `442525`, evidence `CORPUS-BACKFILL-LOOP-RESUME.json`, max **130** ticks | INCOMPLETE_EXECUTION |
| No duplicate loops | **MET** — prior loop ended; one resume only | — |
| Process until eligible done or terminal documented | **PARTIAL** — terminal codes incl. `SOURCE_NOT_APPROVED`, `NO_PDF_ATTACHMENT`; policy in allowlist | INCOMPLETE_EXECUTION |

**Coverage (staging SQL):** **322** publications · **203** with `regulatory_source_snapshots` · **~119** still eligible without snapshot (matches last loop tick).

---

## 2. Loop exit at 85/200 — investigation

| Finding | Detail |
|---------|--------|
| **Root cause** | `tranche-g-corpus-backfill-loop.mjs` broke when `remainingWithoutSnapshot (119) <= terminal_excluded (121)` |
| **Classification** | **CONFIRMED_DEFECT** — not ingestion regression |
| **Fix** | Removed errant break; documented in `TRANCHE-G2-LOOP-EXIT-RCA.md` |
| **Commit** | `4dfe3d5` |

---

## 3. PDF / terminal / queue-order fixes

| File | Change |
|------|--------|
| `pdf-primary-backfill.mjs` | `detail` from `message` (diagnostic clarity) |
| `corpus-failure-tracking.mjs` | Terminal codes `NO_PDF_ATTACHMENT`, `SOURCE_NOT_APPROVED` |
| `select-backfill-candidates.mjs` | Prefer PDF queue rows with attachments |

**Tests:** promote gate **56/56 PASS** on retry after flaky terminal-browser timeout (**1st attempt FAIL = transient**).  
**Deploy:** `phase85h-deploy-staging-platform.mjs` running for `4dfe3d5`.

---

## 4. Live corpus evidence export & retrieval eval

| Activity | Result | Class |
|----------|--------|-------|
| `export-eval-evidence-packs-readonly.mjs` | **Frozen core packs preserved** (4 offline fixtures); staging path **skipped** | EXTERNAL_RESTRICTION |
| Reason | `SUPABASE_SERVICE_ROLE_KEY` / `STAGING_DATABASE_URL` **not loaded** in agent shell (`.env.local` empty for these keys) | EXTERNAL_RESTRICTION |
| `tranche-g-ask-ri-retrieval-eval.mjs` | Re-run **2026-11-27T21:27Z**: **0 PASS / 41 FAIL / 4** correct insufficient (deterministic, frozen packs) | INCOMPLETE_EXECUTION (corpus gap, not connector regression) |

**Fable note:** Re-export requires service-role on a trusted workstation; do not overwrite frozen packs without deliberate promotion.

---

## 5. Connectors (accepted programme — no rework)

| Metric | Value |
|--------|------:|
| Enabled | **40/42** |
| Operational (last success) | **39** |
| Matrix | `CONNECTOR-OPERATIONAL-VERIFICATION-MATRIX.json` |

### eCFR (`SRC-ECFR-TITLE-12`)

| Check | Status |
|-------|--------|
| DB seeded + ops enabled | Yes |
| Connector on staging (`fe027e8+`) | Yes |
| `last_success_at` / publications | **No** — awaits scheduled ingest | INCOMPLETE_EXECUTION |

### OPEN-001 (unattended `VERCEL_CRON`)

| Check | Status |
|-------|--------|
| 2026-11-27 cron | `due=0` (documented) |
| Staging `due_now` before mass rollover | **1** (eCFR) |
| **2026-11-28 04:00 UTC** capture | **SCHEDULED** — `capture-open-001-vercel-cron.mjs` background session `442526` | INCOMPLETE_EXECUTION |

---

## 6. Optional / external (not blocking RI programme)

| Item | Class |
|------|-------|
| Commercial MCP runtime (RegAlert, Ansvar OAuth) | OPTIONAL_ENHANCEMENT + EXTERNAL_RESTRICTION |
| EUR-Lex / CELLAR, UK Gov Lex API, FCA Handbook JSON | OPTIONAL_ENHANCEMENT |
| PDF primary beyond FCA allowlist | EXPECTED_SECURITY_RESTRICTION |

---

## 7. Fable handover pointer

Updated: `docs/uat/evidence/production-readiness/ASK-RI-DEVELOPMENT-HANDOVER.md` (staging refs, corpus resume, OPEN-001, eval export blocker).

---

## Outstanding (ordered)

1. Let **corpus resume** loop complete (~1–1.5 h at 25 s cooldown).  
2. Confirm **deploy `4dfe3d5`** promoted + auth smoke.  
3. After **2026-11-28 04:00 UTC**, verify `open-001-vercel-cron-2026-11-28.json` + eCFR ingest.  
4. Re-run eval after **authorised** live pack export (optional uplift, not connector work).