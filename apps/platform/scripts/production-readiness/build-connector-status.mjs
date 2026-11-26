#!/usr/bin/env node
/**
 * Regulator-by-regulator connector operational matrix (Production Readiness Phase 4).
 * Joins: code connectors, the reference catalogue, read-only staging source operations, and the classification-policy
 * readiness matrix. No network access, no database writes.
 *
 *   node scripts/production-readiness/build-connector-status.mjs [--staging <json>] [--now <iso>]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const outDir = join(repoRoot, 'docs', 'uat', 'evidence', 'production-readiness');
const stagingPath = arg('staging') || join(outDir, 'raw', 'staging-source-operations.json');
const now = new Date(arg('now') || Date.now());

const { REGULATORS } = await import(pathToFileURL(join(repoRoot, 'packages/reference-data/catalogue/regulators.mjs')).href);
const { REGULATORY_SOURCES } = await import(pathToFileURL(join(repoRoot, 'packages/reference-data/catalogue/regulatory-sources.mjs')).href);
const { ALL_INGESTION_CONNECTORS } = await import(
  pathToFileURL(join(repoRoot, 'apps/platform/lib/ri/ingestion/connector-registry.mjs')).href
);
const matrix = JSON.parse(readFileSync(join(repoRoot, 'docs/eval/REGULATOR-READINESS-MATRIX-2026-11-23.json'), 'utf8'));
const staging = existsSync(stagingPath) ? JSON.parse(readFileSync(stagingPath, 'utf8')) : [];
const stagingBySource = new Map(staging.map((r) => [r.source_key, r]));
const priority = new Map((matrix.priorityRegulators || []).map((r) => [r.regulatorId, r]));
const connectorBySource = new Map(ALL_INGESTION_CONNECTORS.map((c) => [c.sourceId, c]));

/** A source is stale when its last run is older than this (hours). */
const STALE_AFTER_HOURS = 72;

function classifySource(src, connector, ops) {
  if (!connector) return 'NO_CONNECTOR';
  if (!ops) return 'CONNECTOR_NOT_CONFIGURED_ON_STAGING';
  if (ops.enabled !== true) return 'CONNECTOR_DISABLED';
  if (ops.health_status === 'FAILING') return 'FAILING';
  if (Number(ops.publications) === 0) return 'CONNECTOR_IMPLEMENTED_NOT_INGESTED';
  const last = ops.last_success_at ? new Date(ops.last_success_at) : null;
  if (!last) return 'INGESTED_NO_SUCCESS_TIMESTAMP';
  const ageHours = (now - last) / 3_600_000;
  return ageHours > STALE_AFTER_HOURS ? 'INGESTED_STALE' : 'INGESTED_CURRENT';
}

const sourcesByRegulator = new Map();
for (const s of REGULATORY_SOURCES) {
  if (!sourcesByRegulator.has(s.regulatorId)) sourcesByRegulator.set(s.regulatorId, []);
  sourcesByRegulator.get(s.regulatorId).push(s);
}

const regulators = REGULATORS.map((r) => {
  const sources = (sourcesByRegulator.get(r.regulatorId) || []).map((s) => {
    const connector = connectorBySource.get(s.sourceId) || null;
    const ops = stagingBySource.get(s.sourceId) || null;
    const lastSuccess = ops?.last_success_at ? new Date(ops.last_success_at) : null;
    return {
      sourceId: s.sourceId,
      sourceType: s.sourceType,
      catalogueStatus: s.status,
      connector: connector
        ? { connectorId: connector.connectorId, retrievalMethod: connector.retrievalMethod, allowedHosts: connector.allowedHosts }
        : null,
      staging: ops
        ? {
            enabled: ops.enabled === true,
            healthStatus: ops.health_status || null,
            verificationStatus: ops.verification_status,
            productionStatus: ops.production_status,
            runsTotal: Number(ops.runs_total),
            publications: Number(ops.publications),
            lastSuccessAt: ops.last_success_at || null,
            lastFailureAt: ops.last_failure_at || null,
            lastRun: ops.last_run || null,
            hoursSinceLastSuccess: lastSuccess ? Math.round((now - lastSuccess) / 3_600_000) : null,
          }
        : null,
      status: classifySource(s, connector, ops),
    };
  });
  const policy = priority.get(r.regulatorId) || null;
  const statuses = new Set(sources.map((s) => s.status));
  const regulatorStatus = !sources.length
    ? 'NO_SOURCE_IN_CATALOGUE'
    : ['FAILING', 'NO_CONNECTOR', 'CONNECTOR_DISABLED'].find((x) => statuses.has(x)) ||
      (statuses.has('INGESTED_STALE') ? 'INGESTED_STALE' : statuses.has('INGESTED_CURRENT') ? 'INGESTED_CURRENT' : [...statuses][0]);
  return {
    regulatorId: r.regulatorId,
    name: r.name,
    jurisdiction: r.jurisdiction,
    sources,
    status: regulatorStatus,
    classificationPolicy: policy
      ? { verified: policy.verified, approved: policy.approved, activated: policy.activated, notes: policy.notes || null }
      : { verified: false, approved: false, activated: false, notes: 'No approved classification policy: conversion is fail-closed' },
  };
});

const count = (fn) => regulators.filter(fn).length;
const allSources = regulators.flatMap((r) => r.sources);
const out = {
  generatedAt: now.toISOString(),
  method: 'Static code + catalogue join with read-only staging queries. No live regulator fetch was performed by this report.',
  staleAfterHours: STALE_AFTER_HOURS,
  totals: {
    regulators: regulators.length,
    catalogueSources: REGULATORY_SOURCES.length,
    codeConnectors: ALL_INGESTION_CONNECTORS.length,
    sourcesWithConnector: allSources.filter((s) => s.connector).length,
    sourcesWithPublicationsOnStaging: allSources.filter((s) => s.staging && s.staging.publications > 0).length,
    sourcesCurrent: allSources.filter((s) => s.status === 'INGESTED_CURRENT').length,
    sourcesStale: allSources.filter((s) => s.status === 'INGESTED_STALE').length,
    sourcesFailing: allSources.filter((s) => s.status === 'FAILING').length,
    sourcesDisabled: allSources.filter((s) => s.status === 'CONNECTOR_DISABLED').length,
    sourcesWithoutConnector: allSources.filter((s) => s.status === 'NO_CONNECTOR').length,
    regulatorsWithApprovedClassificationPolicy: count((r) => r.classificationPolicy.approved && r.classificationPolicy.activated),
    regulatorsWithoutSource: count((r) => !r.sources.length),
  },
  scheduling: {
    hostedSchedulerRoute: 'app/api/internal/ri-ingestion/scheduler-tick (implemented, secret-gated)',
    vercelCronConfigured: existsSync(join(repoRoot, 'apps/platform/vercel.json'))
      ? /"crons"\s*:/.test(readFileSync(join(repoRoot, 'apps/platform/vercel.json'), 'utf8'))
      : false,
    productionPollingEnabledSources: staging.filter((r) => r.production_status && r.production_status !== 'NOT_ENABLED').length,
  },
  regulators,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'REGULATOR-CONNECTOR-STATUS.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ totals: out.totals, scheduling: out.scheduling }, null, 2));
