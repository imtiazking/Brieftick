# Phase 7C.5 — Operations, governance & reporting parity

Side-by-side reference (manual):

| Area | Design Lab | Production |
|------|------------|------------|
| Work queue | `#/work-queue` | `/ri/work-queue` |
| Attention centre | `#/notifications` | In-app events via Phase 7 ops (no separate page required for parity harness) |
| Governance | `#/governance` | `/ri/governance` + `workflow_events` |
| Reporting | `#/reports/executive` | `/ri/reporting` |

## Intentional production differences

- **Clerk shell** and real user ids replace demo personas (`u-smith`, etc.).
- **My team** in production: no team hierarchy table yet — `scope=team` shows organisation assignable pool (lab uses `teamId` on people).
- **Work queue exclusions (non-AI):** AI Analysis and Board Pack Review items are not surfaced in production.
- **Deferred registers:** Attestation, governance exception, management attestation, and finding-validation queue rows await schema parity.
- **Notifications:** Board-pack / assurance narrative alerts from the lab are not duplicated; production-equivalent events cover intake SLA, applicability, actions, evidence expiry, and source re-analysis.

## Behavioural parity

Deterministic harness: `scripts/acceptance-phase-7c5-golden-master.mjs` (queue fingerprints, SLA threshold 14d, governance metrics, reporting aggregates, SoD rules).
