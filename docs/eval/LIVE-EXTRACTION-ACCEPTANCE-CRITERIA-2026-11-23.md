# Live full-publication extraction — acceptance criteria (2026-11-23)

## Processing coverage (necessary, not sufficient)

| Criterion | PS26/1 | PS22/9 |
|---|---|---|
| Provision inventory count matches batch plan | 47 | 242 |
| All planned batches executed once (no duplicate paid suffix) | Required | Required |
| `publicationCoverageComplete` on orchestration ledger | Required | Required |
| Unresolved provision cores listed (not hidden) | Required | Required |

## Extraction accuracy (vs independently verified source evidence)

Benchmarks: `PS26-1-PROVISION-SOURCE-VERIFICATION-2026-11-22.json`, `PS22-9-PROVISION-SOURCE-VERIFICATION-2026-11-22.json`.

| Metric | Pass threshold (pilot) |
|---|---|
| Recall — binding instrument cores surfaced in findings or explicit unresolved | ≥ 0.90 |
| Precision — findings map to verified quotation on cited page | ≥ 0.85 |
| R/E/G classification agreement with verified benchmark subset | ≥ 0.85 |
| Unsupported AI statements (no verifiable quotation) | 0 tolerated in oblig. conversion path |
| Cross-page provision citations | Match server verification for sampled cores |
| Human correction rate (reviewer edits / findings) | Recorded; no numeric pass gate for pilot |
| Actual AI spend | ≤ $2.00 authorised ceiling |

## Operational

- Transport disconnect must not create duplicate runs (idempotency + lookup before re-POST).
- Client polls until terminal `execution_status`; no paid retry until status known.
- Evidence artefact: `LIVE-FULL-PUBLICATION-EXTRACTION-PILOT-RUN-2026-11-22.json` plus accuracy reconcile output.