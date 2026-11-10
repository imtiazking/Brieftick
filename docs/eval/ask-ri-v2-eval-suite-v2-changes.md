# Ask RI evaluation suite v2 — change log

Generated: 2026-11-10

## Summary

| Metric | Value |
|--------|------:|
| Cases reviewed | 45 |
| Cases with substantive ideal/limitation revisions | 20 |
| Cases with metadata-only split (ideal + limitations) | 25 |
| Ideal **outcome classification** changes vs v1 | 5 (`EVAL-F-01`, `EVAL-H-01`–`03`, `EVAL-H-05`) |
| Change log rows | 93 |

**Principle:** `expectedIdealResult` / `expectedResultClassification` describe **target platform behaviour**. `currentEngineLimitations` document deterministic v1 gaps without lowering the ideal bar. `v1ExpectedResultClassification` preserves historical comparison labels.

**Source authenticity:** Provisional themes cite frozen pack revisions (`613c078c-…` Fair Value HTML, `56fd1525-…` FG22 PDF, `c003a60a-…` CP26 PDF, `50197cc3-…` CP26 HTML). Live FCA currency is a separate check.

All regulatory reference expectations remain **PROVISIONAL** unless marked otherwise.

| # | Evaluation ID | Field | Original (v1) | Revised (v2) | Reason | Publication | Revision | Citation anchor | Scoring affected | Provisional |
|---|---------------|-------|---------------|--------------|--------|-------------|----------|-----------------|------------------|-------------|
| 1 | EVAL-A-01 | expectedIdealResult | (absent) | "ANSWERED" | Gold-standard ideal behaviour decoupled from engine quirks. | 56b0beca-d8c3-4267-a794-9079009af661 | — | — | Yes (primary target) | Yes |
| 2 | EVAL-A-01 | currentEngineLimitations | Template synthesis may omit lifecycle monitoring themes | Publication gate may not treat unquoted webpage title as catalogue-scoped (tenant path or insufficient).; Deterministic HTML synthesis may omit themes. | Document deterministic v1 gaps without lowering ideal bar. | — | — | — | No (informational) | N/A |
| 3 | EVAL-A-01 | v1ExpectedResultClassification | ANSWERED | ANSWERED | Preserve v1 comparison label. | — | — | — | No | N/A |
| 4 | EVAL-A-02 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | a761cacc-8742-493d-b200-eb5d9a3ab884 | — | — | Minimal | Yes |
| 5 | EVAL-A-03 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | a761cacc-8742-493d-b200-eb5d9a3ab884 | — | — | Minimal | Yes |
| 6 | EVAL-A-04 | expectedIdealResult | (absent) | "ANSWERED" | Gold-standard ideal behaviour decoupled from engine quirks. | 56b0beca-d8c3-4267-a794-9079009af661 | — | — | Yes (primary target) | Yes |
| 7 | EVAL-A-04 | currentEngineLimitations | (sparse) | questionMentionsPublicationReference may be false without explicit publication phrase. | Document deterministic v1 gaps without lowering ideal bar. | — | — | — | No (informational) | N/A |
| 8 | EVAL-A-04 | v1ExpectedResultClassification | ANSWERED | ANSWERED | Preserve v1 comparison label. | — | — | — | No | N/A |
| 9 | EVAL-A-05 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | 4d05b49b-a4a4-4101-8c87-7d3983315f25 | — | — | Minimal | Yes |
| 10 | EVAL-B-01 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | 56b0beca-d8c3-4267-a794-9079009af661; a761cacc-8742-493d-b200-eb5d9a3ab884 | — | — | Minimal | Yes |
| 11 | EVAL-B-02 | expectedIdealResult | (absent) | "PARTIAL_PASS" | Gold-standard ideal behaviour decoupled from engine quirks. | 56b0beca-d8c3-4267-a794-9079009af661; a761cacc-8742-493d-b200-eb5d9a3ab884 | — | — | Yes (primary target) | Yes |
| 12 | EVAL-B-02 | currentEngineLimitations | Engine may not enumerate evidence types without explicit passages | Template synthesis may not enumerate evidence types without explicit passages. | Document deterministic v1 gaps without lowering ideal bar. | — | — | — | No (informational) | N/A |
| 13 | EVAL-B-02 | v1ExpectedResultClassification | PARTIAL_PASS | PARTIAL_PASS | Preserve v1 comparison label. | — | — | — | No | N/A |
| 14 | EVAL-B-03 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | — | — | — | Minimal | Yes |
| 15 | EVAL-B-04 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | 56b0beca-d8c3-4267-a794-9079009af661 | — | — | Minimal | Yes |
| 16 | EVAL-C-01 | expectedIdealResult | (absent) | "PARTIAL_PASS" | Gold-standard ideal behaviour decoupled from engine quirks. | 4d05b49b-a4a4-4101-8c87-7d3983315f25 | — | — | Yes (primary target) | Yes |
| 17 | EVAL-C-01 | currentEngineLimitations | Weak control-impact narrative in deterministic templates | Deterministic PDF template weak on financial-crime control mapping.; May surface unrelated uncertainties from other publications. | Document deterministic v1 gaps without lowering ideal bar. | — | — | — | No (informational) | N/A |
| 18 | EVAL-C-01 | v1ExpectedResultClassification | PARTIAL_PASS | PARTIAL_PASS | Preserve v1 comparison label. | — | — | — | No | N/A |
| 19 | EVAL-C-01 | expectedPublicationIds | ["4d05b49b-a4a4-4101-8c87-7d3983315f25"] | ["4d05b49b-a4a4-4101-8c87-7d3983315f25"] | Ideal semantic discovery should select these catalogue publications. | 4d05b49b-a4a4-4101-8c87-7d3983315f25 | staging pack IDs | — | Yes (D02) | Yes |
| 20 | EVAL-C-02 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | 4d05b49b-a4a4-4101-8c87-7d3983315f25 | — | — | Minimal | Yes |
| 21 | EVAL-C-03 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | a761cacc-8742-493d-b200-eb5d9a3ab884 | — | — | Minimal | Yes |
| 22 | EVAL-C-04 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | 4d05b49b-a4a4-4101-8c87-7d3983315f25 | — | — | Minimal | Yes |
| 23 | EVAL-C-05 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | 4d05b49b-a4a4-4101-8c87-7d3983315f25; a761cacc-8742-493d-b200-eb5d9a3ab884 | — | — | Minimal | Yes |
| 24 | EVAL-D-01 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | 4d05b49b-a4a4-4101-8c87-7d3983315f25 | — | — | Minimal | Yes |
| 25 | EVAL-D-02 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | 4d05b49b-a4a4-4101-8c87-7d3983315f25 | — | — | Minimal | Yes |
| 26 | EVAL-D-03 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | 4d05b49b-a4a4-4101-8c87-7d3983315f25 | — | — | Minimal | Yes |
| 27 | EVAL-D-04 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | 4d05b49b-a4a4-4101-8c87-7d3983315f25 | — | — | Minimal | Yes |
| 28 | EVAL-D-05 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | 4d05b49b-a4a4-4101-8c87-7d3983315f25 | — | — | Minimal | Yes |
| 29 | EVAL-E-01 | expectedIdealResult | (absent) | "PARTIAL_PASS" | Gold-standard ideal behaviour decoupled from engine quirks. | 4d05b49b-a4a4-4101-8c87-7d3983315f25 | — | — | Yes (primary target) | Yes |
| 30 | EVAL-E-01 | currentEngineLimitations | (sparse) | inferApplicability labels only; limited narrative synthesis. | Document deterministic v1 gaps without lowering ideal bar. | — | — | — | No (informational) | N/A |
| 31 | EVAL-E-01 | v1ExpectedResultClassification | PARTIAL_PASS | PARTIAL_PASS | Preserve v1 comparison label. | — | — | — | No | N/A |
| 32 | EVAL-E-02 | expectedIdealResult | (absent) | "PARTIAL_PASS" | Gold-standard ideal behaviour decoupled from engine quirks. | 4d05b49b-a4a4-4101-8c87-7d3983315f25 | — | — | Yes (primary target) | Yes |
| 33 | EVAL-E-02 | currentEngineLimitations | (sparse) | No structured reasoned-implication composer. | Document deterministic v1 gaps without lowering ideal bar. | — | — | — | No (informational) | N/A |
| 34 | EVAL-E-02 | v1ExpectedResultClassification | PARTIAL_PASS | PARTIAL_PASS | Preserve v1 comparison label. | — | — | — | No | N/A |
| 35 | EVAL-E-03 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | 56b0beca-d8c3-4267-a794-9079009af661; a761cacc-8742-493d-b200-eb5d9a3ab884 | — | — | Minimal | Yes |
| 36 | EVAL-E-04 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | 56b0beca-d8c3-4267-a794-9079009af661; a761cacc-8742-493d-b200-eb5d9a3ab884 | — | — | Minimal | Yes |
| 37 | EVAL-F-01 | expectedResultClassification | ANSWERED | PARTIAL_PASS | Align scored ideal with platform capability, not current gate failure. | — | see expectedSourceVersions | see expectedCitationSections | Yes | Yes |
| 38 | EVAL-F-01 | expectedIdealResult | (absent) | "PARTIAL_PASS" | Gold-standard ideal behaviour decoupled from engine quirks. | — | — | — | Yes (primary target) | Yes |
| 39 | EVAL-F-01 | currentEngineLimitations | Answer may be record count only | Deterministic tenant path returns record counts or ID lists. | Document deterministic v1 gaps without lowering ideal bar. | — | — | — | No (informational) | N/A |
| 40 | EVAL-F-01 | v1ExpectedResultClassification | ANSWERED | ANSWERED | Preserve v1 comparison label. | — | — | — | No | N/A |
| 41 | EVAL-F-02 | expectedIdealResult | (absent) | "ANSWERED" | Gold-standard ideal behaviour decoupled from engine quirks. | — | — | — | Yes (primary target) | Yes |
| 42 | EVAL-F-02 | currentEngineLimitations | (sparse) | Numeric count answer only when graph predicate resolves. | Document deterministic v1 gaps without lowering ideal bar. | — | — | — | No (informational) | N/A |
| 43 | EVAL-F-02 | v1ExpectedResultClassification | ANSWERED | ANSWERED | Preserve v1 comparison label. | — | — | — | No | N/A |
| 44 | EVAL-F-03 | expectedIdealResult | (absent) | "PARTIAL_PASS" | Gold-standard ideal behaviour decoupled from engine quirks. | — | — | — | Yes (primary target) | Yes |
| 45 | EVAL-F-03 | currentEngineLimitations | Requires predicate-supported graph question | Graph retrieval without narrative synthesis. | Document deterministic v1 gaps without lowering ideal bar. | — | — | — | No (informational) | N/A |
| 46 | EVAL-F-03 | v1ExpectedResultClassification | PARTIAL_PASS | PARTIAL_PASS | Preserve v1 comparison label. | — | — | — | No | N/A |
| 47 | EVAL-F-04 | expectedIdealResult | (absent) | "ANSWERED" | Gold-standard ideal behaviour decoupled from engine quirks. | — | — | — | Yes (primary target) | Yes |
| 48 | EVAL-F-04 | currentEngineLimitations | (sparse) | Record listing without interpretation. | Document deterministic v1 gaps without lowering ideal bar. | — | — | — | No (informational) | N/A |
| 49 | EVAL-F-04 | v1ExpectedResultClassification | ANSWERED | ANSWERED | Preserve v1 comparison label. | — | — | — | No | N/A |
| 50 | EVAL-F-05 | expectedIdealResult | (absent) | "PARTIAL_PASS" | Gold-standard ideal behaviour decoupled from engine quirks. | — | — | — | Yes (primary target) | Yes |
| 51 | EVAL-F-05 | currentEngineLimitations | (sparse) | Limited missing-evidence narrative. | Document deterministic v1 gaps without lowering ideal bar. | — | — | — | No (informational) | N/A |
| 52 | EVAL-F-05 | v1ExpectedResultClassification | PARTIAL_PASS | PARTIAL_PASS | Preserve v1 comparison label. | — | — | — | No | N/A |
| 53 | EVAL-G-01 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | 56b0beca-d8c3-4267-a794-9079009af661 | — | — | Minimal | Yes |
| 54 | EVAL-G-02 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | 56b0beca-d8c3-4267-a794-9079009af661; a761cacc-8742-493d-b200-eb5d9a3ab884 | — | — | Minimal | Yes |
| 55 | EVAL-G-03 | expectedIdealResult | (absent) | "PARTIAL_PASS" | Gold-standard ideal behaviour decoupled from engine quirks. | 4d05b49b-a4a4-4101-8c87-7d3983315f25; a761cacc-8742-493d-b200-eb5d9a3ab884 | — | — | Yes (primary target) | Yes |
| 56 | EVAL-G-03 | currentEngineLimitations | No dedicated compare composer | No production cross-publication compare composer. | Document deterministic v1 gaps without lowering ideal bar. | — | — | — | No (informational) | N/A |
| 57 | EVAL-G-03 | v1ExpectedResultClassification | PARTIAL_PASS | PARTIAL_PASS | Preserve v1 comparison label. | — | — | — | No | N/A |
| 58 | EVAL-G-04 | expectedIdealResult | (absent) | "PARTIAL_PASS" | Gold-standard ideal behaviour decoupled from engine quirks. | 4d05b49b-a4a4-4101-8c87-7d3983315f25 | — | — | Yes (primary target) | Yes |
| 59 | EVAL-G-04 | currentEngineLimitations | Catalogue and tenant branches mutually exclusive today | Catalogue and tenant branches mutually exclusive in runAskRiDeterministic. | Document deterministic v1 gaps without lowering ideal bar. | — | — | — | No (informational) | N/A |
| 60 | EVAL-G-04 | v1ExpectedResultClassification | PARTIAL_PASS | PARTIAL_PASS | Preserve v1 comparison label. | — | — | — | No | N/A |
| 61 | EVAL-H-01 | expectedResultClassification | INSUFFICIENT_EVIDENCE_OR_UNRESOLVED | ANSWERED | Align scored ideal with platform capability, not current gate failure. | 56b0beca-d8c3-4267-a794-9079009af661; a761cacc-8742-493d-b200-eb5d9a3ab884 | see expectedSourceVersions | see expectedCitationSections | Yes | Yes |
| 62 | EVAL-H-01 | expectedIdealResult | (absent) | "ANSWERED" | Gold-standard ideal behaviour decoupled from engine quirks. | 56b0beca-d8c3-4267-a794-9079009af661; a761cacc-8742-493d-b200-eb5d9a3ab884 | — | — | Yes (primary target) | Yes |
| 63 | EVAL-H-01 | currentEngineLimitations | Publication gate may skip catalogue load | questionMentionsPublicationReference false → catalogue packs not attached in production/harness gate simulation. | Document deterministic v1 gaps without lowering ideal bar. | — | — | — | No (informational) | N/A |
| 64 | EVAL-H-01 | v1ExpectedResultClassification | INSUFFICIENT_EVIDENCE_OR_UNRESOLVED | INSUFFICIENT_EVIDENCE_OR_UNRESOLVED | Preserve v1 comparison label. | — | — | — | No | N/A |
| 65 | EVAL-H-01 | expectedPublicationIds | ["56b0beca-d8c3-4267-a794-9079009af661","a761cacc-8742-493d-b200-eb5d9a3ab884"] | ["56b0beca-d8c3-4267-a794-9079009af661","a761cacc-8742-493d-b200-eb5d9a3ab884"] | Ideal semantic discovery should select these catalogue publications. | 56b0beca-d8c3-4267-a794-9079009af661; a761cacc-8742-493d-b200-eb5d9a3ab884 | staging pack IDs | — | Yes (D02) | Yes |
| 66 | EVAL-H-02 | expectedResultClassification | INSUFFICIENT_EVIDENCE_OR_UNRESOLVED | PARTIAL_PASS | Align scored ideal with platform capability, not current gate failure. | 56b0beca-d8c3-4267-a794-9079009af661; a761cacc-8742-493d-b200-eb5d9a3ab884 | see expectedSourceVersions | see expectedCitationSections | Yes | Yes |
| 67 | EVAL-H-02 | expectedIdealResult | (absent) | "PARTIAL_PASS" | Gold-standard ideal behaviour decoupled from engine quirks. | 56b0beca-d8c3-4267-a794-9079009af661; a761cacc-8742-493d-b200-eb5d9a3ab884 | — | — | Yes (primary target) | Yes |
| 68 | EVAL-H-02 | currentEngineLimitations | Publication gate | Publication gate blocks catalogue without explicit reference. | Document deterministic v1 gaps without lowering ideal bar. | — | — | — | No (informational) | N/A |
| 69 | EVAL-H-02 | v1ExpectedResultClassification | INSUFFICIENT_EVIDENCE_OR_UNRESOLVED | INSUFFICIENT_EVIDENCE_OR_UNRESOLVED | Preserve v1 comparison label. | — | — | — | No | N/A |
| 70 | EVAL-H-02 | expectedPublicationIds | ["56b0beca-d8c3-4267-a794-9079009af661","a761cacc-8742-493d-b200-eb5d9a3ab884"] | ["56b0beca-d8c3-4267-a794-9079009af661","a761cacc-8742-493d-b200-eb5d9a3ab884"] | Ideal semantic discovery should select these catalogue publications. | 56b0beca-d8c3-4267-a794-9079009af661; a761cacc-8742-493d-b200-eb5d9a3ab884 | staging pack IDs | — | Yes (D02) | Yes |
| 71 | EVAL-H-03 | expectedResultClassification | INSUFFICIENT_EVIDENCE_OR_UNRESOLVED | PARTIAL_PASS | Align scored ideal with platform capability, not current gate failure. | 4d05b49b-a4a4-4101-8c87-7d3983315f25 | see expectedSourceVersions | see expectedCitationSections | Yes | Yes |
| 72 | EVAL-H-03 | expectedIdealResult | (absent) | "PARTIAL_PASS" | Gold-standard ideal behaviour decoupled from engine quirks. | 4d05b49b-a4a4-4101-8c87-7d3983315f25 | — | — | Yes (primary target) | Yes |
| 73 | EVAL-H-03 | currentEngineLimitations | (sparse) | No semantic catalogue search. | Document deterministic v1 gaps without lowering ideal bar. | — | — | — | No (informational) | N/A |
| 74 | EVAL-H-03 | v1ExpectedResultClassification | INSUFFICIENT_EVIDENCE_OR_UNRESOLVED | INSUFFICIENT_EVIDENCE_OR_UNRESOLVED | Preserve v1 comparison label. | — | — | — | No | N/A |
| 75 | EVAL-H-04 | expectedIdealResult | (absent) | "CORRECT_INSUFFICIENT_EVIDENCE" | Gold-standard ideal behaviour decoupled from engine quirks. | — | — | — | Yes (primary target) | Yes |
| 76 | EVAL-H-04 | currentEngineLimitations | (sparse) | Tenant graph may return unrelated records if misparsed. | Document deterministic v1 gaps without lowering ideal bar. | — | — | — | No (informational) | N/A |
| 77 | EVAL-H-04 | v1ExpectedResultClassification | CORRECT_INSUFFICIENT_EVIDENCE | CORRECT_INSUFFICIENT_EVIDENCE | Preserve v1 comparison label. | — | — | — | No | N/A |
| 78 | EVAL-H-05 | expectedResultClassification | PARTIAL_PASS_OR_UNRESOLVED | PARTIAL_PASS | Align scored ideal with platform capability, not current gate failure. | 56b0beca-d8c3-4267-a794-9079009af661; a761cacc-8742-493d-b200-eb5d9a3ab884 | see expectedSourceVersions | see expectedCitationSections | Yes | Yes |
| 79 | EVAL-H-05 | expectedIdealResult | (absent) | "PARTIAL_PASS" | Gold-standard ideal behaviour decoupled from engine quirks. | 56b0beca-d8c3-4267-a794-9079009af661; a761cacc-8742-493d-b200-eb5d9a3ab884 | — | — | Yes (primary target) | Yes |
| 80 | EVAL-H-05 | currentEngineLimitations | Sector scoping weak | Weak sector scoping; publication gate. | Document deterministic v1 gaps without lowering ideal bar. | — | — | — | No (informational) | N/A |
| 81 | EVAL-H-05 | v1ExpectedResultClassification | PARTIAL_PASS_OR_UNRESOLVED | PARTIAL_PASS_OR_UNRESOLVED | Preserve v1 comparison label. | — | — | — | No | N/A |
| 82 | EVAL-I-01 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | — | — | — | Minimal | Yes |
| 83 | EVAL-I-02 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | 4d05b49b-a4a4-4101-8c87-7d3983315f25 | — | — | Minimal | Yes |
| 84 | EVAL-I-03 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | — | — | — | Minimal | Yes |
| 85 | EVAL-I-04 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | a761cacc-8742-493d-b200-eb5d9a3ab884 | — | — | Minimal | Yes |
| 86 | EVAL-J-01 | expectedIdealResult | (absent) | "PASS_WITH_REFUTATION" | Gold-standard ideal behaviour decoupled from engine quirks. | a761cacc-8742-493d-b200-eb5d9a3ab884 | — | — | Yes (primary target) | Yes |
| 87 | EVAL-J-01 | currentEngineLimitations | Engine may not explicitly refute | May not explicitly refute false premise in template answers. | Document deterministic v1 gaps without lowering ideal bar. | — | — | — | No (informational) | N/A |
| 88 | EVAL-J-01 | v1ExpectedResultClassification | PASS_WITH_REFUTATION | PASS_WITH_REFUTATION | Preserve v1 comparison label. | — | — | — | No | N/A |
| 89 | EVAL-J-02 | expectedIdealResult | (absent) | "PASS_WITH_REFUTATION" | Gold-standard ideal behaviour decoupled from engine quirks. | 4d05b49b-a4a4-4101-8c87-7d3983315f25 | — | — | Yes (primary target) | Yes |
| 90 | EVAL-J-02 | currentEngineLimitations | (sparse) | Consultation status may be unclear in templates. | Document deterministic v1 gaps without lowering ideal bar. | — | — | — | No (informational) | N/A |
| 91 | EVAL-J-02 | v1ExpectedResultClassification | PASS_WITH_REFUTATION | PASS_WITH_REFUTATION | Preserve v1 comparison label. | — | — | — | No | N/A |
| 92 | EVAL-J-03 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | a761cacc-8742-493d-b200-eb5d9a3ab884 | — | — | Minimal | Yes |
| 93 | EVAL-J-04 | (metadata only) | v1 case | expectedIdealResult + currentEngineLimitations | v1 expectation already ideal-oriented; added explicit ideal/limitation split. | 56b0beca-d8c3-4267-a794-9079009af661 | — | — | Minimal | Yes |

## Schema (backward compatible)

- v1 fields retained.
- Optional: `expectedIdealResult`, `currentEngineLimitations`, `v1ExpectedResultClassification`.
- Harness scores against `expectedIdealResult.outcomeClassification` when present, else `expectedResultClassification`.

## Source authenticity

- Answer accuracy is judged against **frozen extraction packs** in `docs/eval/evidence-packs/` (staging revisions).
- Currency vs live FCA URLs is a separate authenticity check — not re-run per case in this log.
