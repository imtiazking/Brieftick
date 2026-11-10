# Ask RI Intelligence Engine V2 — Regulatory Accuracy Evaluation Specification (v1)

**Phase:** 2A — specification and read-only investigation only  
**Evaluation dataset:** `docs/eval/ask-ri-v2-eval-suite-v1.json`  
**Engine under test (baseline):** connected Ask RI deterministic path (`runAskRiDeterministic` in `apps/platform/lib/ri/ask-ri/run-ask-ri.mjs`)  
**Out of scope:** V2 grounded AI reasoner, live LLM execution, schema migrations, catalogue mutations  

---

## 1. Evaluation objectives

1. Establish a **repeatable, offline** baseline of Ask RI accuracy before V2 implementation.
2. Measure performance across regulatory question types (catalogue, tenant graph, cross-source, adversarial).
3. Separate **automated structural checks** from **SME regulatory judgement** (all gold references in v1 are `PROVISIONAL`).
4. Define **critical failure** rules so citation volume never masquerades as correctness.
5. Specify a **future harness** that can replay frozen evidence and later compare deterministic vs AI-enabled engines.

---

## 2. Test category coverage

| Category | IDs | Authored count | Focus |
|----------|-----|----------------|--------|
| A — Publication understanding | `EVAL-A-01` … `EVAL-A-05` | 5 | Fair Value HTML, FG22/5 PDF, summaries, affected firms |
| B — Regulatory obligations | `EVAL-B-01` … `EVAL-B-04` | 4 | Handbook vs guidance, evidence, compliance framing |
| C — Consultations & finalised guidance | `EVAL-C-01` … `EVAL-C-05` | 5 | CP26/38 status, deadlines, proposed vs final |
| D — Financial crime intelligence | `EVAL-D-01` … `EVAL-D-05` | 5 | AML, fraud, sanctions, governance (CP26-centric) |
| E — Regulatory impact | `EVAL-E-01` … `EVAL-E-04` | 4 | Business functions, controls, monitoring |
| F — Organisation-specific | `EVAL-F-01` … `EVAL-F-05` | 5 | Tenant graph: changes, obligations, controls |
| G — Cross-source analysis | `EVAL-G-01` … `EVAL-G-04` | 4 | HTML+PDF, multi-publication, tenant+catalogue |
| H — Semantic discovery | `EVAL-H-01` … `EVAL-H-05` | 5 | No explicit publication title/reference |
| H — **Operator held-out** | `EVAL-H-90` … `EVAL-H-99` | **0** (reserved) | Operator supplies later |
| I — Insufficient evidence | `EVAL-I-01` … `EVAL-I-04` | 4 | Missing pubs, invented deadlines, unknown positions |
| J — Adversarial | `EVAL-J-01` … `EVAL-J-04` | 4 | False law, wrong pub, guidance-as-legislation |

**Total:** 45 authored cases + 10 operator placeholders = **55 case records**.

---

## 3. Reference answer integrity

- Every authored expected theme, citation expectation, and regulatory status in the JSON suite is marked **`referenceReviewStatus: PROVISIONAL`** unless an SME has independently signed off (`EXPERT_REVIEWED`).
- **v1 has zero `EXPERT_REVIEWED` references** — none were supplied for this phase.
- Traceability for staging catalogue anchors (read-only identity modules, no secrets):

| Publication | `publicationId` | Extraction profiles | Revision IDs (staging) | Evidence basis |
|-------------|-----------------|---------------------|----------------------|----------------|
| Fair value in consumer finance (HTML) | `56b0beca-d8c3-4267-a794-9079009af661` | `html_article_v2` | `613c078c-3639-4ce5-9666-73c5352f44fd` | `fg22-5-staging-identity.mjs`, BUS-UAT-018 |
| FG22/5 Consumer Duty guidance (PDF) | `a761cacc-8742-493d-b200-eb5d9a3ab884` | `pdf_primary_v1` | `56fd1525-7f30-401e-82fd-16abf90100aa` | acceptance PDF ranking; pages **58, 64, 66, 67** accepted in UAT |
| CP26/38 Financial Crime Guide updates | `4d05b49b-a4a4-4101-8c87-7d3983315f25` | `html_article_v2` + `pdf_primary_v1` | HTML `50197cc3-c7e7-4835-b566-f6174105eba2`, PDF `c003a60a-eff8-4152-a2ce-47e20a206e29` | `cp26-38-staging-identity.mjs` |

