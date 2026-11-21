# FORGENIQ Regulatory Intelligence — priority backlog

Security items are tracked separately in [`docs/security/SECURITY-BACKLOG.md`](../security/SECURITY-BACKLOG.md).

| ID | Priority | Item | Current state | Required outcome |
|---|---|---|---|---|
| RI-CLS-001 | P1 | Regulatory classification policies for FRC, ICO, PSR and PRA | Migration `20261121180000` seeds an active policy for the FCA only. Classification is mandatory for every new obligation, so manual creation for any regulator without an active policy is refused (`classification_policy_unavailable`, fail closed). On staging this affects FORGENIQ Partner UAT's FRC and ICO changes; existing obligations are unchanged. Accepted 2026-11-21. | Each regulator's code vocabulary, legal status, conversion eligibility and destination queue drafted from its authoritative sources, reviewed by a compliance SME, proposed and activated through the platform-operator maker-checker RPCs, and verified with an isolated-database acceptance test before staging activation. |
| RI-CLS-002 | P1 | Review the 22 legacy unclassified manual obligations on staging | Flagged by `ri_obligation_legal_classification.classification_review_required` (18 FORGENIQ, 4 Partner UAT; 17 from non-binding sources). Not deleted or modified. | Each record reviewed by its organisation; where a binding or evidential requirement exists, a new classified obligation is created against the verified authoritative provision and approved; the legacy record is closed or retained per the organisation's decision. |
