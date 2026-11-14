# Stage B — Secure eval evidence (operator review)

**Programme PASS:** not granted by automation. **Do not sign** until all required items are complete.

## Manifest integrity

| Check | Action | Status |
|-------|--------|--------|
| B-01 | Record `manifestSha256` from `stage-b-secure-evidence-manifest.json` in change control | Pending operator |
| B-02 | Recompute manifest hash locally (`generate-stage-b-evidence-manifest.mjs`) and confirm match | Technical PASS if scripts pass |
| B-03 | Confirm protected baseline files match recorded SHA-256 | See operator pack `baselineIntegrity` |

**Current manifest SHA-256:** see `docs/eval/stage-b-operator-signoff-pack.json` → `manifestVerification.recordedSha256`.

## Evidence scope and retention

| Check | Action | Status |
|-------|--------|--------|
| B-04 | Confirm eval corpus is offline-only (no Partner UAT / Org A DB snapshots in manifests) | Pending operator |
| B-05 | Confirm run outputs under `docs/eval/runs/` are sanitised before commit | Pending operator |

## Reproducibility (technical)

Run from `apps/platform`:

```bash
node scripts/acceptance-stage-b-secure-eval-evidence.mjs
node scripts/generate-stage-b-operator-signoff-pack.mjs
```

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