Where expected PDF pages or sections are **unverified** in offline fixtures, cases are labelled `evidenceAvailability: FIXTURE_OR_STAGING_REQUIRED` in the dataset.

---

## 4. Scoring methodology

### 4.1 Dimensions (0–3 each for automation where applicable; SME rubric 0–3 for interpretation)

| ID | Dimension | Automated signal (examples) | SME judgement |
|----|-----------|---------------------------|---------------|
| D01 | Question understanding | `interpretedAs` / `queryPlan.mode` match `expectedIntent` | Novel phrasing |
| D02 | Publication selection | Resolved `publicationId` set vs expected | Paraphrase discovery |
| D03 | Evidence relevance | Ranked block scores; intro-page rate | Thematic fit |
| D04 | Citation correctness | Excerpt contains claim keywords; page/section match | Claim-level support |
| D05 | Regulatory status | `regulatoryStatus` / consultation flags | Binding vs guidance |
| D06 | Answer completeness | Required theme checklist coverage | Material parts missed |
| D07 | Control-impact interpretation | Applicability labels; control verbs in answer | FC impact quality |
| D08 | Unsupported claims | Prohibited-claim detector | Deadline invention |
| D09 | Uncertainty handling | Uncertainties present when `evidenceGaps` expected | Honest gaps |
| D10 | Cross-domain reliability | Pass rate on held-out + adversarial | Generalisation |
| D11 | Tenant security | No foreign `organisation_id` in retrieval | RBAC (live only) |

**Composite indices (report separately):**

- **Evidence confidence** — D03 + D04 (weighted).
- **Regulatory interpretation quality** — D05 + D07 + SME.
- **Question completeness** — D06 + D09.

**Overall case outcome:** `PASS` | `PARTIAL_PASS` | `FAIL` | `CORRECT_INSUFFICIENT_EVIDENCE` | `NOT_RUN` | `AWAITING_SME_REVIEW`.

**Rule:** Any **critical failure** (below) caps overall outcome at `FAIL` regardless of other scores.

**Rule:** High citation count **does not** imply PASS.

### 4.2 Critical failure conditions (CF-01 … CF-10)

1. Invented binding regulatory obligations  
2. Fabricated regulatory deadlines  
3. Citations that do not substantiate material claims  
4. Evidence attributed to the wrong publication  
5. Superseded publication versions presented as current  
6. Consultation proposals presented as final requirements  
7. Guidance incorrectly represented as legislation  
8. Unsupported inference presented as an FCA requirement  
9. Cross-tenant data exposure  
10. Fabricated regulatory evidence  

Encoded in JSON as `criticalFailureConditions`.

### 4.3 Preventing self-approval of regulatory interpretations

- Gold references remain **PROVISIONAL** until SME sign-off (`reviewer`, `reviewStatus` fields).
- Harness **must not** use the same engine output to auto-validate semantic themes; only structural checks (IDs, pages, forbidden phrases, status flags) are automated.
- SME review uses a **versioned rubric** (`scoringRubricVersion` in dataset) independent of engine version.
- Operator held-out cases (`EVAL-H-90`–`99`) are ingested **after** baseline freeze to detect overfitting.

---

## 5. Offline harness design (Phase 2B implementation — not built in 2A)

### 5.1 Goals

- Load `ask-ri-v2-eval-suite-v1.json` (and future versions).
- Hydrate `AskRiState` from **frozen evidence packs** (JSON exports of `html_article_v2` / `pdf_primary_v1` blocks + optional tenant fixtures).
- Call **`runAskRiDeterministic(state, question)`** only — **never** `askRiProduction` (writes `ask_ri_query_log` and workflow events).
- Emit per-case dimension scores, critical-failure flags, and aggregate reports.
- Later: plug V2 reasoner behind the same interface with `engineVersion` tag.

### 5.2 Proposed layout (future)

```
apps/platform/scripts/eval/
  run-ask-ri-eval-suite.mjs      # CLI entry
  lib/
    load-evidence-pack.mjs        # read fixtures from docs/eval/evidence-packs/
    score-case.mjs                # D01–D11 automation
    prohibited-claims.mjs         # CF detectors
    report.mjs                    # JSON + markdown summary
docs/eval/
  ask-ri-v2-eval-suite-v1.json
  evidence-packs/
    fair-value-html-v1.json       # optional frozen exports (Phase 2B)
    fg22-pdf-v1.json
    cp26-pdf-v1.json
    tenant-demo-v1.json
```

