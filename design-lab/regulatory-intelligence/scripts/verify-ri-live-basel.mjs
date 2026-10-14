/**
 * Live Basel / BIS verification (network) — separate from deterministic acceptance.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createBaselConnector } from '../js/connectors/basel-connector.js';
import { assertUrlAllowed } from '../js/connectors/url-safety.js';
import {
  BIS_ALLOWED_HOSTS,
  BASEL_FRAMEWORK_ROOT,
  BASEL_USER_AGENT,
  isBaselPathAllowed,
} from '../js/connectors/basel-constants.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(__dir, '..', 'cache', 'basel');
const fixturePath = join(__dir, '..', 'fixtures', 'basel-verification-evidence.json');
const dataJsPath = join(__dir, '..', 'js', 'basel-verification-evidence-data.js');

async function main() {
  mkdirSync(cacheDir, { recursive: true });
  const connector = createBaselConnector();
  const correlationId = `BASEL-VERIFY-${Date.now()}`;
  const checks = [];

  checks.push({ name: 'allowlist', ok: assertUrlAllowed(BASEL_FRAMEWORK_ROOT, BIS_ALLOWED_HOSTS).ok });
  checks.push({ name: 'https', ok: BASEL_FRAMEWORK_ROOT.startsWith('https://') });
  checks.push({ name: 'block-localhost', ok: !assertUrlAllowed('http://127.0.0.1/', BIS_ALLOWED_HOSTS).ok });
  checks.push({ name: 'path-gate', ok: isBaselPathAllowed('/committees/bcbs/basel-framework/standard/cap') });
  checks.push({ name: 'block-arbitrary', ok: !isBaselPathAllowed('/about/') });

  const targets = await connector.verifyTargets({ liveAllowed: true, correlationId });
  checks.push({ name: 'targets', ok: targets.ok });

  const targetRecords = (targets.results || [])
    .filter((x) => x.result.ok)
    .map((x) => ({
      baselRecordId: x.target.id,
      path: x.target.path,
      title: x.result.title,
      sourceHash: x.result.sourceHash,
      canonicalUrl: x.result.canonicalUrl,
      documentType: x.result.documentType,
      frameworkModule: x.result.frameworkModule,
      versionStatus: x.result.versionStatus,
      effectiveDate: x.result.effectiveDate,
    }));

  const families = [...new Set(targetRecords.map((t) => t.documentType))];
  const pass = checks.every((c) => c.ok) && targetRecords.length >= 8;

  const payload = {
    schemaVersion: 1,
    verificationType: 'BASEL BIS LIVE VERIFICATION',
    status: pass ? 'LIVE_VERIFIED' : 'ERROR',
    authority: 'Basel Committee on Banking Supervision',
    organisation: 'Bank for International Settlements',
    officialHost: 'www.bis.org',
    frameworkRootUrl: BASEL_FRAMEWORK_ROOT,
    userAgent: BASEL_USER_AGENT,
    lastVerifiedAt: new Date().toISOString(),
    verifiedFrameworkIds: pass ? ['FWK-BASEL'] : [],
    verifiedRecordIds: pass ? targetRecords.map((t) => t.baselRecordId) : [],
    targetRecords,
    sourceFamiliesVerified: families,
    securityChecksPassed: checks.every((c) => c.ok),
    frameworkRootVerified: targetRecords.some((t) => t.baselRecordId === 'BAS-TGT-FW-ROOT'),
    publicationLibraryVerified: targetRecords.some((t) => t.baselRecordId === 'BAS-TGT-PUBL-INDEX'),
    checks,
  };

  writeFileSync(fixturePath, JSON.stringify(payload, null, 2));
  writeFileSync(
    dataJsPath,
    `/** Auto-updated by verify-ri-live-basel.mjs */\nexport const BASEL_VERIFICATION_EVIDENCE = ${JSON.stringify(payload, null, 2)};\n`
  );
  writeFileSync(join(cacheDir, 'verification-summary.json'), JSON.stringify(payload, null, 2));

  console.log(JSON.stringify({ checks, pass, records: targetRecords.length }, null, 2));
  console.log(pass ? 'BASEL / BIS LIVE VERIFIED: PASS' : 'BASEL / BIS LIVE VERIFIED: FAIL');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  console.log('BASEL / BIS LIVE VERIFIED: FAIL');
  process.exit(1);
});
