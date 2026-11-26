# Regulatory accuracy report

**Status: NOT_ASSESSED by a regulatory expert. No expert approval is claimed or implied.**

## What exists

- **Classification regression corpus** (`b0b302d`): 5,264 oracle-checked classification checks, with a guard against vocabulary drift between the JavaScript and SQL implementations. This proves the classifier agrees with its own written policy, deterministically. It does not prove the policy is right for any regulator.
- **Approved classification policy:** REG-FCA only. The other 35 regulators have none, so their publications cannot be classified under an approved policy.
- **Stage C catalogue answers (Ask RI)** are capped at `PARTIAL_ANSWER` when the source is non-binding or human review is pending, and they must cite a catalogue source. Verified by the repaired Ask RI suites.
- **Impact materiality** keeps `impact-materiality-policy-v1`; it was not changed.
- **Paid FCA pilots** (FCA-EVAL-001 and -002, `$0.224872` in total) are historical evidence, preserved unmodified. Their results were not re-scored and are not a production accuracy claim. Sample sizes are 5 requests each.

## What this report does not establish

- Precision and recall against expert-labelled publications on any regulator.
- That obligations extracted from live publications are complete or correctly attributed.
- That the classification policy for the FCA is legally correct.
- Anything for the 35 regulators without an approved policy. Approving a policy for them is a material classification-policy change and needs your approval.

## Required before this can be called accurate

1. Regulatory expert labels a stratified sample (by regulator, publication type, and binding or non-binding) and signs it off.
2. Run the classifier against that sample (deterministic fixtures first; paid AI only after authorisation) and report per-class precision and recall.
3. Approve policies per regulator through the governance workflow.
4. Review disagreements and record them in the defect register.

No test result, label or approval has been fabricated in this report.
