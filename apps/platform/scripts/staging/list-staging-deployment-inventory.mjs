#!/usr/bin/env node
/**
 * Read-only deployment inventory for forgeniq-platform-staging (no deletes).
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SCOPE = 'imis-projects-8e15dca0';
const PROJECT = 'forgeniq-platform-staging';
const OUT = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'STAGING-DEPLOYMENT-CLEANUP-INVENTORY-2026-11-23.json');

const KEEP_EVIDENCE = [
  'dpl_AvAyBqSSYsn2FbRcV5CbyJYsPoQU',
  'dpl_7T28te7MyhHBpcKL6jYv4yRD4aTj',
  'dpl_HDxFzhR5P6ZnD72DJ87w4YzMTVrR',
];

const r = spawnSync('npx', ['vercel', 'ls', PROJECT, '--scope', SCOPE], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

const lines = (r.stdout || '').split('\n').filter((l) => l.includes('forgeniq-platform-staging'));
const deployments = [];
for (const line of lines) {
  const url = line.match(/https:\/\/forgeniq-platform-staging[^\s]+\.vercel\.app/)?.[0];
  const status = line.includes('● Ready') ? 'READY' : line.includes('● Error') ? 'ERROR' : 'UNKNOWN';
  const age = line.trim().split(/\s+/)[0];
  if (url) deployments.push({ ageToken: age, url, status });
}

const payload = {
  generatedAt: new Date().toISOString(),
  project: PROJECT,
  scope: SCOPE,
  deploymentCountListed: deployments.length,
  deployments,
  classification: {
    keepActiveProductionAlias: 'https://staging-app.forgeniq.com (current alias target — verify in dashboard)',
    keepRollbackCandidates: ['Most recent ● Ready before resource-optimisation deploy'],
    keepEvidenceDeployIds: KEEP_EVIDENCE,
    failedCandidatesForDeletion: deployments.filter((d) => d.status === 'ERROR'),
    redundantReadyCandidates: deployments.filter((d) => d.status === 'READY').slice(3),
  },
  storageNote:
    'Hobby retains build artifacts per deployment. Deleting ERROR + old READY deploys typically frees hundreds of MB–few GB; exact savings shown only in dashboard after selection. Rollback impact: keep at least one Ready deploy per known-good git SHA.',
  deletionPerformed: false,
  requiresOperatorApproval: true,
};

writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(JSON.stringify({ ok: true, out: OUT, count: deployments.length, failed: payload.classification.failedCandidatesForDeletion.length }, null, 2));