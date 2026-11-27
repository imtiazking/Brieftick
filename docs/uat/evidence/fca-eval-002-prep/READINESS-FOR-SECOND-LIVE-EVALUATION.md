# FCA-EVAL-002 — readiness for second live AI evaluation

Generated: 2026-11-27T03:39:20.163Z. **No paid AI was used to produce this package.**

## Proposed run controls

| Field | Value |
| --- | --- |
| Run reference | `pilot-fca-eval-002-conc-7-20-1r` |
| Max budget (USD) | 0.75 |
| Max requests | 8 |
| Expected stage requests | 5 |
| Publication ID (staging) | `829c5472-953a-40ff-9628-947afbfe4e7a` |

## Acceptance criteria

- correct provision level legal classification
- correct effective dates with provenance
- no missing mandatory requirements in scope
- no fabricated obligations
- no fabricated regulatory citations
- complete requirement to control traceability
- evidence based or provisional risk ratings
- proposed controls not presented as existing
- complete assurance procedures without truncation
- unresolved interpretations escalated
- full human review and maker checker auditability

## Expected outcomes (independent baseline)

```json
{
  "provision": "CONC 7.20.1R",
  "legalClassification": "final_made_rule",
  "instrumentStatus": "made",
  "effectiveDate": "2026-07-15",
  "commencementBasis": "commencement_clause_all_other_parts",
  "standaloneObligationPaths": [
    "CONC 7.20.1R(2)(a)",
    "CONC 7.20.1R(2)(b)",
    "CONC 7.20.1R(3)"
  ],
  "applicabilityPaths": [
    "CONC 7.20.1R(1)"
  ],
  "definitionPaths": [
    "CONC 7.20.1R(4)"
  ],
  "expertJudgementIds": [
    "timing_as_soon_as_possible",
    "sufficiency_standard",
    "adverse_consequences_scope",
    "firm_judgement",
    "adverse_consequences_scope",
    "conditional_relevance",
    "adverse_consequences_scope"
  ],
  "mandatoryLimbsVerbatim": [
    {
      "reference": "CONC 7.20.1R(2)(a)",
      "kind": "mandatory_notification"
    },
    {
      "reference": "CONC 7.20.1R(2)(b)",
      "kind": "mandatory_information"
    },
    {
      "reference": "CONC 7.20.1R(3)",
      "kind": "information_together_requirement"
    }
  ]
}
```

## Outstanding regulatory expert-review questions

- **CONC 7.20.1R(2) — As soon as possible:** Do not invent a day-count SLA. Record the statutory wording and escalate timing standards to compliance/legal expert review.
- **CONC 7.20.1R(2)(b) — Sufficient information:** Outcome-based standard. Firm must judge sufficiency per case; expert review on defensible content and channel.
- **CONC 7.20.1R(2)(b)(ii)–(iii) — Adverse consequences:** Rule does not enumerate consequences. Escalate which consequences must be disclosed (charges, credit reporting, enforcement, etc.).
- **CONC 7.20.1R(2)(b)(iii) — Likelihood assessment:** Requires firm judgement and evidence of that judgement. Escalate governance for documenting "likely" consequences.
- **CONC 7.20.1R(2)(b)(iv) — Relevant mitigation measures:** Firm decides when mitigation is relevant. No invented list of steps.
- **CONC 7.20.1R — Transitional provisions:** Commencement for the rule is traced to instrument clause H (15 July 2026) unless superseded by transitional material. Text search found no provision-specific transitional reference; expert confirmation still required for in-flight agreements.
- **CONC 7.20.1R — Applicability to temporary-permission firms:** Handbook applicability for temporary-permission firms is not determined by this engine. Escalate to regulatory expert with firm permission status.

## Authorisation prerequisites

- Written authorisation of budget, max requests and run reference
- RI_AI_EXECUTION_ENABLED=true on staging only for the run window
- Stages 2–5 live posture enabled with spend ledger scope forgeniq-lab-anthropic
- Expert review of interpretative topics or explicit acceptance of escalations in the assurance record
