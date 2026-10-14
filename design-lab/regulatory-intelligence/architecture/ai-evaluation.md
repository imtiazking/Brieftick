# AI evaluation architecture

## Layers

- Schema validity
- Citation validity (section IDs in context)
- Grounding status distribution
- Human override rate (governance data)
- Model/config regression comparison

## Golden dataset

`fixtures/ai-evaluation/golden-v1.json` — deterministic cases aligned to demo scenarios.

Metrics are **Design Lab / fixture** only — not production accuracy claims.

## Model release gate (future)

Evaluation → governance approval → controlled activation → monitoring → rollback metadata preserved.

Shadow mode may compare models without affecting workflow (architecture only).
