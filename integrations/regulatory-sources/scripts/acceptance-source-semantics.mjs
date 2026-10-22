#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_INTEGRATION_BY_ID } from '../../../packages/reference-data/catalogue/source-integration.mjs';
import {
  SOURCE_COVERAGE_BY_ID,
  COVERAGE_VERIFICATION_STATUSES,
  REGULATORY_CONTENT_CLASSES,
} from '../../../packages/reference-data/catalogue/source-coverage.mjs';
import { validateRiUseGating } from '../../../packages/reference-data/catalogue/source-content-gating.mjs';
import { REGULATORY_SOURCES } from '../../../packages/reference-data/index.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dir, '..', '..', '..');
const manifestDir = join(repoRoot, 'integrations', 'regulatory-sources', 'manifests');

const RULEBOOK_SOURCE_IDS = new Set(
  Object.keys(SOURCE_INTEGRATION_BY_ID).filter((id) =>
    /RULEBOOK|UK-RULES|COMPANIES-LAW|LEGISLATION-GAZETTE|EINVOICING|FRAMEWORKS|REGULATIONS$/i.test(id),
  ),
);

const NEWS_PRESS = new Set(['NEWS', 'PRESS_RELEASE']);
const SANCTIONS_DATA_CLASS = 'SANCTIONS_DATA';
const SANCTIONS_POLICY_CLASS = 'SANCTIONS_POLICY';

const NEW_SEMANTIC_SOURCE_IDS = [
  'SRC-OFAC-REGULATORY-UPDATES',
  'SRC-VARA-REGULATORY-UPDATES',
  'SRC-CFPB-REGULATORY-UPDATES',
  'SRC-SEC-RULEMAKING',
  'SRC-CFTC-RULEMAKING',
];

let fail = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function failMsg(msg) {
  fail += 1;
  console.error(`FAIL: ${msg}`);
}

const testedIds = Object.keys(SOURCE_INTEGRATION_BY_ID);
if (testedIds.length !== Object.keys(SOURCE_COVERAGE_BY_ID).length) {
  failMsg('tested integration count must match coverage audit count');
} else pass('tested sources have coverage records');

if (REGULATORY_SOURCES.length !== 41) failMsg('catalogue must have 41 sources after semantic remediation');
else pass('catalogue has 41 sources');

for (const sourceId of testedIds) {
  const cov = SOURCE_COVERAGE_BY_ID[sourceId];
  if (!cov) failMsg(`missing coverage for ${sourceId}`);
  else if (!COVERAGE_VERIFICATION_STATUSES.includes(cov.coverageVerificationStatus)) {
    failMsg(`invalid coverage status ${sourceId}`);
  } else pass(`${sourceId} coverageVerificationStatus defined`);

  for (const cls of cov?.contentClasses || []) {
    if (!REGULATORY_CONTENT_CLASSES.includes(cls)) failMsg(`invalid content class ${cls} on ${sourceId}`);
  }

  const gating = validateRiUseGating(cov.contentClasses, cov.riUseCases);
  if (!gating.ok) failMsg(`${sourceId} RI gating: ${gating.violations.join('; ')}`);
  else pass(`${sourceId} RI use-case gating ok`);

  const integ = SOURCE_INTEGRATION_BY_ID[sourceId];
  const attached = REGULATORY_SOURCES.find((s) => s.sourceId === sourceId);
  if (attached?.integration?.coverageVerificationStatus !== cov.coverageVerificationStatus) {
    failMsg(`${sourceId} catalogue integration coverage mismatch`);
  } else pass(`${sourceId} catalogue merge ok`);

  if (integ.productionStatus !== 'NOT_ENABLED') failMsg(`${sourceId} production must be NOT_ENABLED`);
  else pass(`${sourceId} production NOT_ENABLED`);

  if (integ.verificationStatus === 'LIVE_VERIFIED' && cov.coverageVerificationStatus === 'COVERAGE_VERIFIED') {
    pass(`${sourceId} LIVE_VERIFIED with explicit COVERAGE_VERIFIED`);
  }
  if (integ.verificationStatus === 'LIVE_VERIFIED' && cov.coverageVerificationStatus === 'CONNECTIVITY_ONLY') {
    pass(`${sourceId} LIVE_VERIFIED does not imply COVERAGE_VERIFIED`);
  }

  const classes = new Set(cov.contentClasses || []);
  const onlyNewsPress =
    classes.size > 0 && [...classes].every((c) => NEWS_PRESS.has(c));

  if (cov.coverageVerificationStatus === 'COVERAGE_VERIFIED') {
    if (onlyNewsPress) failMsg(`${sourceId} COVERAGE_VERIFIED cannot be news/press only`);
    else pass(`${sourceId} COVERAGE_VERIFIED has substantive classes`);
    if (
      RULEBOOK_SOURCE_IDS.has(sourceId) &&
      !classes.has('RULEBOOK') &&
      !classes.has('SECONDARY_LEGISLATION') &&
      !classes.has('PRIMARY_LEGISLATION') &&
      !classes.has('FRAMEWORK') &&
      !classes.has('SUPERVISORY_GUIDANCE') &&
      !classes.has('REGULATORY_NOTICE')
    ) {
      failMsg(`${sourceId} rulebook-named source COVERAGE_VERIFIED without rule-like classes`);
    }
  }

  if (RULEBOOK_SOURCE_IDS.has(sourceId) && onlyNewsPress && cov.coverageVerificationStatus === 'COVERAGE_VERIFIED') {
    failMsg(`${sourceId} NEWS cannot satisfy RULEBOOK source as COVERAGE_VERIFIED`);
  }

  if (onlyNewsPress && cov.riUseCases?.includes('RULE_OBLIGATION_SOURCE')) {
    failMsg(`${sourceId} NEWS/PRESS cannot imply RULE_OBLIGATION_SOURCE`);
  }
}

