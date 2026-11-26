#!/usr/bin/env node
/**
 * Design Lab governance PATCH error surfacing and assurance finding navigation.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatConnectedPatchError } from '../../../design-lab/regulatory-intelligence/js/platform/connected-work-writes.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const labRoot = join(__dir, '..', '..', '..', 'design-lab', 'regulatory-intelligence', 'js');
let fail = 0;

function pass(id, detail) {
  console.log(`PASS: ${id} — ${detail}`);
}

function failTest(id, detail) {
  fail += 1;
  console.error(`FAIL: ${id} — ${detail}`);
}

const sodMsg = formatConnectedPatchError(
  {
    ok: false,
    error: 'forbidden',
    reason: 'segregation_of_duties',
    message: 'Segregation of duties check — this item requires approval by a different authorised reviewer.',
  },
  'update_failed',
);
if (!/Segregation of duties/i.test(sodMsg)) {
  failTest('sod_message', sodMsg);
} else {
  pass('sod_message', 'maker-checker denial message surfaced');
}

const panels = readFileSync(join(labRoot, 'platform', 'connected-assurance-panels.js'), 'utf8');
if (!panels.includes('renderAssuranceFindingLinks') || !panels.includes('#/finding/')) {
  failTest('assurance_finding_links', 'assurance panel must link findings');
} else {
  pass('assurance_finding_links', 'finding href on assurance detail');
}

const catalogue = readFileSync(join(labRoot, 'platform', 'connected-catalogue.js'), 'utf8');
if (!catalogue.includes('linkedFindings') || !catalogue.includes('riskDetailsById')) {
  failTest('detail_revalidate', 'assurance findings and risk detail revalidation');
} else {
  pass('detail_revalidate', 'catalogue hydrates findings and revalidates governance entities');
}

const appJs = readFileSync(join(labRoot, 'app.js'), 'utf8');
if (!appJs.includes('riBoundRiskAction') || appJs.includes('closest(\'[data-connected-risk-action]\')')) {
  failTest('risk_action_binding', 'risk actions must bind per render, not document delegation');
} else {
  pass('risk_action_binding', 'risk governance actions bound after renderShell');
}

process.exit(fail ? 1 : 0);