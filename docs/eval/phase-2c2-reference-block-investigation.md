# Phase 2C.2 — False reference / pre-reasoner block investigation

**Date:** 2026-11-10  
**Prior defect:** V2 dry-run labelled several valid cases as `preReasonerBlock: invalid_or_unindexed_reference`.

---

## EVAL-B-01 — PRIN 2A.4

| Field | Detail |
|-------|--------|
| **Question** | Does PRIN 2A.4 create a binding fair value obligation for firms? |
| **Parsed tokens** | Handbook: `PRIN` (section `2A.4`); no CP/PS/FG structured ids |
| **Classification** | `fca_handbook` (not a publication identifier) |
| **Catalogue lookup** | N/A — handbook module |
| **Blocking condition (before)** | `handbook_source_not_indexed` → `blockSemanticSelection: true` |
| **Root cause** | `publication-reference-validation.mjs` treated any handbook token like a missing publication |
| **Corrected behaviour** | `outcome: handbook_open_retrieval`, retrieval proceeds; sufficiency from indexed evidence only |
| **Expected retrieval** | Open hybrid search over B2 corpus (fair value HTML + FG22 PDF likely candidates) |

---

## EVAL-D-02 — CP26/38 AML monitoring

| Field | Detail |
|-------|--------|
| **Parsed tokens** | `CP26/38`; domain acronym `AML` |
| **Classification** | `publication_structured` (resolved indexed) + AML (non-regulator topic) |
| **Catalogue lookup** | `CP26/38` → `4d05b49b-a4a4-4101-8c87-7d3983315f25` |
| **Blocking condition (before)** | Authority gate: `unsupported_regulator_in_question` on token `AML` |
| **Root cause** | `ri-entity-catalog.js` heuristic treated uppercase acronyms in “what does …” questions as unknown regulators |
| **Corrected behaviour** | AML in allowlist of non-regulator acronyms; CP26 restriction retained |
| **Expected retrieval** | Hybrid retrieval restricted to CP26/38 packs |

---

## EVAL-G-02 — FG22/5 + fair value webpage

| Field | Detail |
|-------|--------|
| **Parsed tokens** | `FG22/5` (×2 structured mentions); optional title phrases |
| **Classification** | `publication_structured` resolved; format token `PDF` (non-regulator) |
| **Catalogue lookup** | `FG22/5` → FG22 PDF publication id |
| **Blocking condition (before)** | Authority gate blocked token `PDF` |
| **Root cause** | Same acronym heuristic as D-02 |
| **Corrected behaviour** | PDF allowlisted; multiple structured refs → `restrict_multiple_publications` when distinct ids resolve |
| **Expected retrieval** | Multi-publication hybrid pool (FG22 PDF + fair value HTML when semantically ranked) |

---

## EVAL-B-03 — COBS suitability (control negative)

| Field | Detail |
|-------|--------|
| **Parsed tokens** | Handbook module `COBS` |
| **Classification** | `fca_handbook` |
| **Blocking condition (before)** | Authority gate on `COBS` acronym |
| **Root cause** | Handbook module mistaken for unknown regulator short name |
| **Corrected behaviour** | `handbook_open_retrieval`; no fabricated COBS text from corpus |
| **Expected retrieval** | Retrieval runs; **insufficient evidence** when no COBS handbook pack indexed (correct reason) |

---

## EVAL-I-01 — PS99/99 (unchanged reject)

| Field | Detail |
|-------|--------|
| **Parsed tokens** | `PS99/99`, Policy Statement title phrase |
| **Classification** | `publication_structured` + `publication_title` |
| **Catalogue lookup** | Not in offline catalogue |
| **Blocking condition** | `unresolved_explicit_publication_reference` |
| **Root cause** | Expected — fabricated PS |
| **Corrected behaviour** | Still `blockSemanticSelection: true` (`reference_validation`) |

---

## EVAL-J-03 — Fabricated UUID (unchanged reject)

| Field | Detail |
|-------|--------|
| **Parsed tokens** | UUID `00000000-0000-4000-8000-000000000001` |
| **Classification** | `publication_uuid` |
| **Catalogue lookup** | `uuid_not_in_offline_catalogue` |
| **Blocking condition** | `unresolved_explicit_publication_reference` |
| **Root cause** | Expected — misleading UUID |
| **Corrected behaviour** | Still blocked at reference validation |

---

## EVAL-G-04

Unchanged: **tenant eligibility** block before any provider call (`TENANT_CONTEXT_REQUIRED`).
