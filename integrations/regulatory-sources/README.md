# FORGENIQ Regulatory Source Integration Lab

Pre-production **live verification harness** for official regulatory sources. Not production ingestion.

- Catalogue IDs: `packages/reference-data/` (`REG-*`, `SRC-*`)
- **Does not** modify frozen `design-lab/regulatory-intelligence/`
- **Does not** write into RI workflows, obligations, or changes

## Layout

| Path | Purpose |
|------|---------|
| `core/` | HTTP client, allowlists, contract types, RSS parsing |
| `connectors/` | Batch 1 source connectors |
| `manifests/` | Tracked verification fingerprints (committed) |
| `evidence/` | Local raw verification output (gitignored) |
| `scripts/` | Live run + acceptance |

## Run Batch 1 live verification

```bash
node integrations/regulatory-sources/scripts/run-batch-1-live.mjs
```

## Acceptance (static + optional live)

```bash
node integrations/regulatory-sources/scripts/acceptance-batch-1.mjs
node integrations/regulatory-sources/scripts/acceptance-batch-1.mjs --live
```

## Batch 1B — Saudi / UAE resolution

```bash
node integrations/regulatory-sources/scripts/run-batch-1b-live.mjs
node integrations/regulatory-sources/scripts/acceptance-batch-1b.mjs --live
```

See `docs/BATCH-1B.md`.

Set `FORGENIQ_LIVE_VERIFY=1` to allow outbound HTTPS from acceptance `--live`.
