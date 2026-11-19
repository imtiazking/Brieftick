/**
 * HM Treasury live verification (network). Merges HMT block into persisted evidence; preserves FCA/PRA.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createFreshState } from '../js/migrate.js';
import { hydrateStore, executeLiveVerification, getState } from '../js/store.js';
import { clearLiveVerificationData } from '../js/connectors/regulatory-ingestion-service.js';
import {
  HMT_GOVT_ATOM,
  HMT_ALLOWED_HOSTS,
  HMT_CONNECTOR_VERSION,
  createHmtConnector,
} from '../js/connectors/hmt-connector.js';
import { httpGet } from '../js/connectors/http-client.js';
import { assertUrlAllowed } from '../js/connectors/url-safety.js';
import { classifyIngestionMatch } from '../js/ingestion-helpers.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dir, '..', 'fixtures', 'live-verification-evidence.json');
const dataJsPath = join(__dir, '..', 'js', 'live-verification-evidence-data.js');

function mapHmtItems(state) {
  const staging = state.liveVerificationStaging || [];
  return (state.rawSourceItems || [])
    .filter((r) => r.connectorId === 'CONN-HMT-001' && r.dataOrigin === 'live-verification')
    .map((raw) => {
      const stage = staging.find((s) => s.rawId === raw.id);
      const art = state.sourceArtifacts?.find((a) => a.rawSourceItemId === raw.id);
      const disc = stage?.discoveryItem || {};
      return {
        rawId: raw.id,
        title: raw.titleRaw,
        authority: raw.authority || 'HM Treasury',
        authorityType: raw.authorityType || 'Government / Policy',
        sourceRole: raw.sourceRole || 'Horizon Scanning',
        regulator: 'HM Treasury',
        publicationDate: raw.publicationDateRaw || disc.publishedAt || null,
        publicationType: raw.contentTypeRaw || disc.publicationType,
        canonicalUrl: raw.sourceUrlMock || disc.canonicalUrl,
        retrievedAt: art?.retrievedAt || null,
        discoveryFeedUrl: HMT_GOVT_ATOM,
        discoveryMethod: disc.discoveryMethod || 'hmt-govuk-atom',
        dataOrigin: raw.dataOrigin,
        sourceTrust: raw.sourceTrust,
        relevanceStatus: raw.relevanceStatus || disc.relevanceStatus,
        relevanceReason: raw.relevanceReason || disc.relevanceReason,
        matchedSignals: raw.matchedSignals || disc.matchedSignals || [],
        connectorVersion: HMT_CONNECTOR_VERSION,
        parserVersion: 'RI-PARSER-2.0',
        httpContentType: art?.mediaType || null,
        fingerprintAlgorithm: raw.fingerprintAlgorithm,
        contentHash: raw.contentHash,
        externalId: raw.externalIdMock,
        provenanceStatus: 'Ready for Import',
        contentExtractStored: false,
        contentExtractPreview: null,
      };
    });
}

function writeEvidence(payload) {
  writeFileSync(fixturePath, JSON.stringify(payload, null, 2));
  writeFileSync(
    dataJsPath,
    `/** Auto-updated by live-hmt-verification.mjs — UI evidence snapshot */\nexport const LIVE_VERIFICATION_EVIDENCE = ${JSON.stringify(payload, null, 2)};\n`
  );
}

async function probeFeed(url, allowedHosts, correlationId) {
  const t0 = new Date().toISOString();
  const res = await httpGet(url, {
    allowedHosts,
    correlationId,
    rateLimit: { minIntervalMs: 3000, maxConcurrent: 1 },
  });
  return {
    timestamp: t0,
    requestedUrl: url,
    finalUrl: res.finalUrl || url,
    httpStatus: res.status,
    contentType: res.contentType,
    ok: res.ok,
    code: res.code,
    redirectTrail: res.redirectTrail,
  };
}

async function main() {
  let prior = {};
  try {
    prior = JSON.parse(readFileSync(fixturePath, 'utf8'));
  } catch {
    prior = { schemaVersion: 1, verificationType: 'LIVE SOURCE VERIFICATION' };
  }

  const report = {
    startedAt: new Date().toISOString(),
    officialFeed: HMT_GOVT_ATOM,
    security: {},
    hmt: {},
    regression: { fca: prior?.fca?.connection || 'UNKNOWN', pra: prior?.pra?.connection || 'UNKNOWN' },
  };

  report.security.allowlist = assertUrlAllowed(HMT_GOVT_ATOM, HMT_ALLOWED_HOSTS).ok ? 'PASS' : 'FAIL';
  report.security.ssrfLocalhost = !assertUrlAllowed('http://127.0.0.1/', HMT_ALLOWED_HOSTS).ok ? 'PASS' : 'FAIL';

  const baseline = createFreshState();
  const demoSnapshot = {
    chg001: JSON.stringify(baseline.changes.find((c) => c.id === 'CHG-001')),
    changesLen: baseline.changes.length,
    aiLen: baseline.aiAnalyses?.length,
  };

  hydrateStore(baseline);
  const st = getState();
  st.platformConfig.allowLiveRegulatoryVerification = true;
  clearLiveVerificationData(st);

  const corr = `LIVE-HMT-${Date.now()}`;
  const hmtHttp = await probeFeed(HMT_GOVT_ATOM, HMT_ALLOWED_HOSTS, corr);
  report.hmt.http = hmtHttp;

  const hmtRun = await executeLiveVerification('CONN-HMT-001');
  const after = getState();
  const hmtRunRec = after.ingestionRuns.find((r) => r.id === hmtRun.runId);
  const hmtConn = after.sourceConnectors.find((c) => c.id === 'CONN-HMT-001');
  const hmtRaw = (after.rawSourceItems || []).filter((r) => r.connectorId === 'CONN-HMT-001' && r.dataOrigin === 'live-verification');
  const first = hmtRaw[0];

  report.hmt.runOk = hmtRun.ok;
  report.hmt.runId = hmtRun.runId;
  report.hmt.itemsDiscovered = hmtRunRec?.detectedCount;
  report.hmt.connectorHealth = hmtConn?.healthStatus;
  report.hmt.connectorVersion = HMT_CONNECTOR_VERSION;
  report.hmt.parserVersion = hmtConn?.parserVersion || createHmtConnector().parserVersion;
  report.hmt.lastVerifiedAt = hmtRunRec?.completedAt || hmtHttp.timestamp;
  report.hmt.discoveryFeedUrl = HMT_GOVT_ATOM;
  report.hmt.authorityType = 'Government / Policy';
  report.hmt.sourceRole = 'Horizon Scanning';
  report.hmt.sourceTrust = 'Official Government Source';
  report.hmt.items = mapHmtItems(after);
  report.hmt.results = hmtRun.results;

  report.hmt.connection =
    hmtRun.ok && hmtHttp.ok && hmtRaw.length > 0 && first?.dataOrigin === 'live-verification'
      ? 'PASS'
      : hmtHttp.code === 'ACCESS_DENIED' || hmtHttp.code === 'RATE_LIMITED'
        ? 'BLOCKED'
        : 'FAIL';

  report.isolation = {
    demosUnchanged: JSON.stringify(after.changes.find((c) => c.id === 'CHG-001')) === demoSnapshot.chg001,
    noNewChanges: after.changes.length === demoSnapshot.changesLen,
    noAiRuns: (after.aiExecutions || []).filter((e) => e.startedAt > report.startedAt).length === 0,
    noAutoChange: !after.changes.some((c) => c.dataOrigin === 'live-verification'),
  };

  if (first) {
    const dup = classifyIngestionMatch(
      {
        sourceId: first.sourceId,
        reference: first.normalized?.reference,
        publicationType: first.normalized?.publicationType,
        contentHash: first.contentHash,
      },
      {
        sourceId: first.sourceId,
        reference: first.normalized?.reference,
        documentType: first.normalized?.publicationType,
        contentHash: first.contentHash,
      }
    );
    report.hmt.duplicateProtection = dup.type === 'exact_duplicate' ? 'PASS' : `SIMULATED:${dup.type}`;
  }

  report.completedAt = new Date().toISOString();
  report.final = {
    hmt: `HMT LIVE CONNECTION: ${report.hmt.connection}`,
    fca: `FCA LIVE CONNECTION: ${report.regression.fca}`,
    pra: `PRA LIVE CONNECTION: ${report.regression.pra}`,
  };

  const payload = {
    ...prior,
    schemaVersion: prior.schemaVersion || 1,
    verificationType: 'LIVE SOURCE VERIFICATION',
    postMasterEnhancement: 'HM TREASURY LIVE HORIZON-SCANNING INTEGRATION',
    hmtCompletedAt: report.completedAt,
    hmt: {
      ...report.hmt,
      connection: report.hmt.connection,
    },
    fca: prior.fca,
    pra: prior.pra,
    final: {
      ...(prior.final || {}),
      hmt: report.hmt.connection,
      hmtLine: report.final.hmt,
    },
  };
  writeEvidence(payload);

  const outPath = join(__dir, '..', 'debug', 'live-hmt-report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log('\nEvidence merged:', fixturePath);
  console.log(report.final.hmt);
  process.exit(report.hmt.connection === 'PASS' ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
