#!/usr/bin/env node
/**
 * Copy Design Lab static tree into apps/platform for Vercel serverless file tracing.
 */
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
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
console.log('sync-design-lab-bundle: OK', destLab);
