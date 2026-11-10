# Phase 2C.1 — Grounded Regulatory Reasoner (Design Only)

**Status:** AWAITING_OPERATOR_APPROVAL  
**Date:** 2026-11-10  
**Scope:** Public-catalogue evidence only. No implementation, no provider selection, no model calls.

---

## 1. Proposed architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Ask RI request (feature flag: ask_ri_reasoner_v2 = OFF by default)      │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ A. Input eligibility gate (public-catalogue mode)                         │
│    • Block / redact tenant-bearing questions                              │
│    • Reject confidential organisational content in outbound provider calls │
└───────────────────────────────┬───────────────────────────────────────────┘
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ B. Temporal & publication pre-resolution (deterministic, app code)         │
│    • Reporting periods, latest *indexed* revision, consultation vs final   │
│    • Explicit ref validation (reuse publication-reference-validation)      │
└───────────────────────────────┬───────────────────────────────────────────┘
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ C. Hybrid retrieval (existing offline stack → staging parity)              │
│    • gte-small + BM25 + RRF, authority gate, max-pub aggregation           │
└───────────────────────────────┬───────────────────────────────────────────┘
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ D. Evidence pack assembly (no model)                                     │
│    • Multi-publication, dedupe, token budget, stable evidence IDs            │
└───────────────────────────────┬───────────────────────────────────────────┘
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ E. Pre-reasoner sufficiency classifier (rules + optional lightweight LLM)  │
│    • DIRECT_SUPPORT | PARTIAL | RELATED_ONLY | NO_SUPPORT                  │
│    • Fail-closed before generation when NO_SUPPORT / near-miss pattern       │
└───────────────────────────────┬───────────────────────────────────────────┘
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ F. Structured reasoner (LLM — future; stub in 2C.2+)                       │
│    • JSON-only output contract; temperature 0; schema-enforced             │
└───────────────────────────────┬───────────────────────────────────────────┘
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ G. Deterministic claim verifier (mandatory)                               │
│    • Citations, spans, metadata, schema                                    │
└───────────────────────────────┬───────────────────────────────────────────┘
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ H. Semantic support assessor (separate from citation match)                 │
│    • claim ↔ cited span entailment (non-authoritative; flags human review) │
└───────────────────────────────┬───────────────────────────────────────────┘
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ I. Answer renderer (user-facing + diagnostic bundle for eval)              │
└───────────────────────────────────────────────────────────────────────────┘
```

**Separation:** `deterministic_v1` (`run-ask-ri.mjs`) remains default until controlled staging sign-off. V2 reasoner runs behind `ASK_RI_ENGINE=v2` / feature flag; never mutates v1 code paths in 2C.1.

**Reuse:** `offline-retrieval-methods.mjs`, `publication-reference-validation.mjs`, `semantic-retrieval-authority-gate.mjs`, `build-regulatory-catalogue.mjs`, `chunk-regulatory-evidence.mjs`, frozen evidence packs, existing citation IDs (`documentEvidenceId`, `chunkId`).

---

## 2. Input evidence contract

### 2.1 Reasoner request (application → reasoner core)

| Field | Source | Notes |
|-------|--------|-------|
| `requestId` | App | Correlation only |
| `reasoningMode` | `PUBLIC_CATALOGUE_ONLY` (2C.x) | Tenant mode deferred |
| `questionTextSanitized` | Eligibility gate output | May be refusal without LLM |
| `questionClassification` | Gate | `REGULATORY_PUBLIC` \| `TENANT_REFERENCE_DETECTED` \| `CONFIDENTIAL_CONTENT` \| `INVALID_REF` |
| `retrievalBundle` | Hybrid retriever | Top-k chunks + ranked publications |
| `catalogueSnapshot` | App | Immutable metadata for chunk publication IDs |
| `temporalResolution` | Pre-resolver | Selected periods, disclaimers |
| `provisionalThreshold` | Calibrated offline | Passed to no-match; not to model |

### 2.2 Evidence chunk (`EvidenceChunkV2`)

Each chunk in `retrievalBundle.evidenceChunks[]`:

```json
{
  "evidenceChunkId": "sha256-prefix stable",
  "publicationId": "uuid",
  "publicationReference": "CP26/38 | null if non-numbered",
  "publicationTitle": "string (from catalogue, not model)",
  "regulatorId": "REG-FCA",
  "publicationType": "consultation | policy_statement | ...",
  "regulatoryStatus": "consultation | finalised_guidance | binding_rule | supervisory | data | ...",
  "publicationDate": "YYYY-MM-DD | null",
  "effectiveDate": "YYYY-MM-DD | null",
  "consultationCloses": "YYYY-MM-DD | null",
  "reportingPeriodLabel": "2024-H2 | null",
  "extractionRevisionId": "uuid",
  "extractionProfile": "html_article_v2 | pdf_primary_v1",
  "physicalPageNumber": 12,
  "sectionReference": "string | null",
  "canonicalUrl": "https://...",
  "contentSha256": "hex",
  "verbatimText": "exact indexed text",
  "verbatimTextSha256": "hex",
  "charSpanInSource": { "start": 0, "end": 1234 },
  "retrievalScores": { "semantic": 0.0, "bm25": 0.0, "rrf": 0.0, "rank": 1 },
  "sufficiencyHint": "DIRECT_SUPPORT | PARTIAL_SUPPORT | RELATED_CONTEXT_ONLY | null"
}
```

**Rule:** The model receives verbatim text and read-only metadata objects. It must cite by `evidenceChunkId` only; application resolves all display fields.

### 2.3 Multi-publication context assembly

1. Include top **N** chunks (default N=12–16 after dedupe) spanning **up to M** publications (default M=4).
2. Selection: RRF order with **per-publication caps** (e.g. max 4 chunks per pub) so CP26/38 volume does not crowd out FG24/6.
3. Token budget: `verbatimText` trimmed only by **deterministic** sentence boundaries with explicit `omittedSuffix: true` flag — no silent truncation.
4. Inject **status preamble** (app-authored, not model): e.g. “CP26/38 is a consultation paper; statements are proposals, not binding rules.”

---

## 3. Strict output JSON schema (draft)

Schema ID: `forgeniq.ask-ri.reasoner-output.v1`

```json
{
  "schemaVersion": "forgeniq.ask-ri.reasoner-output.v1",
  "responseState": "ANSWERED | PARTIAL_ANSWER | INSUFFICIENT_EVIDENCE | BLOCKED | VERIFICATION_FAILED",
  "sufficiencyAssessment": {
    "overall": "DIRECT_SUPPORT | PARTIAL_SUPPORT | RELATED_CONTEXT_ONLY | NO_SUPPORT",
    "explanation": "string",
    "publicationsConsidered": ["uuid"],
    "publicationsAnswering": ["uuid"]
  },
  "narrativeSummary": "string | null",
  "claims": [
    {
      "claimId": "c1",
      "claimText": "string",
      "classification": "verified_fact | guidance_expectation | consultation_proposal | reasoned_implication | unsupported",
      "regulatoryStatusOfSource": "from catalogue",
      "evidenceConfidence": "high | medium | low",
      "humanReviewRequired": true,
      "citations": [
        {
          "evidenceChunkId": "string",
          "publicationId": "uuid",
          "extractionRevisionId": "uuid",
          "physicalPageNumber": null,
          "sectionReference": null,
          "excerptStartOffset": 120,
          "excerptEndOffset": 280,
          "verbatimExcerpt": "must match source substring"
        }
      ]
    }
  ],
  "unresolvedAspects": ["string"],
  "relatedContextNote": "string | null",
  "disclaimers": ["string"],
  "temporalDisclaimers": ["Latest version in FORGENIQ catalogue as of ..."],
  "diagnostics": {
    "modelRole": "reasoner",
    "promptTokenEstimate": 0,
    "completionTokenEstimate": 0
  }
}
```

Validation: JSON Schema + AJV (or equivalent) in app code **before** rendering. Invalid schema → `VERIFICATION_FAILED`, no user-facing regulatory conclusion.

---

## 4. Claim classification definitions

| Classification | Meaning | User presentation |
|----------------|---------|-------------------|
| `verified_fact` | Verbatim or trivially paraphrased **source statement**; each word of obligation attributable to cited span. | May show with citation; label “Source states”. **Not** independent legal verification. |
| `guidance_expectation` | FCA supervisory expectation from finalised guidance / policy statement evidence. | “FCA expects / guidance indicates”; not “firm must” unless source uses binding language. |
| `consultation_proposal` | Proposed change in CP/consultation evidence only. | Explicitly “proposed”, “if implemented”, consultation close date when known. |
| `reasoned_implication` | Logical link from cited evidence to control/process area; not explicit in source. | “May affect”, “firms may wish to consider”; **humanReviewRequired: true** default. |
| `unsupported` | No qualifying citation or fails verifier. | Must not appear as answer body; triggers partial/insufficient response. |

**Distinction:** `verified_fact` requires **span-level** match (deterministic). Paraphrase that changes modality (must/should/may) → downgrade to `guidance_expectation` or `reasoned_implication`.

---

## 5. Evidence sufficiency design

**Stage 1 — Retrieval signals (deterministic, no LLM):**

- Authority gate block → `NO_SUPPORT`.
- Invalid explicit ref → `BLOCKED`.
- Top publication margin & lexical agreement (existing `no-match-detection`) → candidate abstain.
- Near-miss pattern: high semantic score but **low query–passage token overlap** and wrong publication family → `RELATED_CONTEXT_ONLY`.

**Stage 2 — Pre-reasoner sufficiency (rules + optional small model later):**

| Class | Condition | Action |
|-------|-----------|--------|
| `DIRECT_SUPPORT` | ≥1 chunk with overlap + status-aligned + answers primary intent facet | Allow full answer path |
| `PARTIAL_SUPPORT` | Supports subset of question facets | Answer supported facets only |
| `RELATED_CONTEXT_ONLY` | Retrieval hit but facet coverage < threshold | Insufficient or contextual-only response |
| `NO_SUPPORT` | No substantive chunks or all abstain | `INSUFFICIENT_EVIDENCE` |

**No forcing:** If sufficiency is `RELATED_CONTEXT_ONLY`, default response is insufficient with optional “related materials” list **without** treating them as the answer.

---

## 6. Deterministic citation verifier

**Input:** `ReasonerOutput` + `EvidenceChunkV2[]` (the only evidence universe).

| # | Check | Failure action |
|---|-------|----------------|
| 1 | `citation.publicationId` ∈ evidence set | Fail claim / fail closed |
| 2 | `extractionRevisionId` matches chunk | Fail claim |
| 3 | Page / section matches chunk metadata | Fail claim |
| 4 | `verbatimExcerpt` === `source.slice(start,end)` (normalize whitespace policy documented) | Fail claim |
| 5 | `regulatoryStatusOfSource` === catalogue | Fail claim |
| 6 | Publication title/ref not altered in claims | Fail claim |
| 7 | Dates in claim appear in cited span or catalogue dates | Fail or qualify |
| 8 | Fabricated refs (PS88/88) — no chunk | Block response |
| 9 | JSON schema valid | `VERIFICATION_FAILED` |
| 10 | `unsupported` claims in narrative → strip or reject | Qualify / insufficient |

**Offsets:** Use UTF-16 or byte index policy consistently; store `verbatimTextSha256` for replay.

**Fail-closed:** Any material claim fails verification → either drop claim and downgrade to `PARTIAL_ANSWER`, or return `VERIFICATION_FAILED` with diagnostic codes (no confidential text).

---

## 7. Semantic support assessment (limitations)

**Purpose:** Separate from citation integrity — asks whether cited span **entails** the claim for the question facet.

- Method options (future): lightweight cross-encoder, entailment model, or constrained LLM judge **on public evidence only**.
- Output: `supportScore`, `facetCoverage`, `recommendedHumanReview`.
- **Not** used to override failed citation checks.
- **Not** marketed as hallucination prevention.

Document in eval: D03 (retrieval) vs D04–D09 (reasoner) separation.

---

## 8. Regulatory status, recency, versioning

**Resolved in application code before model call:**

| Need | Mechanism |
|------|-----------|
| Reporting period (cash H1/H2) | `reportingPeriodLabel` + query pre-resolver (extend Step G regex → catalogue fields) |
| Latest **indexed** | `catalogue.indexedAt`, `publicationDate`; disclaimer string auto-appended |
| Consultation vs final | `regulatoryStatus` + rubric flags per publication |
| Superseded | `supersedesPublicationId` (future catalogue field); exclude or label |
| Cross-publication compare | Pass multiple pubs with explicit status table in prompt preamble |

**Prohibited:** Model inferring “latest” from similarity; model selecting 2025 H1 when question specifies 2024 H2.

---

## 9. Confidential-question safeguards

**Problem:** User may paste firm names, customer details, internal control IDs into questions.

**Gate (no LLM):**

1. Pattern library: “our firm”, “my organisation”, tenant obligation IDs, email patterns, account numbers, etc.
2. `tenantDataRequired` flag from eval suite semantics (e.g. EVAL-G-04).
3. Outcomes:
   - `TENANT_REFERENCE_DETECTED` → respond with template: public reasoner cannot use organisational data; do **not** forward question to external LLM.
   - `CONFIDENTIAL_CONTENT` → same; log `blockedReason` without storing raw text in provider logs.
4. **Redaction mode (optional):** Replace detected spans with `[REDACTED]` only for internal test harness; default is block, not redact-and-send.

**Development:** Synthetic public questions only; EVAL-G-04 expects recognition of missing tenant evidence, not invention.

---

## 10. Provider comparison (no selection)

| Option | Structured JSON | Long context | Citation discipline | Data residency | Retention | Ops complexity |
|--------|-----------------|-------------|---------------------|----------------|-----------|----------------|
| Anthropic (existing core) | Good with tool/schema | High | Moderate; needs verifier | Contract-dependent | **Not assumed zero** | Already integrated |
| OpenAI | JSON mode | High | Moderate | Region options vary | **Not assumed zero** | New DPA review |
| Azure OpenAI | Similar | High | Moderate | UK/EU regions possible | Configurable | Enterprise overhead |
| Self-hosted (Llama/Mistral) | Variable | Hardware-bound | Weaker | On-prem possible | Self-controlled | GPU ops, version pinning |
| Vercel AI Gateway | Router only | N/A | N/A | Routes to backend | Backend-dependent | Policy aggregation |

**Unresolved for operator:**

- Approved provider(s) for **regulatory** tier
- Allowed processing regions
- Log retention / ZDR requirements
- Whether reasoner calls use **zero-retention** enterprise terms
- Budget cap per tenant / per day
- Human review SLA for `reasoned_implication` claims

**No provider selected in 2C.1.**

---

## 11. Evaluation integration (`--engine=v2`)

**Frozen assets (immutable):**

- `docs/eval/ask-ri-v2-eval-suite-v2.1.json`
- `docs/eval/baseline/deterministic-v2.1-r2-2026-11-10.json`

**New harness (2C.2+):** `run-ask-ri-eval.mjs --engine=v2 --corpus=authentic-corpus-b2-2b2`

| Dimension | v2 engine responsibility |
|-----------|---------------------------|
| D01–D03 | **Retrieval submodule only** (existing offline/hybrid metrics) |
| D04 | Verifier pass rate, wrong pub, wrong page |
| D05 | Status labels on claims vs suite `expectedRegulatoryStatus` |
| D06 | Theme coverage vs `requiredAnswerThemes` (heuristic + SME) |
| D07 | Control-impact claims tagged + review flags |
| D08 | Count `unsupported` / invented obligations; CF-01, CF-08 |
| D09 | Insufficient evidence when required; no false certainty |

**PASS rule:** No automatic PASS from citations alone; SME review dimensions remain `AWAITING_SME_REVIEW` until expert sign-off.

**Scenarios called out in spec:**

- EVAL-C-01: proposals vs binding; control-impact as `reasoned_implication` with review
- EVAL-G-04: `INSUFFICIENT_EVIDENCE` or partial CP26-only answer; never fabricate tenant obligations
- Near-miss dev probes: must return insufficient/contextual, not CP26/FG22 substitution
- False premise / PS88/88: gate + insufficient

**Output artifact:** `docs/eval/baseline/reasoner-v2-r1-<date>.json` (new file; does not overwrite deterministic baseline).

---

## 12. Cost and performance (estimates & assumptions)

**Assumptions (not measured):**

| Item | Assumption |
|------|------------|
| Chunks per question | 12–16 after assembly (~6–8k tokens evidence) |
| System + metadata | ~1.5k tokens |
| Model output | 800–1,500 tokens JSON |
| Retrieval (local/staging) | ~12 ms hybrid (measured Step G) |
| Verifier | <50 ms CPU |
| Semantic support (if enabled) | +200–800 ms (model-dependent) |

**Provider cost:** **Do not quote exact $** without dated pricing and chosen model. Structure:

`costPerQuestion ≈ (inputTokens × inputPrice + outputTokens × outputPrice) / 1e6`

Order-of-magnitude planning: **~$0.01–0.08/question** for frontier models at above token counts (operator must validate against current price list).

**Cost controls:** sufficiency fail-closed (skip LLM), cache catalogue preambles, reduce N chunks, tiered model for entailment only.

---

## 13. Implementation sequence

| Phase | Deliverable |
|-------|-------------|
| 2C.2 | Contracts (TypeScript + JSON Schema), eligibility gate, evidence assembler, feature flag |
| 2C.3 | Deterministic verifier + unit tests against frozen packs |
| 2C.4 | Sufficiency rules + integration with hybrid retriever |
| 2C.5 | Provider adapter stub (no default provider); offline replay with **fixture JSON** reasoner outputs |
| 2C.6 | Staging `ASK_RI_ENGINE=v2` shadow mode (diagnostics only) |
| 2C.7 | `--engine=v2` eval harness + first baseline report |
| 2C.8 | SME review workflow for D04–D09 |
| Later | Tenant-aware reasoner (separate approval) |

**Components map:**

| Step | Module (proposed path) |
|------|-------------------------|
| A | `lib/ri/reasoner/evidence-context-assembler.mjs` |
| B | `lib/ri/reasoner/question-eligibility-gate.mjs` |
| C | `lib/ri/reasoner/temporal-publication-resolver.mjs` |
| D | `lib/ri/reasoner/reasoner-output-schema.json` |
| E | `lib/ri/reasoner/invoke-reasoner.mjs` (stub) |
| F | `lib/ri/reasoner/extract-claims.mjs` (optional split) |
| G | `lib/ri/reasoner/verify-claims-deterministic.mjs` |
| H | `lib/ri/reasoner/assess-semantic-support.mjs` |
| I | `lib/ri/reasoner/render-ask-ri-v2-answer.mjs` |
| J | `scripts/run-ask-ri-eval-v2.mjs` |

---

## 14. Outstanding decisions (approval required)

1. **Provider and region** for regulatory-tier LLM calls  
2. **Retention / logging** policy (including whether questions may be logged at all)  
3. **Default chunk count N and publication cap M**  
4. **Whether entailment judge is in-scope for 2C MVP** or deferred  
5. **Human review UX** for `reasoned_implication` and `PARTIAL_ANSWER`  
6. **Corpus scope for v2 staging** (B2 14-pub vs full staging catalogue)  
7. **GO for pgvector** (Step G: conditional local prototype only)  
8. **EVAL-G-04 ideal behaviour** wording for v2 (CP26-only partial vs strict insufficient)  
9. **Paraphrase tolerance** in verifier (normalized whitespace, UK spelling)  
10. **Feature flag naming and rollout** (shadow vs user-visible)

---

## Appendix: EVAL-C-01 exemplar behaviour (design)

**Question:** “What changes is the FCA proposing in CP26/38, and which financial crime controls may be affected?”

| Segment | Classification | Example handling |
|---------|----------------|------------------|
| Listed proposals in CP26 | `consultation_proposal` + `verified_fact` | Cite PDF pages |
| “Firms must” today under FCG | `verified_fact` / `guidance_expectation` only if cited from binding/guidance sources in bundle |
| Control areas (AML, sanctions, fraud) | `reasoned_implication` | humanReviewRequired: true |
| Binding effect of CP26 | **Prohibited** (`unsupported` / blocked) |

**Response state:** Likely `PARTIAL_ANSWER` or `ANSWERED` with disclaimers + SME review per suite.

---

*End of Phase 2C.1 design document.*
