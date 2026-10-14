# FORGENIQ Regulatory Intelligence Design Lab — changelog

## Unreleased (Design Lab 0.x)

### RI AI bridge (Enhancement 5A — pre-continuation)

- Local AI bridge moved outside repo to `%LOCALAPPDATA%\forgeniq-ri\ri-ai-bridge`; client-safe contract in `js/ai-bridge/ai-analysis-contract.js`.
- RI documentation: `docs/AI-REGULATORY-INTELLIGENCE.md` (local origin, bridge URL, acceptance scope).
- Acceptance `acceptance-ri-ai-5a.mjs`: public asset graph scan, bridge exposure checks.

### Schema

- **v17** — Enhancement **5C Intelligence Assistant** (FINAL RI AI Design Lab phase): Ask RI, deterministic retrieval, insufficient-evidence gate, regulatory text comparison, Basel→PRA intelligence, executive/board summaries, audit AI-005–007 / AI-019–024, no deployment.
- **RI AI DESIGN LAB: COMPLETE** (5A + 5B + 5C).
- **v16** — Enhancement **5B Compliance Workflow AI**: change analysis, sector/framework/theme mapping suggestions, IA drafting assist, obligation suggestions, policy/risk/control impact hints, human edit traceability (`riAiWorkflowTraces`), audit events AI-002–004 / AI-014–018, no auto-approval or cascade.
- **v15** — AI 5A domain foundation (`riAiAnalysisResults`, three-dimensional analysis state, `AiContextBuilder`, `FixtureAiProvider`, validator, citations, contextHash, audit, freshness, retention).
- **Enhancement 5A COMPLETE** — AI Summary UI, fixture/live labelling, human review, OpenAI Responses provider + localhost-only bridge, source-grounded citations, AI-011–013 acceptance, no deployment.
- **Enhancement 5B COMPLETE (Design Lab)** — workflow AI panels, fixture scenarios, bridge allowlist extended for 5B task types; no deployment.
- **v14** — Basel Committee / BIS Basel Framework live source, international→UK implementation mappings, Banking provenance layers.
- **v13** — The Pensions Regulator (TPR) live source via sitemap / Document Library HTML metadata.
- **v12** — UK legislation.gov.uk live source (Legislation connector, records, staging, coverage promotion, verification scripts).
- **v11** — Sector regulatory landscape (sectors, frameworks, compliance themes, coverage model, navigation dropdown, My sectors).
- **v10** — AI runtime collections (`aiExecutions`, providers, tenant AI policy, evaluation runs).

### Hardening

- View error boundary and unknown-route handling
- Migration idempotency helper `migrateSavedSnapshot`
- Corrupt localStorage recovery baseline
- Platform health and readiness admin routes
- Non-functional acceptance scripts

### Prior milestones

- v9 — Live regulatory integration structures
- v8 — Platform architecture / tenant mock
- v7 — Assurance
- v6 — AI Governance
- v5 — Enterprise governance
- v4 — Ingestion architecture
