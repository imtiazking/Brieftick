# RI-GROUND-PS26-001 — investigation (2026-11-27)

## Question

Was the FCA-EVAL-001 `bindingNature = consultation_proposal` defect still open at staging `8c58e2e`?

## Finding

| Layer | Status |
|---|---|
| Deterministic analyser (`regulatory-pdf-analysis-v2`) | **Fixed before Tranche D** — PS26/1 fixture: `consultationPreserved: false`, `documentLegalStatus: final_made_instrument`, CONC 7.20.1R commencement **2026-07-15** (`acceptance-ri-pilot-accuracy-hardening.mjs`) |
| FCA-EVAL-001 live pilot (2026-11-26) | **Historical** — ran with stale grounded context; evidence preserved unmodified in `live-ai-pilot-2026-11-26/` |
| FCA-EVAL-002 (2026-11-26) | **Passed acceptance criteria** with `consultationPreserved: false` in `stage1-run-raw.json` — not a regression |
| Ask RI PDF path | **Risk: cached `analysis` on revision** could retain stale `consultationPreserved: true`; mitigated by re-analyse when made instrument detected (`publication-pdf-evidence.mjs`) |
| Extraction guard | **Defence in depth added** — `resolvePublicationRegulatoryContext` forces `consultationPreserved: false` when `documentLegalStatus === final_made_instrument` or instrument `made` |

## Classification

- **Not** an outdated defect register entry alone — the register correctly described FCA-EVAL-001 symptoms.
- **Not** Ask-RI-only — same `regulatoryAnalysis` object feeds extraction and catalogue PDF answers.
- **Was** a publication-context construction defect in the **pre-v2** analyser; **FCA-EVAL-002 proves** extraction grounding on current code when live AI is authorised.
- **Remaining risk:** persisted revision metadata from older runs must not bypass fresh analysis (mitigated in Ask RI; extraction uses live `build-pdf-grounded-analysis-context` on each run).

## Regression evidence

- `acceptance-ri-pilot-accuracy-hardening.mjs` — PASS including stale-cache override check
- New: watchlists/consultations/citation/report acceptance suites in this tranche

No paid AI. No historical eval JSON modified.