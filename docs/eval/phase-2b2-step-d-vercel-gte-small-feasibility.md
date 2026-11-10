# Phase 2B.2 Step D — Server-side gte-small on Vercel (assessment only)

**No deployment. No hosted inference executed in this step.**

---

## 1. Pinned local model (offline harness)

| Property | Value |
|----------|--------|
| NPM package | `@xenova/transformers@2.17.2` |
| Model repo (ONNX) | `Xenova/gte-small` |
| Upstream weights | `thenlper/gte-small` |
| Supabase product alias | `Supabase/gte-small` (equivalence **not** proven) |
| Dimensions | 384 |
| Pooling | mean |
| Normalisation | L2 (`normalize: true`) |
| Quantisation | ONNX quantized (Transformers.js default) |
| Tokenizer | Bundled with Xenova model revision (same HF snapshot as ONNX) |
| Cached artefact size (local `.cache`) | ~33 MB (4 files observed) |

**ONNX weight hash:** Not pinned in repo today — **action:** record `sha256` of `onnx/model.onnx` at lock time before production.

---

## 2. Vercel Node.js (`apps/platform`, region `lhr1`)

`vercel.json` already sets `"regions": ["lhr1"]` for the platform app.

### Feasibility

| Factor | Assessment |
|--------|------------|
| Runtime | Node serverless / Fluid compute — `@xenova/transformers` uses ONNX Runtime in Node |
| Bundle impact | Model **not** bundled in Next build by default; first load downloads/caches to `/tmp` or function cache — **cold-start risk** |
| Memory | Pilot loads model + tokenizer; expect **512 MB–1 GB** function memory for stable warm inference |
| Cold start | Model load + ONNX init: **seconds–tens of seconds** first invocation (observed offline ~15–20s model fetch cold) |
| Warm latency | Offline query embed ~5–10 ms/chunk batch small; production overhead dominated by load unless cached |
| Execution limit | Must stay within Vercel function max duration (Pro/Enterprise configs apply) |
| Concurrency | Each instance loads model — use singleton cache in global scope; limit parallel embed workers |
| Private packaging | **Recommended:** vendor ONNX + tokenizer into `apps/platform/private-models/gte-small/` and `includeFiles` in `vercel.json` — avoid runtime Hugging Face/CDN fetch |
| Public exposure | Do **not** serve model files from `public/` |

### Constraints

- Next.js edge **middleware** cannot run Transformers.js ONNX — use **Node** route handlers only.  
- Serverless bundle size limits may require external Blob mount for weights.  
- Sharp (optional dep of transformers) must not break build — already in lockfile.

---

## 3. Data governance

| Topic | Finding |
|-------|---------|
| Region | Default deployment pinned `lhr1` in config — **not** a legal guarantee; verify account setting + failover |
| Failover | Vercel may route to alternate region on incident — treat as **residency risk** until Enterprise policies confirmed |
| Model input | Query text in function memory/logs — minimise logging; redact in observability |
| Third parties | Default Xenova path may fetch from Hugging Face unless self-hosted weights |
| Confidential queries | Embeddings on Vercel still process tenant text on Vercel infrastructure — DPIA required |

**Do not claim guaranteed London-only processing without contractual verification.**

---

## 4. Options comparison

| | A: Supabase Edge gte-small | B: Vercel Node pinned ONNX | C: Dedicated embed service |
|--|---------------------------|----------------------------|---------------------------|
| Same as offline pilot | Unknown — **UNVERIFIED** | Yes if same Xenova commit + ONNX hash | Yes if same image |
| Coupling | DB/pgvector proximity | Same app as Ask RI | Extra ops |
| Cold start | Edge isolate | Node serverless | Always-on option |
| Cost | Edge invocations + DB | Vercel GB-sec + memory | Fixed VM/container |
| Secret handling | Supabase secrets | Vercel env | Custom |
| **Recommendation** | Prove equivalence **first** (sample cosine matrix) | **Preferred path** for query-time embeds once weights vendored + memory sized | Fallback if serverless limits bite |

**Step D recommendation:** Pursue **Option B** for query embeddings after pinning ONNX hash and vendored weights; use Supabase/pgvector for storage only until Edge parity proven. Schedule A vs B equivalence harness (blocked on operator approval).

---

## 5. Chunking production gate (carried from Step C)

| Requirement | Step C status |
|-------------|---------------|
| Max 450 model tokens | **Violated** — max **511** observed (`CHUNK_HARD_MAX_TOKENS=512`) |
| gte-small tokenizer | Met |
| Page boundaries | 0 violations |
| Silent truncation | 0 over-hard-limit chunks reported |
| Authentic evidence only | **Blocked** until Tier-1 ingest |

**Indexing not production-ready** until chunk splitter enforces 450 hard cap and authentic corpus ingested.
