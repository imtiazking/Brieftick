# Obligation Triage decision provenance audit (staging)

Generated: 2026-11-24T12:57:46.181Z

## Count reconciliation

| Source | Obligation triage count |
|---|---|
| Dashboard `counts.OBLIGATION_TRIAGE` | 60 |
| Obligation queue API items | 60 |
| Verification filter ALL | 60 |

Dashboard card uses counts.OBLIGATION_TRIAGE across the newest completed UC-RI-005 runs (MAX_RUNS cap). Filter counts use the same scan window. A lower obligation count usually means fewer runs in the scan window or findings reclassified to other queues after human review — not silent deletion.

**68 → 60 explained (2026-11-24):** The earlier dashboard snapshot **68** was taken before the latest Design Lab E2E finding-review batch on PS26/1 (`analysis_review_id` `b0e08a19…`). That review **re-triaged** findings (rejections + non-obligation dispositions). Current tenant counts: obligation **60**, non-obligation **142** (+6 vs prior **136**), exception **6** (+2 vs **4**). No rows were deleted; queue membership changed with persisted human decisions.

## Summary

| Metric | Count |
|---|---|
| VERIFIED (workflow) | 12 |
| Genuine regulatory VERIFIED | 0 |
| UAT / test decision rows | 48 |
| REJECTED | 36 |
| NEEDS REVIEW | 12 |
| APPROVED obligations (in queue) | 9 |

### Provenance buckets

- **AUTOMATED_UAT_DECISION**: 48
- **UNREVIEWED**: 12

## VERIFIED findings (12)

### 1. CONC 4.2A.3R
- Publication: PS26/1 — Regulating Buy Now Pay Later (Deferred Payment Credit)
- AI classification: binding_requirement
- Provenance: **AUTOMATED_UAT_DECISION** — UAT / test pathway
- Reviewer: user_3Fa9TcFi8izkxHdDP58Qb3UY4mr (REVIEWER)
- Timestamp: 2026-11-24T10:43:03.33179+00:00
- Audit ref: b0e08a19-1905-49b9-a626-a0198529dd5d
- Pathway: human_verified_uat
- Adequate regulatory evidence fields: no
- Genuine human verification count: no
- Obligation: 5ae3ddf0-3aee-4f4e-8b93-75408ea4cb1b

### 2. CONC 4.2A.6R
- Publication: PS26/1 — Regulating Buy Now Pay Later (Deferred Payment Credit)
- AI classification: binding_requirement
- Provenance: **AUTOMATED_UAT_DECISION** — UAT / test pathway
- Reviewer: user_3Fa9TcFi8izkxHdDP58Qb3UY4mr (REVIEWER)
- Timestamp: 2026-11-24T10:43:03.33179+00:00
- Audit ref: b0e08a19-1905-49b9-a626-a0198529dd5d
- Pathway: human_verified_uat
- Adequate regulatory evidence fields: no
- Genuine human verification count: no
- Obligation: 0ac6b8dd-adde-4ad3-999b-276b0f8b10d7

### 3. CONC 4.2A.7R
- Publication: PS26/1 — Regulating Buy Now Pay Later (Deferred Payment Credit)
- AI classification: binding_requirement
- Provenance: **AUTOMATED_UAT_DECISION** — UAT / test pathway
- Reviewer: user_3Fa9TcFi8izkxHdDP58Qb3UY4mr (REVIEWER)
- Timestamp: 2026-11-24T10:43:03.33179+00:00
- Audit ref: b0e08a19-1905-49b9-a626-a0198529dd5d
- Pathway: human_verified_uat
- Adequate regulatory evidence fields: no
- Genuine human verification count: no
- Obligation: 15c320c7-abcb-4008-999d-add1f41dc834

### 4. CONC 7.20.3R
- Publication: PS26/1 — Regulating Buy Now Pay Later (Deferred Payment Credit)
- AI classification: binding_requirement
- Provenance: **AUTOMATED_UAT_DECISION** — UAT / test pathway
- Reviewer: user_3Fa9TcFi8izkxHdDP58Qb3UY4mr (REVIEWER)
- Timestamp: 2026-11-24T10:43:03.33179+00:00
- Audit ref: b0e08a19-1905-49b9-a626-a0198529dd5d
- Pathway: human_verified_uat
- Adequate regulatory evidence fields: no
- Genuine human verification count: no
- Obligation: 57bcc479-fe9f-42ec-873e-3cdb1552a2cc

### 5. PRIN 2A.4.35E
- Publication: PS22/9: A new Consumer Duty
- AI classification: binding_requirement
- Provenance: **AUTOMATED_UAT_DECISION** — UAT / test pathway
- Reviewer: user_3Fa9TcFi8izkxHdDP58Qb3UY4mr (REVIEWER)
- Timestamp: 2026-11-22T15:55:19.80023+00:00
- Audit ref: e918c4bb-671c-4e49-8bae-2ac7ce9df931
- Pathway: human_verified_uat
- Adequate regulatory evidence fields: no
- Genuine human verification count: no
- Obligation: 7143f1ff-c064-4123-bc2e-38e0102972df

