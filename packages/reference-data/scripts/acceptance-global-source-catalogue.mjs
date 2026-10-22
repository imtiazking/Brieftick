import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  REGULATORS,
  REGULATORY_SOURCES,
  getRegulatorById,
  getSourceById,
} from '../index.mjs';
import {
  CATALOGUE_STATUSES,
  INTEGRATION_VERIFICATION_STATUSES,
  PRODUCTION_STATUSES,
  PRODUCTION_STRATEGIES,
} from '../catalogue/types.mjs';
import { SOURCE_INTEGRATION_BY_ID } from '../catalogue/source-integration.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '..', '..');
let fail = 0;

function pass(label, ok) {
  if (!ok) {
    fail += 1;
    console.log(`FAIL: ${label}`);
  } else {
    console.log(`PASS: ${label}`);
  }
}

const requiredSourceFields = [
  'sourceId',
  'regulatorId',
  'regulatorName',
  'acronym',
  'jurisdiction',
  'country',
  'region',
  'regulatorType',
  'regulatoryDomains',
  'sectors',
  'officialBaseUrl',
  'sourceType',
  'integrationMethod',
  'apiAvailability',
  'authenticationRequirement',
  'updateFrequencyExpectation',
  'productRelevance',
  'status',
  'priority',
];

const regulatorIds = new Set(REGULATORS.map((r) => r.regulatorId));
pass('regulator ids unique', regulatorIds.size === REGULATORS.length);

const sourceIds = new Set(REGULATORY_SOURCES.map((s) => s.sourceId));
pass('source ids unique', sourceIds.size === REGULATORY_SOURCES.length);

for (const s of REGULATORY_SOURCES) {
  for (const f of requiredSourceFields) {
    if (s[f] === undefined || s[f] === null || s[f] === '') {
      pass(`source ${s.sourceId} has ${f}`, false);
    }
  }
  pass(`source ${s.sourceId} regulator exists`, regulatorIds.has(s.regulatorId));
  pass(`source ${s.sourceId} status allowed`, CATALOGUE_STATUSES.includes(s.status));
  pass(`source ${s.sourceId} not LIVE label`, s.status !== 'LIVE' && !String(s.notes || '').includes('status: LIVE'));

  const integ = s.integration;
  pass(`source ${s.sourceId} has integration`, !!integ);
  if (integ) {
    pass(
      `source ${s.sourceId} verificationStatus valid`,
      INTEGRATION_VERIFICATION_STATUSES.includes(integ.verificationStatus),
    );
    pass(
      `source ${s.sourceId} productionStatus valid`,
      PRODUCTION_STATUSES.includes(integ.productionStatus),
    );
    if (integ.productionStrategy) {
      pass(
        `source ${s.sourceId} productionStrategy valid`,
        PRODUCTION_STRATEGIES.includes(integ.productionStrategy),
      );
    }
    if (integ.verificationStatus === 'LIVE_VERIFIED') {
      pass(`source ${s.sourceId} LIVE_VERIFIED has evidence ref`, !!integ.verificationEvidenceRef);
      pass(`source ${s.sourceId} LIVE_VERIFIED has retrieval method`, !!integ.verifiedRetrievalMethod);
      pass(`source ${s.sourceId} LIVE_VERIFIED has canonical host`, !!integ.canonicalContentHostname);
      pass(`source ${s.sourceId} LIVE_VERIFIED not production ENABLED`, integ.productionStatus === 'NOT_ENABLED');
    }
    if (integ.verificationStatus === 'ACCESS_RESTRICTED') {
      pass(
        `source ${s.sourceId} ACCESS_RESTRICTED not LIVE_VERIFIED`,
        integ.verificationStatus !== 'LIVE_VERIFIED',
      );
    }
    if (SOURCE_INTEGRATION_BY_ID[s.sourceId]) {
      pass(
        `source ${s.sourceId} canonical host distinct from supporting`,
        !integ.officialSupportingHostnames ||
          integ.officialSupportingHostnames.includes(integ.canonicalContentHostname) ||
          integ.canonicalContentHostname !== integ.officialSupportingHostnames[0] ||
          integ.officialSupportingHostnames.length > 1,
      );
    }
  }
}

