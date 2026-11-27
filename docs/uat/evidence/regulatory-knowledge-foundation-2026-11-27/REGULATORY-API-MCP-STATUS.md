# Regulatory API / MCP integration status (Tranche G2)

Research-only for commercial connectors; reuse existing FORGENIQ connector registry for production ingestion.

| Source | Status | Notes |
|--------|--------|--------|
| FCA Handbook API | Existing RSS/HTML connectors + corpus backfill | No new paid API |
| UK Government Lex | Via `REG-UK-LEG` catalogue connector | Corpus tick backfills canonical URLs |
| Legislation.gov.uk | Batch connector (`REG-SA-LEG` / UK legislation paths) | Rate-limited fetch |
| EUR-Lex / CELLAR | Not wired in this tranche | Research backlog |
| Federal Register | `federal-register-connectors` in registry | Scheduler + corpus |
| eCFR | Semantic remediation connectors | Where URLs in catalogue |
| RegAlert MCP | Not integrated | Awaiting approval |
| OpenLaw MCP | Not integrated | Awaiting approval |
| Ansvar MCP | Not integrated | Awaiting approval |

**G2 priority:** complete hosted snapshot/PDF corpus on existing 322 publication catalogue before optional MCP expansion.