### 5.3 Dependencies

| Component | Source | Notes |
|-----------|--------|-------|
| Deterministic engine | `run-ask-ri.mjs` | Pure function; confirmed no DB writes |
| Evidence attach (optional) | `load-publication-pdf-evidence.mjs` | **Do not call in baseline** — requires Supabase; use frozen packs instead |
| Tenant graph | `production-state.mjs` / Design Lab `createFreshState` | Offline fixtures only |
| Minimal PDF bytes | `integrations/regulatory-sources/fixtures/` | Unit-level only |
| Staging IDs | `cp26-38-staging-identity.mjs`, `fg22-5-staging-identity.mjs` | Read-only reference |

### 5.4 Proposed command (Phase 2B)

### Operator private held-out suite (external path)

Run **outside** the repository; results must not land in `docs/eval/` unless explicitly intended:

```bash
node apps/platform/scripts/run-ask-ri-eval-suite.mjs \
  --suite=/absolute/path/to/private-held-out-suite.json \
  --out=/absolute/path/to/private-results.json \
  --include-operator-held-out
```

The repository suite (`docs/eval/ask-ri-v2-eval-suite-v1.json`) **excludes** `EVAL-H-90`–`99` by default. `--include-operator-held-out` is rejected for the repo default suite (use an external file).

Synthetic CLI validation only: `apps/platform/scripts/eval-fixtures/synthetic-external-suite.json`.

```bash
node apps/platform/scripts/eval/run-ask-ri-eval-suite.mjs \
  --suite ../../../docs/eval/ask-ri-v2-eval-suite-v1.json \
  --evidence-dir ../../../docs/eval/evidence-packs \
  --engine deterministic \
  --out ../../../docs/eval/reports/baseline-deterministic-v1.json
```

### 5.5 Existing offline capabilities (today)

| Asset | Role | Writes DB? |
|-------|------|------------|
| `runAskRiDeterministic` | Production answer logic | **No** |
| `acceptance-phase-8-bus-uat-018-*` | Structural regression (mixed answer, ranking, pipeline) | **No** |
| `acceptance-phase-8-step-81d-ask-ri-pdf-routing.mjs` | Routing / tenant vs catalogue | **No** |
| `acceptance-phase-8c-step-80d-ask-ri-production.mjs` | CP26 PDF path (minimal fixture) | **No** |
| `design-lab/.../acceptance-ask-ri-eval.mjs` | **Design Lab** graph eval (different dataset) | **No** (not production path) |
| `askRiProduction` + `/api/ri-lab/ask-ri` | Connected staging | **Yes** — **forbidden** for baseline |

**Gap:** No unified harness loads `docs/eval/ask-ri-v2-eval-suite-v1.json` or scores all 11 dimensions. Full baseline = **`NOT_MEASURED`**.

---

## 6. Current baseline results (Phase 2A)

Dimensional scoring against all 45 cases was **not executed** (harness not implemented; evidence packs not frozen in-repo).

### 6.1 Structural proxy runs (existing acceptance scripts only)

Executed offline 2026-03-26 (local, no API, no DB):

| Proxy script | Maps loosely to cases | Outcome |
|--------------|----------------------|---------|
| `acceptance-phase-8-bus-uat-018-mixed-answer.mjs` | `EVAL-G-02` (mixed Fair Value + FG22) | **PASS** (compose + mapper structure) |
| `acceptance-phase-8-step-81d-ask-ri-pdf-routing.mjs` | `EVAL-C-01`, `EVAL-F-01`, publication gate | **PASS** |
| `acceptance-phase-8c-step-80d-ask-ri-production.mjs` | `EVAL-C-01` (CP26 minimal PDF) | **FAIL (1)** — `runAskRiDeterministic` execution tag `catalogue_publication_evidence_v1` vs expected `pdf_primary_v1` on minimal fixture |

These runs **do not** substitute for suite-wide D01–D11 scores. Treat as **engineering regression signals**, not regulatory accuracy.

### 6.2 Unmeasured areas

