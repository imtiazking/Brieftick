#!/usr/bin/env node
/**
 * FCA-EVAL-001 (CONC 7.20.1R) evidence collector. READ-ONLY. It makes no provider call and writes nothing to the database.
 *
 *   node scripts/staging/fca-eval-001-evidence.mjs --publication-id <uuid> [--scope forgeniq-lab-anthropic] [--out <dir>]
 *   node scripts/staging/fca-eval-001-evidence.mjs --self-test
 *
 * Run it after an authorised live evaluation. It gathers the twenty evidence items from the database and records, per item,
 * whether the evidence is PRESENT or ABSENT. It does NOT judge regulatory accuracy: technical success (valid JSON, citations
 * verified) is reported separately from the expert comparison against independently verified FCA requirements.
 * Connection: RI_LAB_SPEND_DATABASE_URL / SUPABASE_DB_URL / POSTGRES_URL / DATABASE_URL (never printed).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

export const STAGE_USE_CASES = {
  stage1: 'UC-RI-005',
  stage2: 'UC-RI-004',
  stage3: 'UC-RI-006',
  stage4: 'UC-RI-007',
  stage5: 'UC-RI-008',
};

const DOWNSTREAM_TABLES = ['regulatory_obligations', 'impact_assessments', 'risks', 'controls', 'assurance_reviews'];

/** Strip bulky grounding payloads; keep model output, validation and audit fields. */
function trimRun(run) {
  const out = run.structured_output && typeof run.structured_output === 'object' ? { ...run.structured_output } : null;
  if (out) delete out._forgeniqGrounding;
  return { ...run, structured_output: out };
}

export async function collectEvidence(query, { publicationId, scope }) {
  const q = async (sql, params = []) => {
    try {
      return { rows: (await query(sql, params)).rows ?? [] };
    } catch (err) {
      return { rows: [], error: String(err?.message || err).slice(0, 200) };
    }
  };
  const publication = await q('select * from public.regulatory_publications where id = $1', [publicationId]);
  const versions = await q('select * from public.regulatory_publication_versions where publication_id = $1 order by created_at', [publicationId]);
  const runsRaw = await q(
    `select r.id, r.use_case_id, r.execution_status, r.review_status, r.provider, r.model, r.prompt_version,
            r.error_code, r.latency_ms, r.created_at, r.completed_at, r.idempotency_key, r.structured_output
       from public.ai_analysis_runs r where r.publication_id = $1 order by r.created_at`,
    [publicationId],
  );
  const runs = runsRaw.rows.map(trimRun);
  const runIds = runs.map((r) => r.id);
  const windowStart = runs[0]?.created_at ?? null;
  const citations = runIds.length
    ? await q('select * from public.ai_analysis_citations where analysis_run_id = any($1::uuid[]) order by analysis_run_id, claim_index', [runIds])
    : { rows: [] };
  const reviews = runIds.length
    ? await q('select * from public.ai_analysis_reviews where analysis_run_id = any($1::uuid[]) order by created_at', [runIds])
    : { rows: [] };
  const events = runIds.length
    ? await q(`select * from public.workflow_events where entity_type = 'ai_analysis_run' and entity_id = any($1::uuid[]) order by occurred_at`, [runIds])
    : { rows: [] };
  const downstream = {};
  for (const table of DOWNSTREAM_TABLES) {
    downstream[table] = windowStart
      ? await q(`select * from public.${table} where created_at >= $1 order by created_at limit 200`, [windowStart])
      : { rows: [] };
  }
  const ledgerAccount = await q('select * from public.lab_ai_spend_accounts where scope_key = $1', [scope]);
  const ledgerRows = await q(
    `select id, use_case_id, idempotency_key, status, model, pricing_version, reserve_usd, actual_usd, usage_known,
            input_tokens, output_tokens, cache_write_5m_tokens, cache_write_1h_tokens, cache_read_tokens,
            provider_request_id, provider_ok, created_at, settled_at, provider_deadline_at, cost_breakdown, reserve_basis
       from public.lab_ai_spend_reservations where scope_key = $1 order by created_at`,
    [scope],
  );
  const recoveries = await q('select * from public.lab_ai_spend_recoveries where scope_key = $1 order by created_at', [scope]);

  const byStage = (stage) => runs.filter((r) => r.use_case_id === STAGE_USE_CASES[stage]);
  const meta = (r) => r.structured_output?._forgeniqProviderMeta ?? null;
  const present = (cond, detail) => ({ status: cond ? 'PRESENT' : 'ABSENT', detail });
  const completed = runs.filter((r) => r.execution_status === 'Completed' || r.execution_status === 'COMPLETED');
  const ledger = ledgerRows.rows;
  const items = [
    ['1 publication and source', present(publication.rows.length > 0, { publication: publication.rows[0]?.id ?? null, versions: versions.rows.length })],
    ['2 extracted obligations', present(byStage('stage1').length > 0, { runs: byStage('stage1').map((r) => r.id), obligationRows: downstream.regulatory_obligations.rows.length })],
    ['3 exact citations', present(citations.rows.length > 0, { citations: citations.rows.length })],
    ['4 impact assessment', present(byStage('stage2').length > 0, { runs: byStage('stage2').map((r) => r.id), rows: downstream.impact_assessments.rows.length })],
    ['5 risks', present(byStage('stage3').length > 0, { runs: byStage('stage3').map((r) => r.id), rows: downstream.risks.rows.length })],
    ['6 existing risk matches', present(byStage('stage3').length > 0, 'see stage 3 structured_output (existing risk references versus new proposals)')],
    ['7 control mappings', present(byStage('stage4').length > 0, { runs: byStage('stage4').map((r) => r.id), rows: downstream.controls.rows.length })],
    ['8 control gap analysis', present(byStage('stage4').length > 0, 'see stage 4 structured_output (gaps and absent controls)')],
    ['9 assurance recommendations', present(byStage('stage5').length > 0, { runs: byStage('stage5').map((r) => r.id), rows: downstream.assurance_reviews.rows.length })],
    ['10 supporting evidence and uncertainties', present(completed.length > 0, 'see structured_output fields of each completed run')],
    ['11 structured-output validation results', present(runs.length > 0, runs.map((r) => ({ id: r.id, useCase: r.use_case_id, status: r.execution_status, error: r.error_code })))],
    ['12 human review decisions', present(reviews.rows.length > 0, { reviews: reviews.rows.length })],
    ['13 model identifier', present(runs.some((r) => r.model) || ledger.some((l) => l.model), { runModels: [...new Set(runs.map((r) => r.model))], ledgerModels: [...new Set(ledger.map((l) => l.model))], responseModels: [...new Set(runs.map((r) => meta(r)?.responseModel).filter(Boolean))] })],
    ['14 input and output tokens', present(ledger.some((l) => l.input_tokens != null || l.output_tokens != null), ledger.map((l) => ({ id: l.id, input: l.input_tokens, output: l.output_tokens })))],
    ['15 cache usage', present(ledger.length > 0, ledger.map((l) => ({ id: l.id, write5m: l.cache_write_5m_tokens, write1h: l.cache_write_1h_tokens, read: l.cache_read_tokens })))],
    ['16 latency', present(runs.some((r) => r.latency_ms != null), runs.map((r) => ({ id: r.id, ms: r.latency_ms })))],
    ['17 reserved cost', present(ledger.length > 0, ledger.map((l) => ({ id: l.id, reserveUsd: l.reserve_usd })))],
    ['18 settled estimated cost', present(ledger.some((l) => l.actual_usd != null), { settled: ledger.map((l) => ({ id: l.id, actualUsd: l.actual_usd, usageKnown: l.usage_known })), account: ledgerAccount.rows[0] ?? null })],
    ['19 database relationships', present(runs.length > 0, { runIds, downstreamCounts: Object.fromEntries(DOWNSTREAM_TABLES.map((t) => [t, downstream[t].rows.length])) })],
    ['20 full audit history', present(events.rows.length > 0, { workflowEvents: events.rows.length, recoveries: recoveries.rows.length })],
  ].map(([item, r]) => ({ item, ...r }));

  const errors = [
    ['publication', publication], ['versions', versions], ['runs', runsRaw], ['citations', citations], ['reviews', reviews],
    ['events', events], ['ledger', ledgerRows],
    ...DOWNSTREAM_TABLES.map((t) => [t, downstream[t]]),
  ].filter(([, v]) => v.error).map(([k, v]) => ({ source: k, error: v.error }));

  return {
    caseId: 'FCA-EVAL-001',
    instrument: 'FCA Handbook CONC 7.20.1R',
    collectedAt: new Date().toISOString(),
    readOnly: true,
    scope,
    publicationId,
    technicalOutcome: {
      runs: runs.length,
      completed: completed.length,
      failed: runs.length - completed.length,
      note: 'Technical success only. Regulatory accuracy requires the independent expert comparison (docs/uat/eval/FCA-EVAL-001-EVIDENCE-PLAN-2026-11-26.md).',
    },
    regulatoryAccuracy: { status: 'NOT_ASSESSED', requires: 'independent expert comparison against verified FCA requirements' },
    items,
    data: { publication: publication.rows[0] ?? null, runs, citations: citations.rows, reviews: reviews.rows, events: events.rows, downstream: Object.fromEntries(DOWNSTREAM_TABLES.map((t) => [t, downstream[t].rows])), ledger: { account: ledgerAccount.rows[0] ?? null, reservations: ledger, recoveries: recoveries.rows } },
    collectionErrors: errors,
  };
}

