# Technical debt register

| Item | Risk | Mitigation path |
|------|------|-----------------|
| Direct `store.js` reads in views | Bypasses service boundary | Route through `platform-service` over time |
| `sourceDocuments[pubId]` compatibility | Dual source models | Canonical catalog migration |
| Legacy AI projection fields on changes | Drift from `aiAnalyses` | Read canonical analysis only |
| Client-side mock `assertPermission` | Not production security | Server RBAC mandatory in API |
| `localStorage` persistence | Size/corruption/tamper | PostgreSQL + server session |
| Synchronous job/ingestion simulation | Misleading ops model | Queue workers |
| Fixture AI default | No live model behaviour | Provider adapter server-side |
| PDF parsing boundary in browser | Limited extraction | Server-side document service |
| Partial rowVersion coverage | Stale updates on some entities | Extend to critical mutations in API |
| Default unknown sub-routes under known top-level | Some fall through to dashboard | Tighten per-entity not-found |

Compatibility code is **intentional** until production cutover; do not remove without migration plan.
