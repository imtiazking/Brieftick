#!/usr/bin/env node
/**
 * Runs the deterministic evaluation over the saved FCA-EVAL-001 pilot outputs (no paid AI) and writes
 * EVALUATION-DETERMINISTIC.json beside the originals. Originals are verified against ORIGINALS-MANIFEST.json
 * and are never modified.
 *   node scripts/eval/run-pilot-saved-output-evaluation.mjs [--write] [--write-manifest]
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePdfPhysicalPages } from '../../../../integrations/regulatory-sources/core/pdf-physical-page-parser.mjs';
import { evaluateSavedPilotOutputs } from './pilot-saved-output-evaluator.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../..');
export const PILOT_EVIDENCE_DIR = join(repoRoot, 'docs/uat/evidence/live-ai-pilot-2026-11-26');
const FIXTURE_PDF = join(repoRoot, 'integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf');

/** Line endings are normalised so a Windows checkout and a Linux checkout hash identically. */
const sha256 = (buf) => createHash('sha256').update(buf.toString('utf8').replace(/\r\n/g, '\n')).digest('hex');

/** Files present at pilot close, hashed so later work can prove the originals were not altered. */
export function originalEvidenceFiles() {
  const top = readdirSync(PILOT_EVIDENCE_DIR, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
  const exportFile = join('saved-outputs', 'stage2-5-records-as-persisted.json');
  const exclude = new Set(['ORIGINALS-MANIFEST.json', 'EVALUATION-DETERMINISTIC.json', 'HARDENING-REPORT.md']);
  return [...top.filter((n) => !exclude.has(n)), exportFile].sort();
}

export function verifyManifest() {
  const manifestPath = join(PILOT_EVIDENCE_DIR, 'ORIGINALS-MANIFEST.json');
  if (!existsSync(manifestPath)) return { ok: false, reason: 'manifest_missing', mismatches: [] };
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const mismatches = [];
  for (const [file, hash] of Object.entries(manifest.files)) {
    const p = join(PILOT_EVIDENCE_DIR, file);
    if (!existsSync(p) || sha256(readFileSync(p)) !== hash) mismatches.push(file);
  }
  return { ok: mismatches.length === 0, fileCount: Object.keys(manifest.files).length, mismatches };
}

export async function runEvaluation() {
  const stage1 = JSON.parse(readFileSync(join(PILOT_EVIDENCE_DIR, 'stage1-run-raw.json'), 'utf8')).run.detail.structured_output;
  const records = JSON.parse(readFileSync(join(PILOT_EVIDENCE_DIR, 'saved-outputs/stage2-5-records-as-persisted.json'), 'utf8'));
  const parsed = await parsePdfPhysicalPages(readFileSync(FIXTURE_PDF));
  return evaluateSavedPilotOutputs({
    pages: parsed.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })),
    stage1Candidate: stage1.candidates[0],
    stage1RegulatoryContext: stage1._forgeniqPublicationRegulatoryContext,
    records: { obligation: records.obligation, impact: records.impact, risk: records.risk, control: records.control, assurance: records.assurance },
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = new Set(process.argv.slice(2));
  if (args.has('--write-manifest')) {
    const files = {};
    for (const f of originalEvidenceFiles()) files[f] = sha256(readFileSync(join(PILOT_EVIDENCE_DIR, f)));
    writeFileSync(
      join(PILOT_EVIDENCE_DIR, 'ORIGINALS-MANIFEST.json'),
      `${JSON.stringify({ note: 'SHA-256 of the pilot evidence as saved. Later hardening work must not change these files.', createdAt: new Date().toISOString(), files }, null, 2)}\n`,
    );
    console.log(`manifest written (${Object.keys(files).length} files)`);
  }
  const manifest = verifyManifest();
  const result = await runEvaluation();
  console.log(JSON.stringify({ manifest, counts: result.counts }, null, 2));
  if (args.has('--write')) {
    writeFileSync(join(PILOT_EVIDENCE_DIR, 'EVALUATION-DETERMINISTIC.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), originalsManifest: manifest, ...result }, null, 2)}\n`);
    console.log('EVALUATION-DETERMINISTIC.json written');
  }
}
