#!/usr/bin/env node
/**
 * Design Lab — organisation selection gate must not masquerade as backend unavailable.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(platformRoot, '..', '..');
const gate = join(repoRoot, 'design-lab', 'regulatory-intelligence', 'js', 'platform', 'connectivity-gate.js');
const labConn = join(repoRoot, 'design-lab', 'regulatory-intelligence', 'js', 'platform', 'lab-connectivity.js');
const tenant = join(platformRoot, 'lib', 'auth', 'tenant-access.ts');

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

const gateSrc = readFileSync(gate, 'utf8');
const labSrc = readFileSync(labConn, 'utf8');
const tenantSrc = readFileSync(tenant, 'utf8');

if (gateSrc.includes('org_selection_required') && gateSrc.includes('Select organisation')) {
  pass('connectivity gate exposes org selection UI');
} else failMsg('connectivity gate org selection UI');

if (gateSrc.includes('isOrganisationSelectionRequired')) pass('connectivity gate distinguishes org selection');
else failMsg('isOrganisationSelectionRequired missing');

if (labSrc.includes("mode: 'org_selection_required'")) pass('lab connectivity sets org_selection_required mode');
else failMsg('lab-connectivity org_selection_required mode');

if (tenantSrc.includes('organisation_selection_required') && tenantSrc.includes('active.length > 1')) {
  pass('invalid cookie with multiple memberships requires selection');
} else failMsg('tenant-access multi-org stale cookie');

if (!fail) console.log('\nacceptance-lab-org-selection-gate: PASS\n');
else {
  console.error(`\nacceptance-lab-org-selection-gate: FAIL (${fail})\n`);
  process.exit(1);
}