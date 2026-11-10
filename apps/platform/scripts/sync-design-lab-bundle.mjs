#!/usr/bin/env node
/**
 * Copy Design Lab static tree into apps/platform for Vercel serverless file tracing.
 */
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
console.log('sync-design-lab-bundle: OK', destLab);