### 6. PRIN 2A.4.34R
- Publication: PS22/9: A new Consumer Duty
- AI classification: binding_requirement
- Provenance: **AUTOMATED_UAT_DECISION** — UAT / test pathway
- Reviewer: user_3Fa9TcFi8izkxHdDP58Qb3UY4mr (REVIEWER)
- Timestamp: 2026-11-22T15:55:19.80023+00:00
- Audit ref: e918c4bb-671c-4e49-8bae-2ac7ce9df931
- Pathway: human_verified_uat
- Adequate regulatory evidence fields: no
- Genuine human verification count: no
- Obligation: 2046ef71-f8b2-42f4-bdc4-3a1ec48b1b8a

### 7. CONC 7.20.1R
- Publication: PS26/1 — Regulating Buy Now Pay Later (Deferred Payment Credit)
- AI classification: binding_requirement
- Provenance: **AUTOMATED_UAT_DECISION** — UAT / test pathway
- Reviewer: user_3Fa9TcFi8izkxHdDP58Qb3UY4mr (REVIEWER)
- Timestamp: 2026-11-22T15:47:40.824359+00:00
- Audit ref: 14399d5a-ec4c-42db-a543-f26c50d3e92e
- Pathway: human_verified_uat
- Adequate regulatory evidence fields: no
- Genuine human verification count: no
- Obligation: 96dd98d9-ad1e-4549-8a74-a82591b94db1

### 8. PRIN 2A.4.13R
- Publication: PS22/9: A new Consumer Duty
- AI classification: binding_requirement
- Provenance: **AUTOMATED_UAT_DECISION** — UAT / test pathway
- Reviewer: user_3Fa9TcFi8izkxHdDP58Qb3UY4mr (REVIEWER)
- Timestamp: 2026-11-22T13:13:25.543996+00:00
- Audit ref: 4a8a39ae-42ab-46d0-92ad-46139ebcd297
- Pathway: human_verified_uat
- Adequate regulatory evidence fields: no
- Genuine human verification count: no
- Obligation: 68051a63-ea05-45b5-bbef-4fdc94b1ae45

### 9. CONC 7.20.3R
- Publication: PS26/1 — Regulating Buy Now Pay Later (Deferred Payment Credit)
- AI classification: binding_requirement
- Provenance: **AUTOMATED_UAT_DECISION** — UAT / test pathway
- Reviewer: user_3Fa9TcFi8izkxHdDP58Qb3UY4mr (REVIEWER)
- Timestamp: 2026-11-22T10:53:25.826879+00:00
- Audit ref: 0df275ef-75a1-4d71-a4f9-3d3cf377fcf7
- Pathway: human_verified_uat
- Adequate regulatory evidence fields: no
- Genuine human verification count: no
- Obligation: 63b84f23-9b4f-424a-96c9-f33eb3192779

### 10. CONC 4.2A.3R
- Publication: PS26/1 — Regulating Buy Now Pay Later (Deferred Payment Credit)
- AI classification: binding_requirement
- Provenance: **AUTOMATED_UAT_DECISION** — UAT / test pathway
- Reviewer: user_3Fa9TcFi8izkxHdDP58Qb3UY4mr (REVIEWER)
- Timestamp: 2026-11-22T10:53:25.826879+00:00
- Audit ref: 0df275ef-75a1-4d71-a4f9-3d3cf377fcf7
- Pathway: human_verified_uat
- Adequate regulatory evidence fields: no
- Genuine human verification count: no
- Obligation: a0a7e64d-0cb4-406f-9ca4-484c91db348e

### 11. CONC 4.2A.6R
- Publication: PS26/1 — Regulating Buy Now Pay Later (Deferred Payment Credit)
- AI classification: binding_requirement
- Provenance: **AUTOMATED_UAT_DECISION** — UAT / test pathway
- Reviewer: user_3Fa9TcFi8izkxHdDP58Qb3UY4mr (REVIEWER)
- Timestamp: 2026-11-22T10:53:25.826879+00:00
- Audit ref: 0df275ef-75a1-4d71-a4f9-3d3cf377fcf7
- Pathway: human_verified_uat
- Adequate regulatory evidence fields: no
- Genuine human verification count: no
- Obligation: fdcf8241-608e-467d-a8f8-12a52c75b852

