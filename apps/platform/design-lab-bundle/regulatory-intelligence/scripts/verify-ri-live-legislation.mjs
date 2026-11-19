/**
 * Live UK legislation.gov.uk verification (network). Separate from deterministic acceptance.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLegislationConnector } from '../js/connectors/legislation-connector.js';
import {
  LEGISLATION_ALLOWED_HOSTS,
  LEGISLATION_NEW_FEED,
  LEGISLATION_TARGET_MAP,
  LEGISLATION_USER_AGENT,
} from '../js/connectors/legislation-constants.js';
import { httpGet } from '../js/connectors/http-client.js';
import { assertUrlAllowed } from '../js/connectors/url-safety.js';
import { parseLegislationSearchFeed } from '../js/connectors/legislation-parser.js';
import { CONNECTOR_MODES } from '../js/connectors/connector-base.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(__dir, '..', 'cache', 'legislation');
const fixturePath = join(__dir, '..', 'fixtures', 'legislation-verification-evidence.json');
const dataJsPath = join(__dir, '..', 'js', 'legislation-verification-evidence-data.js');

const checks = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  return ok;
}

async function main() {
  mkdirSync(cacheDir, { recursive: true });
  const connector = createLegislationConnector();
  const correlationId = `LEG-VERIFY-${Date.now()}`;

  const allow = assertUrlAllowed(LEGISLATION_NEW_FEED, LEGISLATION_ALLOWED_HOSTS);
  check('allowlist-feed', allow.ok);
  check('https-feed', LEGISLATION_NEW_FEED.startsWith('https://'));

  const blocked = assertUrlAllowed('http://127.0.0.1/', LEGISLATION_ALLOWED_HOSTS);
  check('block-localhost', !blocked.ok);

  const feedRes = await httpGet(LEGISLATION_NEW_FEED, {
    allowedHosts: LEGISLATION_ALLOWED_HOSTS,
    userAgent: LEGISLATION_USER_AGENT,
    correlationId,
    rateLimit: { minIntervalMs: 2500, maxConcurrent: 1 },
    maxHtmlBytes: 512 * 1024,
  });
  const feedProbe = {
    ok: feedRes.ok,
    httpStatus: feedRes.status,
    contentType: feedRes.contentType,
    redirectCount: feedRes.redirectCount,
    finalUrl: feedRes.finalUrl,
  };
  check('feed-reachable', feedRes.ok, feedRes.message || '');
  let feedParsed = 0;
  if (feedRes.ok) {
    const parsed = parseLegislationSearchFeed(new TextDecoder().decode(feedRes.body));
    check('feed-parses', parsed.ok);
    feedParsed = parsed.items?.length || 0;
    check('feed-has-items', feedParsed >= 1);
    writeFileSync(join(cacheDir, 'new-feed-sample.meta.json'), JSON.stringify({ feedProbe, feedParsed, correlationId }, null, 2));
  }

  const targetRecords = [];
  for (const target of LEGISLATION_TARGET_MAP) {
    const result = await connector.retrieveTarget(target.path, { liveAllowed: true, correlationId });
    const ok = result.ok && result.sourceHash && result.canonicalUrl?.includes('legislation.gov.uk');
    check(`target-${target.path}`, ok, result.message || '');
    if (ok) {
      targetRecords.push({
        frameworkId: target.frameworkId,
        recordId: target.recordId,
        path: target.path,
        canonicalUrl: result.canonicalUrl,
        officialIdentifier: target.path,
        sourceHash: result.sourceHash,
        httpStatus: result.httpStatus,
        entryCount: result.entryCount,
      });
      writeFileSync(
        join(cacheDir, `${target.recordId}.meta.json`),
        JSON.stringify({ target, result: { ...result, body: undefined } }, null, 2)
      );
    }
  }

  const discover = await connector.discover({
    mode: CONNECTOR_MODES.LIVE_VERIFICATION,
    liveAllowed: true,
    limit: 2,
    correlationId,
  });
  check('discover-live', discover.ok);

  const minTargets = ['ukpga/2009/21', 'uksi/2017/752', 'ukpga/2004/35'];
  const verifiedPaths = new Set(targetRecords.map((t) => t.path));
  check('min-target-set', minTargets.every((p) => verifiedPaths.has(p)));

  const allTargetsOk = targetRecords.length === LEGISLATION_TARGET_MAP.length;
  const pass = checks.every((c) => c.ok) && allTargetsOk;

  const payload = {
    schemaVersion: 1,
    verificationType: 'UK LEGISLATION LIVE VERIFICATION',
    status: pass ? 'LIVE_VERIFIED' : 'ERROR',
    authority: 'The National Archives',
    sourceName: 'legislation.gov.uk',
    officialHost: 'www.legislation.gov.uk',
    feedType: 'application/atom+xml',
    discoveryFeedUrl: LEGISLATION_NEW_FEED,
    userAgent: LEGISLATION_USER_AGENT,
    lastVerifiedAt: new Date().toISOString(),
    verifiedFrameworkIds: pass ? targetRecords.map((t) => t.frameworkId) : [],
    verifiedRecordIds: pass ? targetRecords.map((t) => t.recordId) : [],
    targetRecords,
    feedProbe,
    feedItemsParsed: feedParsed,
    security: {
      httpsOnly: true,
      hostAllowlist: LEGISLATION_ALLOWED_HOSTS,
      userAgent: LEGISLATION_USER_AGENT,
    },
    history: [{ at: new Date().toISOString(), event: pass ? 'VERIFICATION PASSED' : 'VERIFICATION FAILED', checks }],
  };

  writeFileSync(fixturePath, JSON.stringify(payload, null, 2));
  writeFileSync(
    dataJsPath,
    `/** Auto-updated by verify-ri-live-legislation.mjs */\nexport const LEGISLATION_VERIFICATION_EVIDENCE = ${JSON.stringify(payload, null, 2)};\n`
  );

  console.log(JSON.stringify({ checks, pass, verifiedCount: targetRecords.length }, null, 2));
  console.log(pass ? 'UK LEGISLATION LIVE VERIFIED: PASS' : 'UK LEGISLATION LIVE VERIFIED: FAIL');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  console.log('UK LEGISLATION LIVE VERIFIED: FAIL');
  process.exit(1);
});
