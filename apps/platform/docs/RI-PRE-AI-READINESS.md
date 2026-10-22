# FORGENIQ RI — Pre-AI Readiness Baseline

**Branch:** `production/regulatory-intelligence`  
**Baseline commit:** (see git tag `ri-production-pre-ai-baseline`)  
**Prior phase:** Phase 7 ingestion operations (`f61a6d8`)

This document records the Phase 7A review of the **non-AI** production RI platform in `apps/platform`. It is the gate before Ask RI, AI analysis, or autonomous workflow automation.

---

## 1. Architecture map (Phases 1–7)

### Identity → tenant workflow

| Layer | Responsibility | Primary location |
| --- | --- | --- |
| Identity | Clerk sessions only | `lib/auth/*`, middleware |
| Organisation | Active org + membership | `organisation_memberships`, `require-organisation` |
| Role | `platform_role` matrix | `lib/roles.ts`, `lib/ri/permissions.ts` |
| RLS | Tenant isolation via `is_active_member` | `supabase/migrations/*` |
| Global catalogue | Regulators, sources, publications, versions | Reference seed + global tables |
| Ingestion | Retrieve → normalise → version → publish | `lib/ri/ingestion/*`, `ops/*` |
| Tenant triage | `organisation_publications` | Publication detail + server actions |
| Applicability | Human assessment rows | `applicability_assessments` |
| Change / impact / obligation | Governed lifecycle | `lib/ri/services/*`, workflow events |
| Downstream | Policy → assurance via **join tables** | Phase 5 services, `lib/ri/links.ts` |
| Operations | Schedule config, runs, health, alerts | `regulatory_source_operations`, admin routes |

### Ingestion operations path

`SRC-*` (catalogue) → `regulatory_source_operations` (disabled by default) → scheduler tick / manual executor → `ingestion_runs` (DB lock) → `ingest-engine` → `regulatory_publications` + `regulatory_publication_versions` → health / deduped `operational_alerts` / `notification_events` → `/ri/admin/*`.

### Boundaries (no duplicate authority)

- **Canonical relationships:** explicit FK + link tables only (`docs/RI-DATA-MODEL.md`, Phase 3 acceptance).
- **Trace:** `getObligationDownstreamTrace` uses joins; supporting evidence on shared controls is labelled separately from direct obligation evidence.
- **Design Lab:** frozen at `d46ca1b` / `ri-design-lab-freeze`; production does not import lab routers or Ask RI.
- **Connectors:** server-side registry only; browser never supplies connector URLs.

### Known coupling (intentional)

- Ingestion eligibility reads **packages/reference-data** (semantic coverage, gating) at runtime — correct separation from Integration Lab verification status.
- Local acceptance uses **embedded Postgres** and **TEST_ONLY** fixtures; not production Supabase.

### Gaps / incomplete abstractions (non-blocking)

| Item | Severity | Notes |
| --- | --- | --- |
| No dedicated “Applicability” top-level route | LOW | Triage + applicability live on publication detail |
| Admin ingestion UI not linked from main subnav | LOW | `/ri/admin/*` is role-gated; banner states TEST/MANUAL only |
| `operational_alerts` / `regulatory_source_operations` RLS is global read for authenticated users | MEDIUM | Acceptable for small admin set today; tighten to org-scoped or service role when multi-tenant ops UI expands |
| No `.env.example` in repo | MEDIUM | Env contract documented in `lib/env.ts` only |

---

## 2. Security summary

| Control | Status |
| --- | --- |
| Clerk sole IdP | PASS — no Supabase Auth schema |
| Service role server-only | PASS — `lib/supabase/admin.ts`, acceptance scans |
| Org context server-side | PASS — `require-organisation`, membership checks |
| Role spoofing resisted | PASS — Phase 2 fixture tests |
| RLS on tenant tables | PASS — no `USING (true)` in migrations |
| Cross-org links blocked | PASS — Phase 3A + Phase 5 RLS tests |
| Connector URLs not browser-supplied | PASS — ingest by known `SRC-*` + catalogue |
| Scheduler / ingest server-side | PASS — CLI + pg client / server actions |
| Ingestion admin roles | PASS — `COMPLIANCE_MANAGER+` for read/ack/test run |

