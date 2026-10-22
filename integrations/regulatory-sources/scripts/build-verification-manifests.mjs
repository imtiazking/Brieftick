#!/usr/bin/env node
/**
 * Regenerate tracked verification manifests from local gitignored evidence (developer machine only).
 * Does not perform live retrieval.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toCatalogueIntegrationStatus } from './lib/integration-status-map.mjs';
import { SOURCE_COVERAGE_BY_ID } from '../../../packages/reference-data/catalogue/source-coverage.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const labRoot = join(__dir, '..');
const manifestDir = join(labRoot, 'manifests');

function compactEntry(result) {
  const s = result.summary;
  const pubs = result.publications || [];
  const fingerprints = pubs
    .map((p) => ({
      sha256: p.contentHash,
      representativeDocumentUrl: p.canonicalUrl,
      title: p.title,
    }))
    .filter((f) => f.sha256 && f.representativeDocumentUrl);

  if (fingerprints.length === 0 && s.contentHash && s.sourceDocumentUrl) {
    fingerprints.push({
      sha256: s.contentHash,
      representativeDocumentUrl: s.sourceDocumentUrl,
      title: s.title || null,
    });
  }

  return {
    regulatorId: result.regulatorId,
    sourceId: result.sourceId,
    verificationStatus: toCatalogueIntegrationStatus(s.verificationStatus),
    verifiedAt: s.retrievedAt,
    retrievalMethod: s.retrievalMethod,
    canonicalOfficialUrl: s.sourceDocumentUrl || result.feedUrl || s.officialUrl,
    canonicalHostname: result.allowedHosts?.[0] || null,
    canonicalRegulatoryContentUrl: result.feedUrl || null,
    itemCount: result.itemCount ?? fingerprints.length,
    representativeDocuments: fingerprints,
    httpStatus:
      s.httpStatus ??
      (s.verificationStatus === 'ACCESS_RESTRICTED' && s.error?.includes('403') ? 403 : null),
    contentType: s.contentType ?? null,
    productionStrategy: result.productionStrategy || batch1Strategies[result.sourceId] || null,
    notes:
      s.verificationStatus === 'ACCESS_RESTRICTED' && s.error
        ? `${s.error}${s.provenance?.note ? ` — ${s.provenance.note}` : ''}`
        : s.error || s.provenance?.note || null,
    rawEvidenceAvailableLocally: false,
    coverageVerificationStatus:
      SOURCE_COVERAGE_BY_ID[result.sourceId]?.coverageVerificationStatus ?? 'NOT_TESTED',
    contentClasses: SOURCE_COVERAGE_BY_ID[result.sourceId]?.contentClasses ?? [],
  };
}

function buildManifest(batchId, evidenceFile, sourceFilter) {
  const path = join(labRoot, 'evidence', evidenceFile);
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const entries = raw.results
    .filter((r) => !sourceFilter || sourceFilter(r.sourceId))
    .map(compactEntry);
  return {
    manifestId: batchId,
    generatedFrom: `integrations/regulatory-sources/evidence/${evidenceFile}`,
    generatedAt: new Date().toISOString(),
    labRunRetrievedAt: raw.retrievedAt,
    entries,
  };
}

mkdirSync(manifestDir, { recursive: true });

const batch1Strategies = {
  'SRC-ICO-GUIDANCE': 'DIRECT_OFFICIAL_HTML',
  'SRC-PSR-UK-RULES': 'DIRECT_OFFICIAL_HTML',
  'SRC-FRC-PUBLICATIONS': 'DIRECT_OFFICIAL_HTML',
  'SRC-CMA-UK-ENFORCEMENT': 'DIRECT_OFFICIAL_FEED',
  'SRC-OFSI-SANCTIONS-GUIDANCE': 'DIRECT_OFFICIAL_FEED',
  'SRC-SEC-RULES-PUBLICATIONS': 'DIRECT_OFFICIAL_FEED',
  'SRC-FINRA-RULEBOOK': 'DIRECT_OFFICIAL_HTML',
};

const batch1Ids = new Set([
  'SRC-ICO-GUIDANCE',
  'SRC-PSR-UK-RULES',
  'SRC-FRC-PUBLICATIONS',
  'SRC-CMA-UK-ENFORCEMENT',
  'SRC-OFSI-SANCTIONS-GUIDANCE',
  'SRC-SEC-RULES-PUBLICATIONS',
  'SRC-FINRA-RULEBOOK',
]);

const batch1bIds = new Set([
  'SRC-SAMA-RULEBOOK',
  'SRC-CMA-SA-RULES',
  'SRC-DFSA-RULEBOOK',
  'SRC-CBUAE-DIGITAL-RULEBOOK',
]);

const batch2Ids = new Set([
  'SRC-IA-SA-REGULATIONS',
  'SRC-TADAWUL-RULEBOOK',
  'SRC-SDAIA-PDPL',
  'SRC-ZATCA-EINVOICING',
  'SRC-MOCI-SA-COMPANIES-LAW',
  'SRC-NCA-SA-FRAMEWORKS',
  'SRC-SA-LEGISLATION-GAZETTE',
  'SRC-SCA-UAE-REGULATIONS',
  'SRC-FSRA-RULEBOOK',
  'SRC-UAE-FIU-GUIDANCE',
  'SRC-CFTC-PUBLICATIONS',
  'SRC-FRB-SUPERVISION',
  'SRC-NFA-RULEBOOK',
]);

/** Tracked manifest fields aligned with catalogue (not raw evidence bodies). */
const manifestEntryOverrides = {
  'SRC-SAMA-RULEBOOK': {
    canonicalOfficialUrl: 'https://www.sama.gov.sa/',
    canonicalHostname: 'rulebook.sama.gov.sa',
    canonicalRegulatoryContentUrl: 'https://rulebook.sama.gov.sa/en',
    notes:
      'Primary www.sama.gov.sa TLS chain failed in Node lab client; verification used rulebook.sama.gov.sa without TLS bypass.',
  },
  'SRC-CMA-SA-RULES': {
    canonicalOfficialUrl: 'https://cma.gov.sa/RulesRegulations/Pages/default.aspx',
    canonicalHostname: 'cma.gov.sa',
    canonicalRegulatoryContentUrl: 'https://cma.gov.sa/RulesRegulations/Pages/default.aspx',
  },
  'SRC-DFSA-RULEBOOK': {
    canonicalOfficialUrl: 'https://www.dfsa.ae/',
    canonicalHostname: 'dfsaen.thomsonreuters.com',
    canonicalRegulatoryContentUrl: 'https://dfsaen.thomsonreuters.com/rulebook/rulemaking-instruments',
    notes:
      'www.dfsa.ae returned HTTP 403 to Integration Lab; rulebook retrieved from DFSA-authorised Thomson Reuters delivery host.',
  },
  'SRC-CBUAE-DIGITAL-RULEBOOK': {
    canonicalOfficialUrl: 'https://rulebook.centralbank.ae',
    canonicalHostname: 'rulebook.centralbank.ae',
    canonicalRegulatoryContentUrl: 'https://rulebook.centralbank.ae',
    httpStatus: 403,
    notes:
      'Integration Lab HTTP 403 on rulebook.centralbank.ae; access controls not bypassed. Rulebook CNAMEs to Thomson Reuters hosting; cbuae.thomsonreuters.com alias not resolvable in lab DNS.',
  },
  'SRC-TADAWUL-RULEBOOK': {
    canonicalOfficialUrl: 'https://www.saudiexchange.sa/',
    canonicalHostname: 'www.saudiexchange.sa',
    httpStatus: 403,
    notes: 'Integration Lab HTTP 403 on exchange rulebook paths; no WAF bypass.',
  },
  'SRC-FSRA-RULEBOOK': {
    canonicalOfficialUrl: 'https://www.adgm.com/financial-services-regulatory-authority',
    canonicalHostname: 'en.adgm.thomsonreuters.com',
    canonicalRegulatoryContentUrl: 'https://en.adgm.thomsonreuters.com/rulebook/rulemaking-instruments',
    httpStatus: 403,
    notes:
      'ADGM FSRA rulebook delivered via Thomson Reuters host; HTTP 403 to lab client on rulebook platform (similar pattern to DFSA/CBUAE).',
  },
  'SRC-SCA-UAE-REGULATIONS': {
    canonicalOfficialUrl: 'https://www.sca.gov.ae/',
    canonicalHostname: 'www.uaecma.gov.ae',
    canonicalRegulatoryContentUrl: 'https://www.uaecma.gov.ae/en/regulations.aspx',
    notes: 'sca.gov.ae redirects to uaecma.gov.ae (official SCA portal hostname).',
  },
};

