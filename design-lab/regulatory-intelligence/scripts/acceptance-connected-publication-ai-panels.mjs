#!/usr/bin/env node
/**
 * Offline guard — UC-RI-005 publication AI tab wiring (no HTTP, no Anthropic).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

const files = {
  panels: join(root, 'js/platform/connected-publication-ai-panels.js'),
  mode: join(root, 'js/platform/connected-mode.js'),
  pub: join(root, 'js/publication-views.js'),
  app: join(root, 'js/app.js'),
};

for (const [k, p] of Object.entries(files)) {
  if (!existsSync(p)) fail(`missing ${k}: ${p}`);
  else ok(`present ${k}`);
}

const panels = readFileSync(files.panels, 'utf8');
const mode = readFileSync(files.mode, 'utf8');
const pub = readFileSync(files.pub, 'utf8');
const app = readFileSync(files.app, 'utf8');

if (!panels.includes('UC-RI-005')) fail('panels missing UC-RI-005');
else ok('UC-RI-005 in panels');

if (!panels.includes('/ai-analysis-runs')) fail('panels missing POST target');
else ok('POST /ai-analysis-runs in panels');

if (!mode.includes('isConnectedAiRequestEnabled')) fail('connected-mode missing isConnectedAiRequestEnabled');
else ok('isConnectedAiRequestEnabled exported');

if (!mode.includes('4d871541-e0d4-4581-828d-72073f763f85')) fail('Partner UAT guard missing');
else ok('Partner UAT org blocked');

if (!mode.includes('cd25bb17-d575-4109-8432-4b63c75f9617')) fail('Org A guard missing');
else ok('Org A org blocked');

if (!pub.includes('renderConnectedPublicationAiTab')) fail('publication-views not wired');
else ok('publication AI tab composition');

if (!app.includes('data-connected-pub-ai-submit')) fail('app.js missing submit handler');
else ok('publication extraction handler');

if (!/if\s*\(\s*!isConnectedAiRequestEnabled\(state\)\s*\)[\s\S]*?return\s+''\s*;/.test(panels)) {
  fail('non-allowlisted orgs must not render extraction panel markup');
} else ok('Partner UAT / non-AI-dev: zero extraction UI chrome');

if (!pub.includes('if (!aiExtractionUi)')) fail('publication-views missing aiExtractionUi branch');
else ok('non-AI-dev AI tab matches pre-integration runs-only view');

console.log(JSON.stringify({ programmePass: failures.length === 0, failures }, null, 2));
process.exit(failures.length ? 1 : 0);