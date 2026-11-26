# Workflow traceability report

Chain required: horizon scan, publication, classification, obligation, impact, risk, control, assurance, evidence, finding, remediation, closure, audit trail.

## Verified on staging (synthetic records, `dpl_71M4sVFpmG4WtXiJ7uBBkUS3wnqx`)

| Link | Mechanism | Evidence |
|---|---|---|
| Obligation (maker A) to review (B) to approval | maker-checker; creator and submitter cannot approve | `S1-*`, `A-UI-SELF-APPROVAL-REFUSED`, `B-UI-APPROVE-OBLIGATION` |
| Approved obligation to Stage 2 impact | one transaction in `approve_obligation_with_stage2`; no partial state | `S1-APPROVE`, `B-UI-ATOMIC-STAGE2-HANDOFF` |
| Impact to risk | risk carries the impact lineage; independent approval | `S2-*`, `S3-*` |
| Risk to control | Stage 4 control approved by a different user | `S4-*` |
| Control to assurance plan, tests, findings, evidence | `metadata.sourceApprovedControlId` plus link table; closure blocked by an open finding or a failing test | `S5-*`, `C-CONTROL-LINKS-TO-ASSURANCE`, `C-ASSURANCE-LINKS-TO-CONTROL` |
| Closure | idempotent; workflow state `CLOSED` | `C-ASSURANCE-WORKFLOW-STATE` |
| Audit trail | per-record events; assurance history shows 8 events; obligation approval history | `C-ASSURANCE-AUDIT-HISTORY`, `C-OBLIGATION-APPROVAL-HISTORY` (see open DEF-011) |
| One-view navigation | five-stage lifecycle panel with five links | `C-LIFECYCLE-PANEL`, `C-NAV-*` |

Browser result: 34/34. Lifecycle API result: 38/38 with one BLOCKED check (cross-tenant).

## Not verified end to end

- **Horizon scan to publication on staging is not live.** Connectors have not run on a schedule (0 of 41 sources current), so the first half of the chain was not exercised by a live ingest during this programme. It is covered by local ingestion suites (`ri:ingest`, ingestion ops, FCA RSS and HTML quality, snapshots).
- **Publication to obligation by live AI** was not run (paid AI disabled). The chain was entered at obligation creation, and the Stage 1 to Stage 4 transitions were deterministic fixtures.
- **Remediation actions to task and calendar** is implemented (`RI-LAB-CALENDAR`), but staging has no operational dated records, so the calendar is empty, and the evidence is a local test plus the `scope=all` view showing 9 UAT-authorised events.

## Data quality

18 OPEN obligations on staging are DISCONNECTED from a lifecycle (no impact): 11 synthetic UAT, 7 legacy MANUAL in the FORGENIQ organisation. They were deliberately not bulk-backfilled: that would create impacts that no one reviewed. See OPEN-004.
