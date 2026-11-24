#!/usr/bin/env node
/** Proves bad Design Lab modules fail the release gate without touching staging. */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateDesignLabJsBindings } from './validate-design-lab-js-deps.mjs';

const root = mkdtempSync(join(tmpdir(), 'ri-lab-gate-'));
const js = join(root, 'js');
mkdirSync(js);
writeFileSync(
  join(js, 'app.js'),
  `import { missingExport } from './broken.js';\nexport function boot(){ return missingExport; }\n`,
);
writeFileSync(join(js, 'broken.js'), 'export const present = 1;\n');

const bindings = validateDesignLabJsBindings(js);
const missingNamed = bindings.problems.some((p) => p.includes("imports 'missingExport'"));
if (!missingNamed) {
  console.error('FAIL missing named export was not detected', bindings);
  process.exit(1);
}

const dupRoot = mkdtempSync(join(tmpdir(), 'ri-lab-dup-'));
mkdirSync(join(dupRoot, 'js'));
writeFileSync(join(dupRoot, 'js', 'app.js'), 'const present = 1;\nconst present = 2;\nexport const ok = 1;\n');
const dup = validateDesignLabJsBindings(join(dupRoot, 'js'));
rmSync(dupRoot, { recursive: true, force: true });
if (!dup.problems.some((p) => p.includes('already been declared'))) {
  console.error('FAIL duplicate declaration was not detected', dup);
  process.exit(1);
}
rmSync(root, { recursive: true, force: true });
console.log('acceptance-ri-design-lab-release-gate: PASS', { missingNamed, duplicateDeclaration: true });
