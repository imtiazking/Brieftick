# RI classification policy — existing obligation remediation report (read-only)

- Date: 2026-11-21
- Environment: staging Supabase `lhgzdicffkhaaykzthep` (read-only SELECT; no records modified)
- Policy evaluated: FCA classification policy v1 (`supabase/migrations/20261121180000_ri_regulatory_classification_policy.sql`, not applied to staging)
- Query: `apps/platform/supabase/audit/ri_obligation_classification_remediation_audit.sql`

## Summary

| Measure | Count |
| --- | --- |
| Obligations on staging | 22 |
| AI-assisted obligations | 0 |
| Obligations linked to an AI finding | 0 |
| Obligations carrying a regulatory classification code | 0 |
| Obligations carrying a legal basis | 0 |
| Obligations from a mandatory non-binding publication type | 17 |
| Valid under policy v1 | 0 |
| Remediation required (flag only) | 22 |

No AI-generated obligation exists on staging, so the guidance-conversion defect has not yet produced a
persisted obligation. Every existing obligation is a manual or synthetic UAT record without a classification
code; under policy v1 each is reported as `UNCLASSIFIED` by `ri_obligation_legal_classification`.

Nothing was deleted or modified. The migration does not touch existing obligations: the classification trigger
only applies to new inserts and to changes to classification keys, so these rows remain editable through the
existing workflow.

## Per-obligation assessment

| ID (prefix) | Organisation | Status | Publication | Type | Regulator | Finding | Code | Legal basis | Assessment | Recommended action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ff6f32da | FORGENIQ | OPEN | CP26/38 Financial Crime Guide updates | consultation_paper | REG-FCA | — | — | — | Non-binding source, unclassified | Flag; synthetic UAT-83H record — retire via workflow after sign-off |
| 2dee4cb4 | FORGENIQ | OPEN | CP26/38 | consultation_paper | REG-FCA | — | — | — | Non-binding source, unclassified | As above |
| 2194c1d5 | FORGENIQ | OPEN | CP26/38 | consultation_paper | REG-FCA | — | — | — | Non-binding source, unclassified | As above |
| 18ebe781 | FORGENIQ | OPEN | CP26/38 | consultation_paper | REG-FCA | — | — | — | Non-binding source, unclassified | As above |
| aa2fc212 | FORGENIQ | OPEN | CP26/38 | consultation_paper | REG-FCA | — | — | — | Non-binding source, unclassified | As above |
| 38396b80 | FORGENIQ | DRAFT | CP26/38 | consultation_paper | REG-FCA | — | — | — | Non-binding source, unclassified | Flag; synthetic UAT-85I record |
| 1a1130c5 | FORGENIQ | DRAFT | CP26/38 | consultation_paper | REG-FCA | — | — | — | Non-binding source, unclassified | As above |
| b5e691f7 | FORGENIQ | DRAFT | CP26/38 | consultation_paper | REG-FCA | — | — | — | Non-binding source, unclassified | As above |
| f221e4b3 | FORGENIQ | DRAFT | CP26/38 | consultation_paper | REG-FCA | — | — | — | Non-binding source, unclassified | As above |
| 138bf1d4 | FORGENIQ | DRAFT | CP26/38 | consultation_paper | REG-FCA | — | — | — | Non-binding source, unclassified | As above |
| af67564c | FORGENIQ | DRAFT | CP26/38 | consultation_paper | REG-FCA | — | — | — | Non-binding source, unclassified | As above |
| 9a4b07dd | FORGENIQ | DRAFT | CP26/38 | consultation_paper | REG-FCA | — | — | — | Non-binding source, unclassified | As above |
| 8656e9ed | FORGENIQ | DRAFT | CP26/38 | consultation_paper | REG-FCA | — | — | — | Non-binding source, unclassified | As above |
| 07b23ce1 | FORGENIQ | DRAFT | CP26/38 | consultation_paper | REG-FCA | — | — | — | Non-binding source, unclassified | As above |
| 11e5b861 | FORGENIQ | DRAFT | CP26/38 | consultation_paper | REG-FCA | — | — | — | Non-binding source, unclassified | As above |
| 9360d938 | FORGENIQ | OPEN | Fair value in consumer finance | publication | REG-FCA | — | — | — | Unclassified | Flag; synthetic P8D3 record |
| 6adb6e59 | FORGENIQ | OPEN | Fair value in consumer finance | publication | REG-FCA | — | — | — | Unclassified | Flag; synthetic P8D3 record |
| 164b0ef5 | FORGENIQ | DRAFT | Fair value in consumer finance | publication | REG-FCA | — | — | — | Unclassified | Assign code and legal basis (e.g. PRIN 2A / Consumer Duty) or record as supporting information |
| b8f5e3a1… | FORGENIQ Partner UAT | IN_PROGRESS | Cabinet Office, ICO | regulatory_action | REG-ICO | — | — | — | Unclassified; no ICO policy | Leave unchanged (Partner UAT); report only |
| b8f5e3a1… | FORGENIQ Partner UAT | IN_REVIEW | Cabinet Office, ICO | regulatory_action | REG-ICO | — | — | — | Unclassified; no ICO policy | Leave unchanged (Partner UAT); report only |
| b8f5e3a1… | FORGENIQ Partner UAT | DRAFT | FRC review shows reports are 20% shorter | news | REG-FRC | — | — | — | Non-binding source, unclassified; no FRC policy | Leave unchanged (Partner UAT); report only |
| b8f5e3a1… | FORGENIQ Partner UAT | OPEN | FRC strengthens audit quality with revised standards | news | REG-FRC | — | — | — | Non-binding source, unclassified; no FRC policy | Leave unchanged (Partner UAT); report only |

Partner UAT obligation IDs share the seeded prefix `b8f5e3a1`; full IDs are returned by the audit query.

## Observations

1. The 15 CP26/38 obligations come from a consultation paper. Consultation proposals are not conversion-eligible
   under policy v1. None was AI-generated; they are synthetic workflow-test records.
2. The publication type “publication” is generic. It is not in the mandatory non-binding floor, so the source
   check does not block binding codes on these publications. Classify them during reviewer triage.
3. The ICO and FRC have no classification policy yet. Their publications fail closed: any AI conversion is refused
   with `classification_policy_unavailable`.
4. The three FCA `finalised_guidance` publications, including FG24/6, have no obligations.

## Proposed remediation (requires approval; not executed)

- Do not delete any record.
- After the migration is approved and applied, reviewers flag each FORGENIQ record through the existing obligation
  workflow: assign a code and legal basis where a binding provision exists, otherwise close it as supporting
  information or synthetic test data.
- Leave the Partner UAT records unchanged.
- Re-run the audit query after any approved remediation and attach the output to the release evidence.
