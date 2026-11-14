# Scoring evidence (offline)

Committed eval reports under `docs/eval/runs/` are **sanitised** and cannot reproduce D01–D11 without full engine answers.

## Layout

| Path | Git | Contents |
|------|-----|----------|
| `baselines/*-manifest.json` | Yes | Hashes, outcomes, dimension keys, config fingerprints |
| `local/` | **No** (gitignored) | Full answer text + citation identifiers for offline re-score |

## Generate (dry-run, no live Anthropic)

From `apps/platform`:

```bash
node scripts/acceptance-stage-d-scoring-reconstruction.mjs
```

Or via the eval runner:

```bash
node scripts/run-ask-ri-v2-eval-2c2.mjs --dry-run --test-ids=EVAL-B-01 \
  --scoring-evidence-local=../../docs/eval/scoring-evidence/local/my-run.json \
  --scoring-evidence-manifest=../../docs/eval/scoring-evidence/baselines/my-run-manifest.json \
  --out=../../docs/eval/runs/my-dry-run.json --force
```

## Historical live runs

Prior live runs without a local bundle remain **NOT_RECONSTRUCTABLE** from sanitised JSON only. Do not fabricate evidence.