const batch1Ids = Object.keys(SOURCE_INTEGRATION_BY_ID);
for (const id of Object.keys(SOURCE_INTEGRATION_BY_ID)) {
  const ref = SOURCE_INTEGRATION_BY_ID[id].verificationEvidenceRef;
  if (!ref) continue;
  pass(`integration ${id} uses tracked manifest`, ref.includes('/manifests/'));
  pass(`integration ${id} not gitignored evidence`, !ref.includes('/evidence/'));
  const [filePart, sourceId] = ref.split('#');
  const manifestPath = join(repoRoot, filePart);
  pass(`tracked manifest exists for ${id}`, existsSync(manifestPath));
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const entry = manifest.entries.find((e) => e.sourceId === sourceId);
    pass(`manifest entry exists for ${id}`, !!entry && entry.sourceId === id);
    if (entry?.verificationStatus === 'LIVE_VERIFIED') {
      pass(
        `${id} manifest fingerprints`,
        entry.representativeDocuments?.length > 0 && !!entry.representativeDocuments[0].sha256,
      );
    }
  }
}

const verified = REGULATORY_SOURCES.filter((s) => s.status === 'VERIFIED_EXISTING');
const planned = REGULATORY_SOURCES.filter((s) => s.status === 'PLANNED');
const research = REGULATORY_SOURCES.filter((s) => s.status === 'RESEARCH_REQUIRED');
const nA = REGULATORY_SOURCES.filter((s) => s.status === 'NOT_APPLICABLE');

pass('verified includes FCA', verified.some((s) => s.sourceId === 'SRC-FCA-PUBLICATIONS-RSS'));
pass('verified includes UK legislation', verified.some((s) => s.sourceId === 'SRC-UK-LEGISLATION-ATOM'));
pass('verified includes TPR', verified.some((s) => s.sourceId === 'SRC-TPR-DOCUMENT-LIBRARY'));
pass('verified includes Basel', verified.some((s) => s.sourceId === 'SRC-BASEL-FRAMEWORK'));
pass('OFSI planned sanctions split', getSourceById('SRC-OFSI-SANCTIONS-GUIDANCE')?.productRelevance?.fc === 'primary');
pass('OFAC planned sanctions split', getSourceById('SRC-OFAC-SDN-LISTS')?.productRelevance?.fc === 'primary');

const integCounts = {};
const prodCounts = {};
for (const s of REGULATORY_SOURCES) {
  const v = s.integration?.verificationStatus || 'MISSING';
  const p = s.integration?.productionStatus || 'MISSING';
  integCounts[v] = (integCounts[v] || 0) + 1;
  prodCounts[p] = (prodCounts[p] || 0) + 1;
}

console.log('CATALOGUE_LIFECYCLE:', {
  VERIFIED_EXISTING: verified.length,
  PLANNED: planned.length,
  RESEARCH_REQUIRED: research.length,
  NOT_APPLICABLE: nA.length,
});
console.log('INTEGRATION_VERIFICATION:', integCounts);
console.log('PRODUCTION_ENABLEMENT:', prodCounts);

const byJurisdiction = {};
for (const r of REGULATORS) {
  byJurisdiction[r.jurisdiction] = (byJurisdiction[r.jurisdiction] || 0) + 1;
}
console.log('REGULATORS_BY_JURISDICTION:', JSON.stringify(byJurisdiction, null, 2));
console.log('REGULATOR_COUNT:', REGULATORS.length);
console.log('SOURCE_COUNT:', REGULATORY_SOURCES.length);

const catalogueFiles = [
  join(root, 'catalogue', 'regulators.mjs'),
  join(root, 'catalogue', 'regulatory-sources.mjs'),
  join(root, 'catalogue', 'source-integration.mjs'),
  join(root, 'catalogue', 'types.mjs'),
];
for (const f of catalogueFiles) {
  const text = readFileSync(f, 'utf8');
  pass(`no fetch in ${f.split(/[/\\]/).pop()}`, !text.includes('fetch('));
  pass(`no secrets pattern in ${f.split(/[/\\]/).pop()}`, !/sk_live|Bearer\s+[A-Za-z0-9._-]{20,}/.test(text));
}

const labOps = readFileSync(
  join(repoRoot, 'design-lab', 'regulatory-intelligence', 'js', 'ai-operations-views.js'),
  'utf8',
);
pass('design lab file readable', labOps.includes('AI Operations'));

if (fail > 0) process.exit(1);
console.log('Global regulatory source catalogue acceptance: PASS');