---

## 3. Tenancy

- **Global:** `regulators`, `regulatory_sources`, `regulatory_publications`, `regulatory_publication_versions`, ingestion runs/items, source operations (operational).
- **Tenant:** triage (`organisation_publications`), applicability, changes, impacts, obligations, and all downstream entities include `organisation_id` + RLS.
- **Proven:** one global publication → ORG-A and ORG-B separate changes/triage (Phase 4 local DB).

---

## 4. Relationship authority

Production does **not** use BFS, denormalised linked-ID arrays, or implicit evidence/finding ownership via shared controls.

**Re-verified (Phase 5 local DB):**

- Shared control: OBL-A direct evidence yes; OBL-B no direct evidence via shared control.
- Finding not implicitly attributed to OBL-B.

---

## 5. Regulatory sources (41 / 36)

| Dimension | Baseline |
| --- | --- |
| Regulators | 36 (semantics acceptance) |
| Catalogue sources | 41 |
| Integration verification | Integration Lab manifests — **not** operational health |
| Semantic coverage | `COVERAGE_VERIFIED` + RI use-case gating required for ingestion eligibility |
| Production enablement | All `production_status = NOT_ENABLED`; ops `enabled = false` unless TEST harness |

Ingestion eligibility (`eligibility.mjs`) requires semantic coverage — connectivity / `LIVE_VERIFIED` alone is insufficient.

---

## 6. Ingestion & operations

Covered by Phase 6–7 acceptance: idempotency, versioning, provenance, hashes, SSRF/HTTPS/limits via integration connectors, retry/backoff, concurrency partial unique index, stale detection helper, alert dedupe, failure isolation, notification events (in-app only).

No production scheduler, Vercel cron, or enabled production sources.

---

## 7. Human governance (pre-AI critical)

Ingestion and scheduler **do not** create: applicability, changes, impacts, obligations, policies, risks, controls, actions, evidence, findings, assurance, or `organisation_publications`.

Human workflow + server actions remain authoritative. Phase 6/7 local DB asserts zero tenant auto-create after ingest.

---

## 8. Workflow & auditability

**Deterministic local chain:** Phase 3A seeds publication → Phase 4 workflow fixtures → obligation; Phase 5 full downstream; Phase 6 ingest does not shortcut lifecycle.

**Reviewer chain:** Regulator → Source → Publication → Version (ingest) → Applicability → Change → Impact → Obligation → links → Action/Evidence/Assurance. Trace page (`/ri/trace/[obligationId]`) resolves upstream obligation detail and downstream joins; workflow events recorded on key mutations.

---

## 9. Status taxonomy

**Obligations** (`obligation_status` / `lib/ri/enums.ts`): DRAFT, IN_REVIEW, OPEN, IN_PROGRESS, OVERDUE, COMPLETE, HISTORIC, CLOSED. Groups: ACTIVE = OPEN+IN_PROGRESS+OVERDUE; terminal = COMPLETE+HISTORIC+CLOSED.

**Other enums (Postgres):** `regulatory_change_status`, `impact_assessment_status`, action/finding/assurance statuses in lifecycle migration; ingestion `ingestion_run_status` (+ QUEUED, SKIPPED, CANCELLED in ops migration); `source_health_status`; `operational_alert_status`.

**Ambiguity (documented, not changed):** `OVERDUE` on obligations may be derived in UI (`action-overdue.ts`) vs stored status — reporting should use documented groups.

---

## 10. Pre-AI boundary (policy — not implemented)

### Future AI may assist (with human review)

- Summarise or classify publications and changes.
- Suggest applicability, impact themes, or **candidate** obligations.
- Explain evidence and answer questions over **verified** RI + tenant data with citations to stored artefacts.

### AI must not autonomously

