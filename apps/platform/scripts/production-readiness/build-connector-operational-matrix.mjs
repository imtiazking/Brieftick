#!/usr/bin/env node
/**
 * Source-by-source operational verification matrix (staging join, read-only inputs).
 *
 *   node scripts/production-readiness/build-connector-operational-matrix.mjs [--staging <json>] [--deployed <gitSha>]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

const { REGULATORS } = await import(pathToFileURL(join(repoRoot, 'packages/reference-data/catalogue/regulators.mjs')).href);
const { REGULATORY_SOURCES } = await import(
  pathToFileURL(join(repoRoot, 'packages/reference-data/catalogue/regulatory-sources.mjs')).href,
);
const { SOURCE_INTEGRATION_BY_ID } = await import(
  pathToFileURL(join(repoRoot, 'packages/reference-data/catalogue/source-integration.mjs')).href,
);
const { SOURCE_COVERAGE_BY_ID } = await import(
  pathToFileURL(join(repoRoot, 'packages/reference-data/catalogue/source-coverage.mjs')).href,
);
const { ALL_INGESTION_CONNECTORS } = await import(
  pathToFileURL(join(repoRoot, 'apps/platform/lib/ri/ingestion/connector-registry.mjs')).href,
);
const { HOSTED_SCHEDULER_EXCLUDED_SOURCE_IDS } = await import(
  pathToFileURL(join(repoRoot, 'apps/platform/lib/ri/ingestion/ops/hosted-scheduler-allowlist.mjs')).href,
);
const { APPROVED_PRIMARY_PDF_SOURCES } = await import(
  pathToFileURL(join(repoRoot, 'integrations/regulatory-sources/core/regulatory-pdf-allowlist.mjs')).href,
);

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const outDir = join(repoRoot, 'docs', 'uat', 'evidence', 'regulatory-knowledge-foundation-2026-11-27');
const stagingPath =
  arg('staging') ||
  join(repoRoot, 'docs', 'uat', 'evidence', 'production-readiness', 'raw', 'staging-ops-fresh-2026-11-27.json');
const deployedGit = arg('deployed') || 'pending-tranche';
const now = new Date();

const regulatorsById = new Map(REGULATORS.map((r) => [r.regulatorId, r]));
const connectorBySource = new Map(ALL_INGESTION_CONNECTORS.map((c) => [c.sourceId, c]));
const staging = existsSync(stagingPath) ? JSON.parse(readFileSync(stagingPath, 'utf8')) : [];
const stagingByKey = new Map(staging.map((r) => [r.source_key || r.external_key, r]));

const DISABLE_JUSTIFICATION = {
  'SRC-OFAC-SDN-LISTS':
    'Policy: OFAC SDN bulk structured lists excluded from hosted scheduler (sanctions data handling controls).',
  'SRC-CBUAE-DIGITAL-RULEBOOK':
    'No production connector implemented; ingestion_mode DISABLED pending official API research.',
};

function htmlSupported(connector) {
  if (!connector) return false;
  const m = connector.retrievalMethod || '';
  return /html|rss|atom|scrap|api/i.test(m);
}

function pdfSupported(connector) {
  if (!connector) return false;
  return connector.publicationType === 'PDF' || /pdf/i.test(connector.retrievalMethod || '');
}

const rows = REGULATORY_SOURCES.map((src) => {
  const regulator = regulatorsById.get(src.regulatorId);
  const connector = connectorBySource.get(src.sourceId) || null;
  const integration = SOURCE_INTEGRATION_BY_ID[src.sourceId] || null;
  const coverage = SOURCE_COVERAGE_BY_ID[src.sourceId] || null;
  const ops = stagingByKey.get(src.sourceId) || null;
  const pdfApproval = APPROVED_PRIMARY_PDF_SOURCES[src.sourceId]
    ? { ok: true, code: 'APPROVED' }
    : { ok: false, code: 'SOURCE_NOT_APPROVED' };
  const schedulerExcluded = HOSTED_SCHEDULER_EXCLUDED_SOURCE_IDS.has(src.sourceId);
  const implemented = Boolean(connector);
  const deployed = implemented && deployedGit !== 'pending-tranche';
  const configured = Boolean(ops);
  const authenticated =
    integration?.verificationStatus === 'AUTH_REQUIRED'
      ? ops?.last_success_at
        ? true
        : false
      : integration?.verificationStatus !== 'ACCESS_RESTRICTED';
  const approved = !schedulerExcluded && src.status !== 'NOT_APPLICABLE';
  const explicitlyDisabled = DISABLE_JUSTIFICATION[src.sourceId] || schedulerExcluded;
  const enabled =
    !explicitlyDisabled &&
    Boolean(connector) &&
    (ops?.enabled === true ||
      (ops?.enabled !== false &&
        ops?.source_ingestion_mode !== 'DISABLED' &&
        (ops?.last_success_at || ops?.ingestion_mode === 'ENABLED')));
  const schedulerRegistered = enabled && !schedulerExcluded && configured;
  const liveIngestionTested =
    integration?.verificationStatus === 'LIVE_VERIFIED' || Number(ops?.publications || ops?.pubs) > 0;
  const lastSuccess = ops?.last_success_at || null;
  const freshness =
    lastSuccess && (now - new Date(lastSuccess)) / 3_600_000 < 72
      ? 'CURRENT'
      : lastSuccess
        ? 'STALE'
        : 'UNKNOWN';
  const indexingVerified = Number(ops?.publications || ops?.pubs) > 0 ? 'PARTIAL' : 'NOT_VERIFIED';
  const askRiVerified = 'NOT_BATCH_VERIFIED';
  const licensing =
    src.sourceId.includes('OFAC') || integration?.verificationStatus === 'ACCESS_RESTRICTED'
      ? 'RESTRICTED_OR_POLICY'
      : 'OPEN_OFFICIAL';
  const outstanding = [];
  if (!implemented) outstanding.push('NO_CONNECTOR');
  if (schedulerExcluded) outstanding.push('HOSTED_SCHEDULER_EXCLUDED');
  if (!enabled && !DISABLE_JUSTIFICATION[src.sourceId]) outstanding.push('NOT_ENABLED_ON_STAGING');
  if (enabled && !lastSuccess) outstanding.push('NO_SUCCESSFUL_INGEST_YET');
  if (integration?.verificationStatus === 'RESEARCH_REQUIRED') outstanding.push('RESEARCH_REQUIRED');
  return {
    regulator: regulator?.name || src.regulatorId,
    regulatorId: src.regulatorId,
    jurisdiction: regulator?.jurisdiction || src.jurisdiction || regulator?.country,
    regulatorySource: src.sourceType,
    sourceId: src.sourceId,
    connectorName: connector?.connectorId || null,
    connectorId: connector?.connectorId || null,
    implemented,
    deployed,
    configured,
    authenticated,
    approved,
    enabled: enabled ?? false,
    schedulerRegistered,
    liveIngestionTested,
    lastSuccessfulIngestion: lastSuccess,
    dataFreshness: freshness,
    htmlExtractionSupported: htmlSupported(connector),
    pdfExtractionSupported: pdfSupported(connector),
    pdfSourceApprovalStatus: pdfApproval.ok ? 'APPROVED' : pdfApproval.code || 'NOT_APPROVED',
    indexingVerified,
    askRiRetrievalVerified: askRiVerified,
    licensingStatus: licensing,
    disabledJustification: DISABLE_JUSTIFICATION[src.sourceId] || (enabled ? null : outstanding.join('; ') || null),
    outstandingIssues: outstanding,
    stagingPublications: Number(ops?.publications ?? ops?.pubs ?? 0),
    verificationStatus: integration?.verificationStatus || ops?.verification_status || 'NOT_TESTED',
    productionStatus: integration?.productionStatus || ops?.production_status || 'NOT_ENABLED',
    retrievalMethod: connector?.retrievalMethod || integration?.verifiedRetrievalMethod || null,
    coverageStatus: coverage?.coverageVerificationStatus || null,
  };
});

const totals = {
  totalRegulators: REGULATORS.length,
  totalRegulatorySources: REGULATORY_SOURCES.length,
  totalImplementedConnectors: ALL_INGESTION_CONNECTORS.length,
  totalEnabledConnectors: rows.filter((r) => r.enabled).length,
  totalOperationalConnectors: rows.filter((r) => r.enabled && r.lastSuccessfulIngestion).length,
  totalAutomaticallyScheduledConnectors: rows.filter((r) => r.schedulerRegistered).length,
  totalDisabledConnectors: rows.filter((r) => !r.enabled).length,
  totalRestrictedConnectors: rows.filter((r) => r.licensingStatus === 'RESTRICTED_OR_POLICY').length,
  totalFailedConnectors: rows.filter((r) => r.outstandingIssues.includes('NO_SUCCESSFUL_INGEST_YET') && r.enabled).length,
  totalAwaitingExternalApproval: rows.filter((r) =>
    ['AUTH_REQUIRED', 'ACCESS_RESTRICTED'].includes(r.verificationStatus),
  ).length,
};

const out = {
  generatedAt: now.toISOString(),
  stagingOpsSnapshot: stagingPath,
  deployedGitSha: deployedGit,
  method:
    'Reference catalogue + connector registry + read-only staging operations export. Ask RI retrieval flagged NOT_BATCH_VERIFIED unless covered by separate eval packs.',
  totals,
  sources: rows,
};

mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'CONNECTOR-OPERATIONAL-VERIFICATION-MATRIX.json');
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ok: true, path: outPath, totals }, null, 2));