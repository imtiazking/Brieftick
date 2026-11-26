# UAT execution report

Environment: `forgeniq-platform-staging`, official `dpl_71M4sVFpmG4WtXiJ7uBBkUS3wnqx` (built from `782d55c`, candidate-first then promoted).
Personas: A = maker (COMPLIANCE_MANAGER), B = independent reviewer (REVIEWER), C = approver (COMPLIANCE_MANAGER). All synthetic records. Paid AI disabled; stages ran as deterministic fixtures.

## Results

| Suite | Result | Evidence |
|---|---|---|
| Hosted API lifecycle (obligation, impact, risk, control, assurance, closure) | **38 checks, 0 failed**; 1 BLOCKED (`SEC-CROSS-TENANT`) | `docs/uat/evidence/compliance-lifecycle-2026-11-26/RESULT.json` |
| Hosted real-browser A/B/C | **34 checks, 0 failed**: 33 DOM-observed browser checks and 1 labelled `hosted-api` check; 0 console errors, 0 page errors | `docs/uat/evidence/browser-abc-2026-11-26/RESULT.json` and screenshots |

The browser suite marks PASS only from DOM observation, or from persisted state confirmed after a real reload. It is not satisfied by API calls. The single API-level check (`C-CALENDAR-API-SCOPE-ALL`) says so in its `layer` field.

## What was exercised in the browser

- **A:** identity; Publications and Obligations terminal theme; centred, blurred-backdrop detail modals with focus return; create obligation; submit for review (persisted `IN_REVIEW` confirmed after reload); **self-approval refused** (SoD toast, persisted status unchanged).
- **B:** identity; approves through the UI; the atomic Stage 2 hand-off creates the impact in the same transaction; navigates to the impact.
- **C:** identity; five-stage lifecycle panel with five links; navigation Obligation, Impact, Risk, Control, Assurance with status, owner and history text; control-to-assurance and assurance-to-control links; assurance workflow state shows `CLOSED`; assurance audit history shows 8 events; obligation approval history; Risk, Control and Assurance registers; regulatory calendar view and window selector.

## Defects found by UAT and fixed in this tranche

| Defect | Cause | Fix | Hosted verification |
|---|---|---|---|
| Assurance review always displayed `DRAFT` | UI read the test `result` instead of `metadata.assuranceStatus` | mapper exposes `assuranceStatus` | `C-ASSURANCE-WORKFLOW-STATE` PASS (`CLOSED`) |
| Audit history of Assurance, Finding and Evidence pages wiped after loading | the slower detail request deleted the cached events and their loaded flag | detail fetchers no longer clear events; explicit refresh after writes | `C-ASSURANCE-AUDIT-HISTORY` PASS on freshly created records (8 events); one unexplained intermittent loading state on the first hosted run, see Stability |
| Assurance not linked to its control | Stage 5 stores lineage in `metadata.sourceApprovedControlId` plus a link table; lists read neither | mapper fallback and link-table merge | control link present; `C-CONTROL-LINKS-TO-ASSURANCE` PASS |

## Script defects found and corrected (not product defects)

- Form edited before record hydration, so hydration overwrote the typed value. The script now waits for hydration and confirms against the persisted record after a reload.
- A same-hash `goto` is not a navigation, so a locally typed value looked persisted. The script now uses a real reload.
- Control links counted before the detail request resolved. The script now waits for the link.

## Stability

Browser suite outcomes across the iterations on this deployment, in order: 29/31, 31/31, 30/31, 26/29, 31/31, then 31/31 twice, 33/33, and 34/34 twice. The final four consecutive runs were clean.

Causes of the failing iterations:

- **Script races, corrected in the script:** editing before hydration (`A-UI-SUBMIT-FOR-REVIEW`, `B-UI-APPROVE-OBLIGATION`), a same-hash navigation read as persisted state (`A-UI-SELF-APPROVAL-REFUSED`), and counting control links before the detail request resolved (`C-ASSURANCE-LINKS-TO-CONTROL`). In an isolated clean-state reproduction the control link appeared within 2 to 4 seconds and the API returned the lineage in all three forms.
- **Not root-caused (open, DEF-011):** on the very first hosted run, `C-ASSURANCE-AUDIT-HISTORY` failed with the panel stuck on "Loading workflow events from staging…" for more than 15 seconds, although the events endpoint answered in about 350 ms with 8 events. It did **not** recur in three later runs on freshly created records, nor in two clean-state browser reproductions that logged the network. A request log and persisted load-state dump are now attached automatically to this check if it fails again. Until it is explained, treat the audit-history panel as having one unexplained intermittent loading state.

This is not a claim that no timing-sensitive behaviour remains: the Design Lab loads detail progressively, so an automated user that acts before hydration can see transient states.

## BLOCKED

- `SEC-CROSS-TENANT` (hosted cross-tenant denial): A, B and C share organisation `b8f5e3a1-00ad-4000-8000-000000000001`. A second tenant and new user access are required, and that needs approval.

## Not covered

Business UAT sign-off (`businessUatApproved=false`), file-chooser evidence upload in the browser, Ask RI in the browser, report exports, notification delivery, mobile layouts beyond the Publications modal.