- Set canonical source identity, URLs, or provenance.
- Decide tenant membership or roles.
- Approve applicability, obligations, assurance outcomes, or close findings/actions outside authorised human workflow.
- Create or rewrite canonical join ownership.
- Invent citations or mutate publication hashes/versions.

---

## 11. Technical debt register

### BLOCKER

_None in application code at this baseline._

### HIGH

| ID | Finding | Component | Why it matters | Phase | Blocks AI? |
| --- | --- | --- | --- | --- | --- |
| H-1 | Production Clerk + Supabase not exercised in CI | Deploy / env | Real tenant JWT + RLS only proven locally | Production cutover | No (blocks prod, not model design) |
| H-2 | Provider credentials & commercial licensing for live regulators | Integrations | Many sources NOT_ENABLED / restricted | Ingestion prod | No for sandbox AI on tenant data |
| H-3 | Observability (metrics, tracing, alert routing) not wired | Ops | Incidents rely on DB alerts only | Ops | No |

### MEDIUM

| ID | Finding | Component | Why | Phase | Blocks AI? |
| --- | --- | --- | --- | --- | --- |
| M-1 | Missing committed `.env.example` | DX / security | Harder to classify PUBLIC vs SERVER vars | Platform | No |
| M-2 | Global RLS read on operational tables | DB | All authenticated users can read ops alerts | Ops hardening | No |
| M-3 | Admin routes absent from main RI subnav | UI | Discoverability for compliance managers | UX | No |
| M-4 | Publication list capped at 200 | `publications.ts` | Large catalogues need pagination | Scale | No |
| M-5 | Ingestion run history default limit 50 | `ingestion-admin.ts` | Long ops history needs paging | Ops UI | No |
| M-6 | ACCESS_RESTRICTED / research-pending sources (CBUAE, FSRA, Tadawul, etc.) | Catalogue | Incomplete global corpus | Ingestion | No for AI on existing data |

### LOW

| ID | Finding | Component | Why | Phase | Blocks AI? |
| --- | --- | --- | --- | --- | --- |
| L-1 | No dedicated empty-state for zero publications in prod | UI | UX polish | UX | No |
| L-2 | `staleAfterMinutes` read but unused in one health path | `health.mjs` | Lint noise; stale uses SQL path | Ops | No |
| L-3 | Build ID defaults to `local-dev` | `lib/env.ts` | Traceability in prod needs `FORGENIQ_BUILD_ID` | Deploy | No |

### PARKED_FOR_PRODUCTION

- Production scheduler provider (Vercel cron / external runner).
- Enabling `production_status = ENABLED` per source with runbooks.
- External notification providers (email/Slack).
- Remote Supabase migration apply + backup strategy.
- DNS / public site / Stripe (out of RI scope).

---

## 12. Acceptance

**Master runner:** `npm run test:acceptance:ri` (platform) orchestrates Phases 1–7, reference catalogue, source semantics, and verification manifests.

**Database reproducibility:** Phase 3A runs two full clean embedded-Postgres cycles (`DATABASE REPRODUCIBILITY: PASS`).

**Failure / recovery scenarios (deterministic):**

| Scenario | Suite |
| --- | --- |
| A Source succeeds | Phase 7 scheduler PSR |
| B Transient fail → retry | Phase 7 retry harness |
| C Recovery → health + alerts | Phase 7 recovery assertions |
| D Unchanged publication | Phase 6 idempotency |
| E New hash → version | Phase 6 version test |
| F Foreign tenant read blocked | Phase 3A/5 RLS |
| G Cross-tenant link blocked | Phase 5 RLS |

---

## 13. AI foundation ready?

**YES** for building **human-in-the-loop** AI on top of this schema, permissions, provenance, and acceptance gates — provided AI features respect the boundary in §10 and do not bypass ingestion or relationship authority.

**Not ready** for autonomous production ingestion or unsupervised obligation approval without addressing PARKED_FOR_PRODUCTION and HIGH deploy items.
