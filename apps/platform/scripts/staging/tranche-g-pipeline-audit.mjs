#!/usr/bin/env node
/**
 * Tranche G — offline audit of regulatory knowledge pipeline wiring (no network).
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';

const platform = join(REPO_ROOT, 'apps', 'platform');
const integrations = join(REPO_ROOT, 'integrations', 'regulatory-sources');

const checks = [];
const record = (id, ok, detail = '') => {
  checks.push({ id, ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', id, detail ? `— ${detail}` : '');
};

const read = (rel) => readFileSync(join(platform, rel), 'utf8');

record('ingest_watchlist_hook', read('lib/ri/ingestion/ops/tenant-ingest-notifications.mjs').includes('matchIngestedPublicationsWatchlists'));
record('html_article_v2_derive', existsSync(join(integrations, 'core', 'evidence-capture-v2.mjs')));
record('extraction_revision_api', existsSync(join(platform, 'lib/ri/ingestion/snapshot/create-extraction-revision.mjs')));
record('pdf_primary_v1', existsSync(join(platform, 'lib/ri/ingestion/snapshot/create-primary-pdf-extraction-revision.mjs')));
record('ask_ri_pdf_loader', existsSync(join(platform, 'lib/ri/ask-ri/load-publication-pdf-evidence.mjs')));
record('deterministic_ask_ri', existsSync(join(platform, 'lib/ri/ask-ri/run-ask-ri.mjs')));
record('full_text_index_helpers', existsSync(join(platform, 'lib/ri/semantic/evidence-pack-full-text.mjs')));
record('knowledge_inventory_script', existsSync(join(platform, 'scripts/staging/regulatory-knowledge-foundation-inventory.mjs')));

const gap = [
  'Catalogue ingest currently creates publication metadata for most connectors without mandatory regulatory_source_snapshots.',
  'Deterministic html_article_v2 and pdf_primary_v1 run on controlled ingest paths (e.g. batch B2), not on every RSS row.',
  'Automatic post-ingest extraction queue is not yet universal — see tranche-g-rederive-from-snapshots.mjs for resumable re-derive.',
];
console.log('\nDocumented gaps:', gap.join(' | '));

const out = join(REPO_ROOT, 'docs', 'uat', 'evidence', 'regulatory-knowledge-foundation-2026-11-27', 'PIPELINE-AUDIT.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), checks, gap }, null, 2));

process.exit(checks.some((c) => !c.ok) ? 1 : 0);