### 12. CONC 4.2A.7R
- Publication: PS26/1 — Regulating Buy Now Pay Later (Deferred Payment Credit)
- AI classification: binding_requirement
- Provenance: **AUTOMATED_UAT_DECISION** — UAT / test pathway
- Reviewer: user_3Fa9TcFi8izkxHdDP58Qb3UY4mr (REVIEWER)
- Timestamp: 2026-11-22T10:53:25.826879+00:00
- Audit ref: 0df275ef-75a1-4d71-a4f9-3d3cf377fcf7
- Pathway: human_verified_uat
- Adequate regulatory evidence fields: no
- Genuine human verification count: no
- Obligation: db123fac-c36c-4c0d-bb9e-54174ac15aa3


## REJECTED findings (36)

### 1. PDF p.114, FCA 2022/31, PRIN 2A.3.7R — AUTOMATED_UAT_DECISION — reviewer user_3Fa9TcFi8izkxHdDP58Qb3UY4mr
### 2. PDF p.114, FCA 2022/31, PRIN 2A.3.9R — AUTOMATED_UAT_DECISION — reviewer user_3Fa9TcFi8izkxHdDP58Qb3UY4mr
### 3. PDF p.114, FCA 2022/31, PRIN 2A.3.8R — AUTOMATED_UAT_DECISION — reviewer user_3Fa9TcFi8izkxHdDP58Qb3UY4mr
### 4. PDF p.114, FCA 2022/31, PRIN 2A.3.9R — AUTOMATED_UAT_DECISION — reviewer user_3Fa9TcFi8izkxHdDP58Qb3UY4mr
### 5. PDF p.114-115, FCA 2022/31, PRIN 2A.3.10R(1) — AUTOMATED_UAT_DECISION — reviewer user_3Fa9TcFi8izkxHdDP58Qb3UY4mr

… plus 31 more (see AUDIT.json).


## NEEDS REVIEW (12)

1. PDF p.94-95 · legal instrument — NEEDS_REVIEW — UNREVIEWED
2. PDF p.95-96 · legal instrument — NEEDS_REVIEW — UNREVIEWED
3. PDF p.96 · legal instrument, PDF p.21 — NEEDS_REVIEW — UNREVIEWED
4. PDF p.87-90 · legal instrument — NEEDS_REVIEW — UNREVIEWED
5. PDF p.90 · legal instrument — NEEDS_REVIEW — UNREVIEWED
6. PDF p.90-91 · legal instrument — NEEDS_REVIEW — UNREVIEWED
7. PDF p.93 · legal instrument — NEEDS_REVIEW — UNREVIEWED
8. PDF p.66 · legal instrument — NEEDS_REVIEW — UNREVIEWED
9. PDF p.68 · legal instrument — NEEDS_REVIEW — UNREVIEWED
10. PDF p.29 — NEEDS_REVIEW — UNREVIEWED
11. PDF p.40 — NEEDS_REVIEW — UNREVIEWED
12. PDF p.40 — NEEDS_REVIEW — UNREVIEWED

## APPROVED obligations in triage (9)

1. CONC 7.20.3R → obligation 57bcc479-fe9f-42ec-873e-3cdb1552a2cc (APPROVED) — staging maker-checker, not legal sign-off
2. PRIN 2A.4.35E → obligation 7143f1ff-c064-4123-bc2e-38e0102972df (APPROVED) — staging maker-checker, not legal sign-off
3. PRIN 2A.4.34R → obligation 2046ef71-f8b2-42f4-bdc4-3a1ec48b1b8a (APPROVED) — staging maker-checker, not legal sign-off
4. CONC 7.20.1R → obligation 96dd98d9-ad1e-4549-8a74-a82591b94db1 (APPROVED) — staging maker-checker, not legal sign-off
5. PRIN 2A.4.13R → obligation 68051a63-ea05-45b5-bbef-4fdc94b1ae45 (APPROVED) — staging maker-checker, not legal sign-off
6. CONC 7.20.3R → obligation 63b84f23-9b4f-424a-96c9-f33eb3192779 (APPROVED) — staging maker-checker, not legal sign-off
7. CONC 4.2A.3R → obligation a0a7e64d-0cb4-406f-9ca4-484c91db348e (APPROVED) — staging maker-checker, not legal sign-off
8. CONC 4.2A.6R → obligation fdcf8241-608e-467d-a8f8-12a52c75b852 (APPROVED) — staging maker-checker, not legal sign-off
9. CONC 4.2A.7R → obligation db123fac-c36c-4c0d-bb9e-54174ac15aa3 (APPROVED) — staging maker-checker, not legal sign-off

## Conclusion

All persisted decisions on the authorised staging tenant `b8f5e3a1-00ad-4000-8000-000000000001` are **staging/UAT workflow evidence**. **0** rows qualify as production regulatory human verification under current rules. PS22/9 legally verified count remains **0** unless separately evidenced.

Evidence: `docs/uat/evidence/obligation-triage-decision-audit-2026-11-24/`
