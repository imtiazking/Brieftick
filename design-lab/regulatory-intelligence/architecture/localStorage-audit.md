# localStorage usage audit

## Platform persistence (via `platform-persistence.js`)

| Key | Purpose |
|-----|---------|
| `forgeniq-ri-lab-v2` | Canonical RI lab state (all domains) |
| `forgeniq-ri-lab-v1` | Legacy migration only |

Access path: `store.js` → `savePersistedJson` / `migrate.js` → `loadPersistedJson`.

## Allowed UI preferences (direct localStorage)

| Key | Module | Purpose |
|-----|--------|---------|
| `ri-demo-guide-dismissed` | `demo-journey.js` | Walkthrough UI |
| `ri-demo-walkthrough` | `demo-journey.js` | Active guided demo step |

## Test scripts

Acceptance suites read/clear storage for automation — not product runtime.

## Rule

UI / Views → Services → Adapter → Persistence. Exceptions documented above.