function applyOverrides(entry) {
  const patch = manifestEntryOverrides[entry.sourceId];
  return patch ? { ...entry, ...patch } : entry;
}

const m1 = buildManifest('batch-1-verification', 'batch-1-latest.json', (id) => batch1Ids.has(id));
m1.entries = m1.entries.map(applyOverrides);
const m1b = buildManifest('batch-1b-verification', 'batch-1b-latest.json', (id) => batch1bIds.has(id));
m1b.entries = m1b.entries.map(applyOverrides);

const m2 = buildManifest('batch-2-verification', 'batch-2-latest.json', (id) => batch2Ids.has(id));
m2.entries = m2.entries.map(applyOverrides);

const mSem = buildManifest(
  'batch-semantic-remediation-verification',
  'batch-semantic-remediation-latest.json',
  () => true,
);
mSem.entries = mSem.entries.map(applyOverrides);

writeFileSync(join(manifestDir, 'batch-1-verification.json'), JSON.stringify(m1, null, 2));
writeFileSync(join(manifestDir, 'batch-1b-verification.json'), JSON.stringify(m1b, null, 2));
writeFileSync(join(manifestDir, 'batch-2-verification.json'), JSON.stringify(m2, null, 2));
writeFileSync(
  join(manifestDir, 'batch-semantic-remediation-verification.json'),
  JSON.stringify(mSem, null, 2),
);
console.log('Wrote manifests:', m1.entries.length, m1b.entries.length, m2.entries.length, mSem.entries.length);
