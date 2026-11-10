# Phase 2C.2 — Live Haiku provider error investigation

**Failed report:** `runs/phase-2c2-ask-ri-v2-eval-live-claude-haiku-5-5-2026-11-10T20-34-11-382Z.json`

---

## 1. Root cause (probable)

The live run showed **36 `PROVIDER_ERROR`** rows with **`providerInvoked: true`**, **~54ms latency** per case, **zero tokens**, and **no `providerError` / HTTP fields in the saved JSON**.

| Finding | Implication |
|---------|----------------|
| Fast failure (~54ms) | Pre-provider reject **or** immediate HTTP 4xx (not timeouts) |
| `requestCount: 0` in spend summary | **Accounting bug:** attempts were not counted on failure (fixed) |
| Sanitised report omitted `providerError` | Operators could not see auth/model errors (fixed) |
| Integration uses `fetch` Messages API (not Anthropic SDK) | Same path as existing `anthropic-provider-core` — no separate SDK initialisation |
| `loadLocalEnvFile` not applied in all entrypoints | `ANTHROPIC_API_KEY` in `.env.local` may be **missing** if the shell did not export it (fixed: shared loader in eval + harness) |

**Most likely on operator machine:** either **API key not visible to the Node process** (`AI_PROVIDER_NOT_CONFIGURED`, no HTTP), or **`claude-haiku-5-5` not enabled on the key** (`404 not_found_error`, HTTP with `providerErrorType: not_found_error`). Both produced the same opaque `PROVIDER_ERROR` label before this fix.

Authentication was **not assumed** — diagnostics now record `requestReachedProvider`, HTTP status, and Anthropic `error.type`.

---

## 2. Files corrected

- `lib/ri/ai/anthropic-messages-core.mjs` — attach HTTP diagnostics on errors
- `lib/ri/ai/anthropic-provider-core.mjs` — validate key format against actual key argument
- `lib/ri/reasoner/invoke-anthropic-reasoner.mjs` — structured `diagnostics` object
- `lib/ri/reasoner/anthropic-provider-diagnostics.mjs` — sanitised failure + harness classification
- `lib/ri/reasoner/load-local-env.mjs` — shared `.env.local` loader (no logging)
- `lib/ri/reasoner/run-ask-ri-v2-pipeline.mjs` — `BLOCKED_*` statuses; pass diagnostics
- `lib/ri/eval/run-eval-suite-v2.mjs` — harness outcomes; `providerAttempts`
- `scripts/run-ask-ri-v2-eval-2c2.mjs` — preserve diagnostics in sanitised JSON
- `scripts/run-ask-ri-v2-anthropic-smoke.mjs` — single-case smoke ($0.25 cap)
- `scripts/run-ask-ri-eval-suite.mjs` — load env for `--engine=v2` live runs

---

## 3. Smoke test (this environment)

**Report:** `runs/phase-2c2-ask-ri-v2-smoke-claude-haiku-5-5-2026-11-10T20-45-21-301Z.json`

| Check | Result |
|-------|--------|
| API key present in process | **No** (agent host has no secret) |
| Request reached Anthropic | **No** |
| `requestCount` | **1** (attempt recorded) |
| Structured output | Not reached |
| Verifier | Not reached |

Re-run on operator workstation:

```powershell
cd apps\platform
$env:RI_AI_EXECUTION_ENABLED='true'
node .\scripts\run-ask-ri-v2-anthropic-smoke.mjs --model=claude-haiku-5-5
```

---

## 4. Accounting fixes

- Reference / authority blocks → `BLOCKED_REFERENCE_VALIDATION` / `BLOCKED_AUTHORITY_GATE` (not `PUBLIC_ELIGIBLE_EXECUTED`)
- Harness labels: `PROVIDER_FAILURE`, `REFERENCE_REJECTED`, `SECURITY_BLOCK_EXPECTED` — **not** regulatory `FAIL`
- `providerAttempts` counts failed HTTP calls

---

## 5. Rerun Haiku full suite

1. Confirm smoke succeeds with `requestReachedProvider: true` and token usage.
2. If `not_found_error` for `claude-haiku-5-5`, enable model on the Anthropic account or set `ASK_RI_V2_EVAL_MODEL=claude-haiku-4-5` for a fallback trial.
3. Run full eval with timestamped output only:

```powershell
node .\scripts\run-ask-ri-v2-eval-2c2.mjs --model=claude-haiku-5-5
```

Do **not** overwrite `20-34-11` live report.
