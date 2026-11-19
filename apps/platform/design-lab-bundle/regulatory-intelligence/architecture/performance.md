# Performance budgets (Design Lab)

Instrumented via `js/platform/performance.js` and `scripts/acceptance-performance.mjs`.

## Design Lab expectations (indicative)

| Operation | Soft budget |
|-----------|-------------|
| Dashboard render (synthetic large data) | &lt; 500 ms |
| Work Queue build (400+ changes) | &lt; 200 ms |
| Attention Centre build | &lt; 200 ms |
| Full register HTML (changes list) | &lt; 100 ms |

Exceeding budgets logs a **warning** only — not a CI failure unless regression is extreme (&gt; 3s).

## Production target (not benchmarked here)

- API p95 latency per route class TBD
- Server-side pagination for registers
- Report generation as async jobs

## Anti-patterns avoided

- Unbounded full-state render for large tenants
- O(n²) nested scans in hot paths (monitored via large-data fixture)