const ofacSdn = SOURCE_COVERAGE_BY_ID['SRC-OFAC-SDN-LISTS'];
const ofacReg = SOURCE_COVERAGE_BY_ID['SRC-OFAC-REGULATORY-UPDATES'];
if (ofacSdn.coverageVerificationStatus === 'SEMANTIC_MISMATCH') {
  failMsg('OFAC SDN must not remain SEMANTIC_MISMATCH after split');
} else pass('OFAC SDN semantic mismatch cleared');
if (SOURCE_INTEGRATION_BY_ID['SRC-OFAC-SDN-LISTS'].verificationStatus !== 'NOT_TESTED') {
  failMsg('OFAC SDN technical status must be NOT_TESTED');
} else pass('OFAC SDN NOT_TESTED (FC dataset)');
if (SOURCE_INTEGRATION_BY_ID['SRC-OFAC-REGULATORY-UPDATES'].verificationStatus !== 'LIVE_VERIFIED') {
  failMsg('OFAC regulatory updates must own recent-actions verification');
} else pass('OFAC regulatory updates LIVE_VERIFIED');
if (!ofacReg.contentClasses.includes(SANCTIONS_POLICY_CLASS)) failMsg('OFAC reg updates need SANCTIONS_POLICY');
else pass('OFAC policy class on regulatory updates');
if (ofacSdn.contentClasses.includes(SANCTIONS_DATA_CLASS)) failMsg('OFAC SDN must not claim SANCTIONS_DATA without proof');
else pass('SANCTIONS_DATA distinct from OFAC policy route');

const varaRb = SOURCE_COVERAGE_BY_ID['SRC-VARA-RULEBOOK'];
const varaNews = SOURCE_COVERAGE_BY_ID['SRC-VARA-REGULATORY-UPDATES'];
if (varaRb.coverageVerificationStatus === 'COVERAGE_VERIFIED' && varaRb.contentClasses.every((c) => NEWS_PRESS.has(c))) {
  failMsg('VARA rulebook cannot be news-only COVERAGE_VERIFIED');
} else pass('VARA rulebook not news-validated');
if (!varaNews.contentClasses.some((c) => NEWS_PRESS.has(c))) failMsg('VARA regulatory updates should be news-class');
else pass('VARA news on regulatory updates source');
if (SOURCE_INTEGRATION_BY_ID['SRC-VARA-REGULATORY-UPDATES'].verificationEvidenceRef?.includes('semantic-remediation')) {
  pass('VARA news connector on semantic manifest');
} else failMsg('VARA news must reference semantic remediation manifest');

const cfpbRules = SOURCE_COVERAGE_BY_ID['SRC-CFPB-RULES'];
const cfpbNews = SOURCE_COVERAGE_BY_ID['SRC-CFPB-REGULATORY-UPDATES'];
if (cfpbNews.coverageVerificationStatus === 'COVERAGE_VERIFIED') {
  failMsg('CFPB newsroom cannot be COVERAGE_VERIFIED as rules');
} else pass('CFPB newsroom not rule coverage');
if (!cfpbRules.riUseCases.includes('RULE_OBLIGATION_SOURCE')) failMsg('CFPB rules should support obligation source when verified');
else pass('CFPB rules obligation use on rulemaking route');

