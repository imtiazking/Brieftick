# Publication-to-obligation automation report (19 Nov 2026)

Labels: **[LIVE-RO]** read-only staging evidence, **[OFFLINE]** local tests, **[CODE]** source
inspection. No paid AI request, live ingestion, migration or staging write was made.

**Status: implemented in code; not verified end to end; not operational.** No publication has
ever been converted into an AI-proposed obligation in staging.

## Verified counts [LIVE-RO]

| Measure | Count |
|---|---|
| Configured regulators | 36 |
| Registered sources | 41 |
| Enabled connectors | 39 (2 disabled; all `production_status` NOT_ENABLED) |
| Verified live connectors | 40 with ≥1 completed run; 23 within the last 72 h; **0 running now** (scheduler 404 since 17 Nov) |
| Successfully ingested publications | 275 (272 regulated ingestion, 2 FCA controlled, 1 e2e fixture) |
| Analysed publications | 3 with an AI run; 2 with a completed run (7 runs total) |
| Proposed obligations (AI) | **0** (`ai_claim_materialisations` = 0) |
| Approved obligations (AI) | **0** |
| Obligations in the register (all manual) | 22 (FORGENIQ 18, Partner UAT 4) |
| Failed or blocked executions | 5 FAILED ingestion runs in 8 days (MoC KSA); 1 FAILED AI run (AI Development, `AI_TIMEOUT`); 27 `AI_ANALYSIS_FAILED` events; ~9 cron ticks lost to the 404 |

## Answers

1. **Implemented?** Yes, in code [CODE]: UC-RI-005 request → structured output with citations →
   `HUMAN_REVIEW_REQUIRED` → `submitAnalysisReview` → `materialiseReviewedClaims`, which inserts
   into the existing `regulatory_obligations` table. No second register exists.
2. **Stages passed.** Discovery and ingestion: passed historically, stopped since 17 Nov.
   PDF extraction (PS26/1): offline suites pass; 21 extraction revisions exist.
   AI analysis: 5 completed Anthropic runs in FORGENIQ (before the pilot guard); the only
   AI Development run failed. Proposal, review and register: never exercised.
3. **Publication → AI analysis?** Yes, demonstrated in FORGENIQ (runs linked to publications).
   Not demonstrated in AI Development, the only tenant now allowed.
4. **Structured proposed obligations?** Supported by schema and code; 0 produced in staging.
5. **Human review?** Yes by design: completed runs enter `HUMAN_REVIEW_REQUIRED`, and
   materialised records are created as `DRAFT` with `origin = AI_ASSISTED`. The schema has no
   `PROPOSED` status; DRAFT + AI_ASSISTED is the proposed state. Nothing is auto-approved.
6. **Maker-checker?** Impact approvals: correct (17/17 segregated). AI review: **defect**. The
   run requester could accept their own run, and the one accepted review in staging did so.
   Fixed in branch `a5dc881` (server); DB trigger drafted, not applied.
7. **Approved obligations into the existing register?** Yes by code (same table); unverified
   live (0 records).
8. **Relationships persisted?** Code writes `publication_id`, `regulatory_change_id`,
   `ai_analysis_run_id`, `ai_analysis_review_id` and a materialisation row. All 22 current
   obligations carry publication and change links.
9. **Risks and controls?** Manual chain works: 11 obligation–risk, 10 obligation–control,
   10 risk–control, 6 evidence–obligation links, 0 cross-organisation. No AI-origin records exist
   to link.
10. **Auditable chain?** Designed: workflow events at request, completion, review and
    materialisation, with run, review and claim IDs. Evidenced only up to AI review.
11. **Repeatable without duplicates?** Idempotency exists per (review, claim, entity type), plus
    UC-RI-005 request idempotency and an overlap check. Defect fixed: an unmatched claim index fell
    back to `candidates[0]`, which could create duplicate obligations from one candidate.
    Ingestion: 0 duplicate external IDs, 4 duplicate content-hash groups.
12. **Before operational:**
    - Approve deployment of the fix branch. This also re-enables hosted cron ingestion.
    - Approve applying migration `20261119150000_ri_ai_obligation_pilot_db_guards.sql`; tenant
      restriction is currently server-only.
    - Run one approved paid UC-RI-005 analysis on a named AI Development publication. Then have
      a second user accept it, and verify DRAFT obligations, links, events and no duplicates
      on re-submit.
    - Explain the 197 vs 275 publication count.
    - Reconcile the remaining lost 11 Nov UI/auth files.
    - Repair the MoC KSA connector.

## Tenant restriction [CODE][OFFLINE][LIVE-RO]

The server guard allows UC-RI-002/005 only for AI Development (`b8f5…0001`) and refuses Partner UAT
and FORGENIQ; an env override cannot widen it. The offline guard tests pass. At database level,
only membership RLS applies today. The drafted triggers add the org restriction, require a
review for AI-assisted records and block self-approval. Partner UAT was not modified.
