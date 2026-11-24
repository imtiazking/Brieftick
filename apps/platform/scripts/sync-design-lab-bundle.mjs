#!/usr/bin/env node
/**
 * Copy Design Lab static tree into apps/platform for Vercel serverless file tracing.
 */
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const monorepoRoot = join(platformRoot, '..', '..');
const srcLab = join(monorepoRoot, 'design-lab', 'regulatory-intelligence');
const destLab = join(platformRoot, 'design-lab-bundle', 'regulatory-intelligence');
const srcTheme = join(monorepoRoot, 'styles', 'split-theme.css');
const destThemeDir = join(platformRoot, 'design-lab-bundle', 'styles');

if (!existsSync(join(srcLab, 'index.html'))) {
  console.error('sync-design-lab-bundle: missing source', srcLab);
  process.exit(1);
}

rmSync(join(platformRoot, 'design-lab-bundle'), { recursive: true, force: true });
mkdirSync(destThemeDir, { recursive: true });
cpSync(srcLab, destLab, { recursive: true });
cpSync(srcTheme, join(destThemeDir, 'split-theme.css'));

const govBundle = join(destLab, 'js', 'governance-views.js');
const viewsBundle = join(destLab, 'js', 'views.js');
if (!existsSync(govBundle) || !existsSync(viewsBundle)) {
  console.error('sync-design-lab-bundle: missing js bundle after copy');
  process.exit(1);
}
const govText = readFileSync(govBundle, 'utf8');
const viewsText = readFileSync(viewsBundle, 'utf8');
if (!govText.includes('export function renderDashboardGovernanceSummaryConnected')) {
  console.error('sync-design-lab-bundle: governance-views missing renderDashboardGovernanceSummaryConnected');
  process.exit(1);
}
if (!viewsText.includes('renderDashboardGovernanceSummaryConnected')) {
  console.error('sync-design-lab-bundle: views.js missing renderDashboardGovernanceSummaryConnected import');
  process.exit(1);
}
const adapterBundle = join(destLab, 'js', 'adapters', 'api-platform-adapter.js');
if (!existsSync(adapterBundle)) {
  console.error('sync-design-lab-bundle: missing api-platform-adapter.js');
  process.exit(1);
}
const adapterText = readFileSync(adapterBundle, 'utf8');
const adapterStubMarker = 'Future production API adapter contract (non-functional in Design Lab)';
if (adapterText.includes(adapterStubMarker) || !adapterText.includes('async bootstrap()')) {
  console.error(
    'sync-design-lab-bundle: api-platform-adapter must implement connected bootstrap (stub or missing bootstrap)',
  );
  process.exit(1);
}
const labConnectivity = join(destLab, 'js', 'platform', 'lab-connectivity.js');
if (!readFileSync(labConnectivity, 'utf8').includes('adapter.bootstrap()')) {
  console.error('sync-design-lab-bundle: lab-connectivity missing adapter.bootstrap() call');
  process.exit(1);
}
const { validateDesignLabJsModuleGraph, validateDesignLabJsBindings } = await import(
  pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'validate-design-lab-js-deps.mjs')).href
);
const srcGraph = validateDesignLabJsModuleGraph(join(srcLab, 'js'));
if (!srcGraph.ok) {
  console.error('sync-design-lab-bundle: source Design Lab module graph has missing files');
  for (const m of srcGraph.missing) console.error(`  MISSING: ${m.spec} (${m.from})`);
  process.exit(1);
}
const bundleGraph = validateDesignLabJsModuleGraph(join(destLab, 'js'));
if (!bundleGraph.ok) {
  console.error('sync-design-lab-bundle: bundle module graph has missing files');
  for (const m of bundleGraph.missing) console.error(`  MISSING: ${m.spec} (${m.from})`);
  process.exit(1);
}
for (const [label, root] of [
  ['source', join(srcLab, 'js')],
  ['bundle', join(destLab, 'js')],
]) {
  const bindings = validateDesignLabJsBindings(root);
  if (!bindings.ok) {
    console.error(`sync-design-lab-bundle: ${label} JavaScript bindings failed`);
    for (const problem of bindings.problems) console.error(`  ${problem}`);
    process.exit(1);
  }
}
console.log(
  `sync-design-lab-bundle: module graph OK (${bundleGraph.scanned} modules)`,
  destLab,
);
