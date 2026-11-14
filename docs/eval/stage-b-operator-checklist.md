# Stage B — Secure eval evidence (operator review)

**Programme PASS:** not granted by automation. **Do not sign** until all required items are complete.

## Manifest integrity

| Check | Action | Status |
|-------|--------|--------|
| B-01 | Record `manifestSha256` from `stage-b-secure-evidence-manifest.json` in change control | Pending operator |
| B-02 | Recompute manifest hash locally (`generate-stage-b-evidence-manifest.mjs`) and confirm match | **Evidence:** `acceptance-stage-b-secure-eval-evidence.mjs` (engineering); operator hash match pending |
| B-03 | Confirm protected baseline files match recorded SHA-256 | See operator pack `baselineIntegrity` |

**Current manifest SHA-256:** see `docs/eval/stage-b-operator-signoff-pack.json` → `manifestVerification.recordedSha256`.

## Evidence scope and retention

| Check | Action | Status |
|-------|--------|--------|
| B-04 | Confirm eval corpus is offline-only (no Partner UAT / Org A DB snapshots in manifests) | Pending operator |
| B-05 | Confirm run outputs under `docs/eval/runs/` are sanitised before commit | **Evidence:** `eval-report-sanitize.mjs`; scoring full text → `docs/eval/scoring-evidence/local/` (gitignored) |

## Reproducibility (technical)

Run from `apps/platform`:

```bash
node scripts/acceptance-stage-b-secure-eval-evidence.mjs
node scripts/generate-stage-b-operator-signoff-pack.mjs
```

## Operator decisions still required

| ID | Decision | Engineering evidence |
|----|----------|----------------------|
| B-01 | Manifest SHA in change control | `manifestVerification` in signoff pack |
| B-04 | No Partner UAT / Org A data in eval corpus | Offline corpus manifest only — **SME confirm** |
| B-05 | SME secure-evidence attestation | Not auto-approved |
| SEC-B-01 / SEC-B-02 | Key handling + excerpt redaction | Stage E gated; `sanitizeEvalReport` + scoring-evidence `local/` gitignore |

**Already supported by automation (not programme PASS):** B-02 baseline hashes, B-03 harness/diagnostics acceptance (`technicalReadinessForOperatorReview: true` in signoff pack).

## Security review

Review `outstandingSecurityConcerns` in `docs/eval/stage-b-operator-signoff-pack.json`.

## Operator attestation (required for programme PASS)

| Field | Value |
|-------|--------|
| Attested by | _blank_ |
| Date | _blank_ |
| Change control reference | _blank_ |
| Signature / approval record | _blank_ |

**Operator approval JSON field:** `operatorApproval` must be set explicitly in sign-off pack or external GRC tool — not auto-filled by engineering.