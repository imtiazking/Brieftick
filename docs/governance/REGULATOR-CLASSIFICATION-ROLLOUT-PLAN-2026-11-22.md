# Regulator classification rollout plan

**Status:** Draft for governance review — no automatic activation on staging beyond REG-FCA.

## Principles

1. Each regulator policy is validated against **authoritative instrument taxonomy**, not a copy of FCA Handbook markers.
2. Unverified policies remain **fail-closed** (404 on `classification-policies` API for inactive regulators — verified on staging P2).
3. Conversion enabled only after SME sign-off, isolated acceptance tests, and operator approval record.

## Regulators

| Regulator | Draft artefact | Legal basis (authoritative) | FCA duplication? | Activation gate |
|-----------|----------------|----------------------------|------------------|-----------------|
| REG-FCA | Active on staging | FCA Handbook rules, PS/FG instrument text | N/A (baseline) | Complete |
| REG-PRA | `REG-CLASSIFICATION-POLICY-DRAFTS-UNVERIFIED.json` | PRA Rulebook, supervisory statements | **No** — PRA SS/R distinction, BCR/IFPR markers | SME + operator |
| REG-ICO | same | UK GDPR, DPA 2018, ICO guidance hierarchy | **No** — statutory vs guidance articles | SME + operator |
| REG-PSR | same | PSRs 2017, FCA payment services handbook where applicable | Partial overlap with FCA but **PSR-specific** instrument routing | SME + operator |
| REG-FRC | `REG-FRC-POLICY-AUDIT-2026-11-22.json` + suspension proposal | FRC Standards, AGN, corporate governance codes | **No** — accounting/audit standards taxonomy | Operator suspension decision first |

## FRC — operator approval (mandatory)

- Package: `docs/eval/REG-FRC-SUSPEND-CONVERSION-PROPOSAL-2026-11-22.json`
- Audit: `docs/eval/REG-FRC-POLICY-AUDIT-2026-11-22.json`
- Required action: independent operator session to confirm all FRC codes remain non-convertible until descriptions sourced from FRC taxonomy.

## Rollout sequence (remaining sources)

1. **FCA extraction maturity** — live pilot readiness (`LIVE-FULL-PUBLICATION-EXTRACTION-PILOT-READINESS-2026-11-22.json`) before widening regulators.
2. **PRA** — import Rulebook provision markers; pilot on one SS with binding R only.
3. **PSR** — align with payment services instrument pages; shared FCA PDF pipeline only where source is FCA-hosted.
4. **ICO** — separate guidance URL ingest; article/section references instead of Handbook cores.
5. **FRC** — suspend conversion; replace synthetic staging descriptions; enable read-only triage only.

## Evidence

- Staging fail-closed: `staging-p2-regression.mjs` checks REG-ICO / REG-PSR / REG-PRA 404.
- Draft policies: `docs/eval/REG-CLASSIFICATION-POLICY-DRAFTS-UNVERIFIED.json`