- All 45 authored cases: dimension scores **`NOT_MEASURED`**
- SME rubric outcomes: **`AWAITING_SME_REVIEW`**
- Operator held-out `EVAL-H-90`–`99`: **not populated**
- Live staging with full extraction artefacts: **not invoked** (audit log restriction)
- Tenant security D11 on connected RBAC: **requires isolated security test harness** (not run)
- Semantic discovery H-category: **expected FAIL/PARTIAL** per architecture audit (publication gate)

---

## 7. P0 AI labelling recommendations (proposal only — not implemented)

Connected Ask RI sets `providerCallCount: 0` and `execution.providerUsed: false` (`map-ask-ri-to-lab.ts`). UI still shows misleading copy in non-production paths.

| Location | Current label | Issue | Proposed copy |
|----------|---------------|-------|----------------|
| `design-lab/.../ask-ri-ui.js` | `AI SYNTHESIS — not regulator wording` when `providerMode !== 'PRODUCTION'` | Implies generative AI | **Fixture demo narrative — not connected Ask RI** |
| `design-lab/.../ask-ri-ui.js` | `Deterministic source-grounded synthesis…` when `providerMode === 'PRODUCTION'` | Correct direction | **Evidence-based answer (automated)** — deterministic extraction synthesis; not live AI |
| `design-lab/.../fixture-scenarios-5c.js` | Answers prefixed `AI SYNTHESIS:` | Conflates fixture with production | **Demo fixture text** |
| `ask-ri-ui.js` `modeBadge` / `data-provider-calls` | Shows provider call count | Good signal | Expose **`synthesisMode`**: `deterministic_catalogue` \| `deterministic_tenant` \| `ai_assisted` (future) |
| Platform mapper | No `synthesisMode` field today | UI cannot distinguish paths | Add `synthesisMode` from `execution.evidenceSource` + `providerUsed` in **Phase 2B** (small API contract extension) |

**Smallest safe P0 UI change:** In connected mode only, replace “AI SYNTHESIS” strings with “Evidence-based answer (automated)” and show `data-synthesis-mode` from `retrieval.evidenceSource`.

---

## 8. Known evaluation limitations

1. Provisional gold themes may be wrong until SME review — automated theme match would inherit that uncertainty.
2. Staging extraction revisions can drift; suite pins IDs that must be validated before each baseline run.
3. Catalogue path requires `questionMentionsPublicationReference` — semantic cases (category H) are **expected** to underperform until V2 retrieval planner exists.
4. Tenant path returns **record counts**, not narrative — category F expectations often require graph completeness, not answer quality.
5. Control-impact cases (D, E) cannot pass interpretation dimensions under template-only synthesis without overstating capability.
6. No frozen `evidence-packs/` in v1 — full replay needs Phase 2B export from staging (read-only) or curated fixtures.
7. Cross-publication compare not in production Ask RI — related cases marked `knownLimitation` in dataset.

---

## 9. Data governance (defer to Phase 2B)

Before customer or tenant content is sent to external AI providers:

- Business decision on **data residency, retention, subprocessors, and DPA** (evidence-based; no unverified claims in v1).
- Separate assessment from this accuracy suite.

---

## 10. Proposed implementation sequence (post-approval)

| Step | Phase | Deliverable |
|------|-------|-------------|
| 1 | 2B | SME review of PROVISIONAL gold → first `EXPERT_REVIEWED` subset |
| 2 | 2B | Export read-only evidence packs from staging Storage/DB |
| 3 | 2B | Implement `run-ask-ri-eval-suite.mjs` + prohibited-claim rules |
| 4 | 2B | Record **deterministic baseline report** (v1 reproducible) |
| 5 | 2B | Operator adds `EVAL-H-90`–`99`; re-run baseline |
| 6 | 2C+ | V2 engine behind same harness; comparative report |
| 7 | 2B | P0 UI labelling + optional `synthesisMode` in mapper |

---

## 11. Phase 2A compliance statement

- **NO APPLICATION CODE MODIFIED** (except authorised eval docs under `docs/eval/`).
- **NO DATABASE WRITES.**
- **NO LIVE `/api/ri-lab/ask-ri` CALLS.**
- **NO AI PROVIDER CALLS.**
- **NO COMMIT.**
- **NO PUSH.**
- **NO DEPLOY.**