if (SOURCE_COVERAGE_BY_ID['SRC-FDIC-GUIDANCE'].coverageVerificationStatus === 'CONNECTIVITY_ONLY') {
  failMsg('FDIC guidance should be upgraded off generic news');
} else pass('FDIC guidance semantic upgrade');

const secPub = SOURCE_COVERAGE_BY_ID['SRC-SEC-RULES-PUBLICATIONS'];
const secRm = SOURCE_COVERAGE_BY_ID['SRC-SEC-RULEMAKING'];
if (secPub.coverageVerificationStatus === 'COVERAGE_VERIFIED') failMsg('SEC press alone cannot be COVERAGE_VERIFIED rulemaking');
else pass('SEC publications not full rulemaking coverage');
if (secPub.riUseCases.includes('RULE_OBLIGATION_SOURCE')) failMsg('SEC press must not imply RULE_OBLIGATION_SOURCE');
else pass('SEC press releases do not imply obligations');
if (SOURCE_INTEGRATION_BY_ID['SRC-SEC-RULEMAKING'].verificationStatus === 'LIVE_VERIFIED') {
  pass('SEC rulemaking source technically verified');
}

const cftcPub = SOURCE_COVERAGE_BY_ID['SRC-CFTC-PUBLICATIONS'];
const cftcRm = SOURCE_COVERAGE_BY_ID['SRC-CFTC-RULEMAKING'];
if (cftcPub.coverageVerificationStatus === 'COVERAGE_VERIFIED') failMsg('CFTC press should not be full rulemaking COVERAGE_VERIFIED');
else pass('CFTC publications partial/enforcement horizon');
if (cftcRm.coverageVerificationStatus === 'COVERAGE_VERIFIED') {
  failMsg('CFTC rulemaking not COVERAGE_VERIFIED until FR links proven');
} else pass('CFTC rulemaking honest coverage status');

if (SOURCE_COVERAGE_BY_ID['SRC-OCC-BULLETINS'].coverageVerificationStatus !== 'COVERAGE_VERIFIED') {
  failMsg('OCC bulletins should be COVERAGE_VERIFIED after bulletin-only pattern');
} else pass('OCC bulletins COVERAGE_VERIFIED');

for (const id of NEW_SEMANTIC_SOURCE_IDS) {
  if (!REGULATORY_SOURCES.some((s) => s.sourceId === id)) failMsg(`missing new source ${id}`);
  else pass(`new semantic source ${id} in catalogue`);
  const integ = SOURCE_INTEGRATION_BY_ID[id];
  if (!integ) failMsg(`integration missing ${id}`);
  else if (integ.productionStatus !== 'NOT_ENABLED') failMsg(`${id} must be NOT_ENABLED`);
  else pass(`${id} integration NOT_ENABLED`);
}

const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8');
if (!gitignore.includes('integrations/regulatory-sources/evidence/')) failMsg('evidence not gitignored');
else pass('raw evidence gitignored');

for (const file of [
  'batch-1-verification.json',
  'batch-1b-verification.json',
  'batch-2-verification.json',
  'batch-semantic-remediation-verification.json',
]) {
  const path = join(manifestDir, file);
  if (!existsSync(path)) {
    failMsg(`missing manifest ${file}`);
    continue;
  }
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  for (const entry of manifest.entries) {
    if (!entry.coverageVerificationStatus) failMsg(`${entry.sourceId} manifest missing coverageVerificationStatus`);
    else pass(`${entry.sourceId} manifest coverage metadata (${file})`);
    if (entry.coverageVerificationStatus === 'COVERAGE_VERIFIED' && entry.contentClasses?.length === 0) {
      failMsg(`${entry.sourceId} manifest COVERAGE_VERIFIED needs contentClasses`);
    }
  }
}

const frozenRi = join(repoRoot, 'design-lab', 'regulatory-intelligence', 'js', 'router.js');
if (!existsSync(frozenRi)) failMsg('frozen RI missing');
else pass('frozen RI path present');

const regulatorCount = readFileSync(
  join(repoRoot, 'packages', 'reference-data', 'catalogue', 'regulators.mjs'),
  'utf8',
).match(/regulatorId: 'REG-/g)?.length;
if (regulatorCount !== 36) failMsg('regulator IDs changed');
else pass('regulator IDs unchanged (36)');

if (fail) {
  console.error(`\nSource semantics acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nSource semantics acceptance: PASS');
