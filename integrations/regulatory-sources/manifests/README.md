# Tracked verification manifests

Portable Integration Lab verification records (fingerprints + official URLs only).

- **Batch 1:** `batch-1-verification.json`
- **Batch 1B:** `batch-1b-verification.json`
- **Batch 2:** `batch-2-verification.json` (Saudi / UAE / US expansion; historical technical pass)
- **Semantic remediation:** `batch-semantic-remediation-verification.json` (split sources, rulemaking routes, remapped connectors)

Referenced from `packages/reference-data/catalogue/source-integration.mjs` via `verificationEvidenceRef`.

Manifest entries may include `coverageVerificationStatus` and `contentClasses` (semantic audit; separate from technical `verificationStatus`). See `packages/reference-data/catalogue/source-coverage.mjs`.

Raw downloads remain under `../evidence/` (gitignored). Regenerate manifests after a local lab run:

`node integrations/regulatory-sources/scripts/build-verification-manifests.mjs`
