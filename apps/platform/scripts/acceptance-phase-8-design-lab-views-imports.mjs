#!/usr/bin/env node
/**
 * Validates named ES module imports in regulatory-intelligence/js/views.js resolve to exports.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const platform = join(dirname(fileURLToPath(import.meta.url)), '..');
const labSrc = join(platform, '..', '..', 'design-lab', 'regulatory-intelligence');
const bundle = join(platform, 'design-lab-bundle', 'regulatory-intelligence');

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

const IMPORT_RE =
  /import\s*\{([^}]+)\}\s*from\s*['"](\.\/[^'"]+\.js)['"]/g;

function parseNamedImports(block) {
  return block
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(\w+)\s+as\s+(\w+)$/);
      return m ? m[1] : part.split(/\s+/)[0];
    });
}

function collectExports(fileText) {
  const names = new Set();
  for (const m of fileText.matchAll(/export\s+function\s+(\w+)/g)) names.add(m[1]);
  for (const m of fileText.matchAll(/export\s+const\s+(\w+)/g)) names.add(m[1]);
  for (const m of fileText.matchAll(/export\s+async\s+function\s+(\w+)/g)) names.add(m[1]);
  for (const m of fileText.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const bit = part.trim();
      if (!bit) continue;
      const asM = bit.match(/^(\w+)\s+as\s+(\w+)$/);
      if (asM) names.add(asM[1]);
      else names.add(bit.split(/\s+/)[0]);
    }
  }
  return names;
}

function resolveReExports(root, fileText, filePath, visited = new Set()) {
  const names = collectExports(fileText);
  const abs = filePath;
  if (visited.has(abs)) return names;
  visited.add(abs);
  for (const m of fileText.matchAll(/export\s*\{([^}]+)\}\s*from\s*['"](\.\/[^'"]+)['"]/g)) {
    const rel = m[2].endsWith('.js') ? m[2] : `${m[2]}.js`;
    const modPath = join(dirname(filePath), rel.replace(/^\.\//, ''));
    if (!existsSync(modPath)) continue;
    const reExported = parseNamedImports(m[1]);
    const subExports = resolveReExports(root, readFileSync(modPath, 'utf8'), modPath, visited);
    for (const name of reExported) {
      if (subExports.has(name)) names.add(name);
    }
  }
  return names;
}

function auditRoot(label, root) {
  const viewsPath = join(root, 'js', 'views.js');
  if (!existsSync(viewsPath)) {
    failMsg(`${label}: missing views.js`);
    return;
  }
  const views = readFileSync(viewsPath, 'utf8');
  let importsChecked = 0;
  for (const m of views.matchAll(IMPORT_RE)) {
    const rel = m[2];
    if (!rel.startsWith('./')) continue;
    const names = parseNamedImports(m[1]);
    const modPath = join(root, 'js', rel.slice(2));
    if (!existsSync(modPath)) {
      failMsg(`${label}: missing module ${rel} for ${names.join(', ')}`);
      continue;
    }
    const exports = resolveReExports(root, readFileSync(modPath, 'utf8'), modPath);
    for (const name of names) {
      importsChecked += 1;
      if (!exports.has(name)) {
        failMsg(`${label}: ${rel} missing export ${name} (imported by views.js)`);
      }
    }
  }
  pass(`${label}: checked ${importsChecked} named imports in views.js`);
}

try {
  execSync('node ./scripts/sync-design-lab-bundle.mjs', { cwd: platform, stdio: 'pipe' });
  pass('prebuild sync-design-lab-bundle');
} catch {
  failMsg('sync-design-lab-bundle failed');
}

auditRoot('design-lab', labSrc);
auditRoot('design-lab-bundle', bundle);

const gov = readFileSync(join(bundle, 'js', 'governance-views.js'), 'utf8');
if (gov.includes('export function renderDashboardGovernanceSummaryConnected')) {
  pass('bundle governance-views exports renderDashboardGovernanceSummaryConnected');
} else failMsg('bundle governance-views missing renderDashboardGovernanceSummaryConnected');

process.exitCode = fail ? 1 : 0;
console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
