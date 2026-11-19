# Service boundaries

## Ingestion (future module/worker)
Connector execution, retrieval, fingerprinting, duplicate/version detection, normalisation, parsing, publication creation, AI handoff. Maps to existing `ingestion-pipeline.js` + seeds.

## AI Runtime (Design Lab: `js/ai-runtime/`)
`requestAiExecution` → **AI Orchestrator** → provider registry → fixture or external adapter → validation → `aiExecutions` + canonical `aiAnalyses` / `aiClaims`. Views use **platform/store** only, not providers.

## AI Analysis (governed module)
Approved use case/model/config enforcement, claims/citations, grounding, provenance persistence — never final compliance decisions alone. Distinct from technical **AI Execution** records.

## AI Operations (monitoring)
Execution list/detail (`#/ai-operations`, `#/ai-execution/:id`) — reliability and provenance, not governance outcomes.

## Workflow / Governance (future module)
Command validation, approvals, maker/checker, delegations, attestations, closure — **server-side mandatory**.

## Assurance (future module)
Reviews, findings, validation, attestations, packs, implementation health — separate from governance approvals.

## Frontend services (Design Lab)
`services/platform-service.js`, `adapters/local-platform-adapter.js`.
