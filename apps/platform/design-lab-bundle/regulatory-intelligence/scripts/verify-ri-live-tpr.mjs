/**
 * Live TPR verification (network) — separate from deterministic acceptance.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createTprConnector } from '../js/connectors/tpr-connector.js';
import { httpGet } from '../js/connectors/http-client.js';
import { assertUrlAllowed } from '../js/connectors/url-safety.js';
import {
  TPR_ALLOWED_HOSTS,
  TPR_ROBOTS,
  TPR_SITEMAP,
  TPR_DOCUMENT_LIBRARY,
  TPR_USER_AGENT,
} from '../js/connectors/tpr-constants.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(__dir, '..', 'cache', 'tpr');
const fixturePath = join(__dir, '..', 'fixtures', 'tpr-verification-evidence.json');
const dataJsPath = join(__dir, '..', 'js', 'tpr-verification-evidence-data.js');

async function main() {
  mkdirSync(cacheDir, { recursive: true });
  const connector = createTprConnector();
  const correlationId = `TPR-VERIFY-${Date.now()}`;
  const checks = [];

  const allow = assertUrlAllowed(TPR_SITEMAP, TPR_ALLOWED_HOSTS).ok;
  checks.push({ name: 'allowlist', ok: allow });
  checks.push({ name: 'https', ok: TPR_SITEMAP.startsWith('https://') });
  checks.push({ name: 'block-localhost', ok: !assertUrlAllowed('http://127.0.0.1/', TPR_ALLOWED_HOSTS).ok });

  const robots = await httpGet(TPR_ROBOTS, {
    allowedHosts: TPR_ALLOWED_HOSTS,
    userAgent: TPR_USER_AGENT,
    rateLimit: { minIntervalMs: 2500, maxConcurrent: 1 },
  });
  checks.push({ name: 'robots', ok: robots.ok });

  const sitemap = await connector.discoverSitemap({ liveAllowed: true, correlationId, limit: 10 });
  checks.push({ name: 'sitemap', ok: sitemap.ok && (sitemap.urls?.length || 0) > 0 });

  const docLib = await httpGet(TPR_DOCUMENT_LIBRARY, {
    allowedHosts: TPR_ALLOWED_HOSTS,
    userAgent: TPR_USER_AGENT,
    rateLimit: { minIntervalMs: 2500, maxConcurrent: 1 },
  });
  checks.push({ name: 'document-library', ok: docLib.ok });

  const targets = await connector.verifyTargets({ liveAllowed: true, correlationId });
  checks.push({ name: 'targets', ok: targets.ok });

  const targetRecords = (targets.results || [])
    .filter((x) => x.result.ok)
    .map((x) => ({
      tprRecordId: x.target.id,
      path: x.target.path,
      title: x.result.title,
      sourceHash: x.result.sourceHash,
      canonicalUrl: x.result.canonicalUrl,
      documentType: x.result.documentType,
    }));

  const families = [...new Set(targetRecords.map((t) => t.documentType))];
  const pass = checks.every((c) => c.ok) && targetRecords.length >= 5;

  const payload = {
    schemaVersion: 1,
    verificationType: 'TPR LIVE VERIFICATION',
    status: pass ? 'LIVE_VERIFIED' : 'ERROR',
    authority: 'The Pensions Regulator',
    officialHost: 'www.thepensionsregulator.gov.uk',
    sitemapUrl: TPR_SITEMAP,
    documentLibraryUrl: TPR_DOCUMENT_LIBRARY,
    userAgent: TPR_USER_AGENT,
    lastVerifiedAt: new Date().toISOString(),
    verifiedFrameworkIds: pass ? ['FWK-TPR-REQ', 'FWK-TPR-GCOP'] : [],
    verifiedRecordIds: pass ? targetRecords.map((t) => t.tprRecordId) : [],
    targetRecords,
    sourceFamiliesVerified: families,
    securityChecksPassed: checks.every((c) => c.ok),
    sitemapVerified: sitemap.ok,
    documentLibraryVerified: docLib.ok,
    checks,
  };

  writeFileSync(fixturePath, JSON.stringify(payload, null, 2));
  writeFileSync(
    dataJsPath,
    `/** Auto-updated by verify-ri-live-tpr.mjs */\nexport const TPR_VERIFICATION_EVIDENCE = ${JSON.stringify(payload, null, 2)};\n`
  );
  writeFileSync(join(cacheDir, 'verification-summary.json'), JSON.stringify(payload, null, 2));

  console.log(JSON.stringify({ checks, pass, records: targetRecords.length }, null, 2));
  console.log(pass ? 'THE PENSIONS REGULATOR LIVE VERIFIED: PASS' : 'THE PENSIONS REGULATOR LIVE VERIFIED: FAIL');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  console.log('THE PENSIONS REGULATOR LIVE VERIFIED: FAIL');
  process.exit(1);
});