async function main() {
  if (args.includes('--self-test')) {
    const fake = async (sql) => ({ rows: sql.includes('ai_analysis_runs') ? [{ id: '00000000-0000-0000-0000-000000000001', use_case_id: 'UC-RI-005', model: 'claude-sonnet-5-5', execution_status: 'Completed', latency_ms: 1200, created_at: '2026-11-26T00:00:00Z', structured_output: { _forgeniqGrounding: { big: true }, candidates: [] } }] : [] });
    const result = await collectEvidence(fake, { publicationId: 'p', scope: 's' });
    const ok = result.items.length === 20 && result.readOnly === true && result.regulatoryAccuracy.status === 'NOT_ASSESSED' && !('_forgeniqGrounding' in result.data.runs[0].structured_output);
    console.log(ok ? 'fca-eval-001-evidence self-test: PASS' : 'fca-eval-001-evidence self-test: FAIL');
    process.exit(ok ? 0 : 1);
  }
  const publicationId = flag('publication-id');
  if (!publicationId) throw new Error('--publication-id is required');
  const url =
    process.env.RI_LAB_SPEND_DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('No database URL set.');
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('begin read only');
    const evidence = await collectEvidence((sql, params) => client.query(sql, params), {
      publicationId,
      scope: flag('scope', 'forgeniq-lab-anthropic'),
    });
    await client.query('rollback');
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
    const outDir = flag('out') || join(root, 'docs', 'uat', 'evidence', 'fca-eval-001', evidence.collectedAt.replace(/[:.]/g, '-'));
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'EVIDENCE.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ outDir, items: evidence.items.map((i) => `${i.status} ${i.item}`) }, null, 2));
  } finally {
    await client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
