#!/usr/bin/env node
/**
 * Fail-closed: every relative JS/MJS import in the Design Lab app module graph must resolve on disk.
 * External URLs, absolute paths, and bare specifiers are ignored.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'acorn';

const IMPORT_FROM_RE = /\bfrom\s+['"](\.[^'"]+)['"]/g;
const IMPORT_PAREN_RE = /\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
const IMPORT_SIDE_RE = /\bimport\s+['"](\.[^'"]+)['"]/g;
const EXPORT_FROM_RE = /\bexport\s+[^;]*?\bfrom\s+['"](\.[^'"]+)['"]/g;

/**
 * @param {string} jsRoot absolute path to .../regulatory-intelligence/js
 * @returns {{ ok: boolean, missing: { from: string, spec: string, resolved: string }[], scanned: number }}
 */
export function validateDesignLabJsModuleGraph(jsRoot) {
  const entry = join(jsRoot, 'app.js');
  if (!existsSync(entry)) {
    return {
      ok: false,
      missing: [{ from: '(entry)', spec: 'app.js', resolved: entry }],
      scanned: 0,
    };
  }

  const seen = new Set();
  const queue = [entry];
  const missing = [];

  function resolveFile(fromFile, spec) {
    if (!spec.startsWith('.')) return null;
    const raw = normalize(join(dirname(fromFile), spec));
    if (existsSync(raw) && statSync(raw).isFile()) return raw;
    if (spec.endsWith('.js') || spec.endsWith('.mjs')) {
      return raw;
    }
    if (existsSync(`${raw}.js`)) return `${raw}.js`;
    if (existsSync(`${raw}.mjs`)) return `${raw}.mjs`;
    return raw;
  }

  function collectSpecs(text) {
    const specs = [];
    for (const re of [IMPORT_FROM_RE, IMPORT_PAREN_RE, IMPORT_SIDE_RE, EXPORT_FROM_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) specs.push(m[1]);
    }
    return specs;
  }

  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      missing.push({ from: file, spec: '(read)', resolved: file });
      continue;
    }
    for (const spec of collectSpecs(text)) {
      const target = resolveFile(file, spec);
      if (!target) continue;
      if (!existsSync(target) || !statSync(target).isFile()) {
        missing.push({ from: file, spec, resolved: target });
        continue;
      }
      if (/\.(js|mjs)$/i.test(target)) queue.push(target);
    }
  }

  return { ok: missing.length === 0, missing, scanned: seen.size, files: [...seen] };
}

function exportedNames(ast) {
  const names = new Set();
  let exportAll = false;
  for (const node of ast.body) {
    if (node.type === 'ExportAllDeclaration') exportAll = true;
    if (node.type === 'ExportDefaultDeclaration') names.add('default');
    if (node.type !== 'ExportNamedDeclaration') continue;
    if (node.declaration?.type === 'FunctionDeclaration' || node.declaration?.type === 'ClassDeclaration') {
      if (node.declaration.id?.name) names.add(node.declaration.id.name);
    }
    if (node.declaration?.type === 'VariableDeclaration') {
      for (const d of node.declaration.declarations) {
        if (d.id?.type === 'Identifier') names.add(d.id.name);
      }
    }
    for (const spec of node.specifiers || []) {
      names.add(spec.exported?.name || spec.exported?.value);
    }
  }
  return { names, exportAll };
}

/**
 * Fail when a named import is not exported, or a module does not parse.
 * @param {string} jsRoot
 */
export function validateDesignLabJsBindings(jsRoot) {
  const graph = validateDesignLabJsModuleGraph(jsRoot);
  const problems = [];
  if (!graph.ok) {
    for (const m of graph.missing) problems.push(`missing file ${m.spec} from ${m.from}`);
  }
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    let ast;
    try {
      ast = parse(readFileSync(file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
    } catch (err) {
      const problem = { file, error: err instanceof Error ? err.message : String(err) };
      cache.set(file, problem);
      return problem;
    }
    const parsed = { ast, ...exportedNames(ast) };
    cache.set(file, parsed);
    return parsed;
  }
  for (const file of graph.files || []) {
    const parsed = load(file);
    if (parsed.error) {
      problems.push(`syntax ${file}: ${parsed.error}`);
      continue;
    }
    for (const node of parsed.ast.body) {
      if (node.type !== 'ImportDeclaration') continue;
      if (!String(node.source.value).startsWith('.')) continue;
      const target = resolveFilePublic(file, node.source.value);
      if (!target || !existsSync(target)) continue;
      const imported = load(target);
      if (imported.error || imported.exportAll) continue;
      for (const spec of node.specifiers) {
        const name = spec.type === 'ImportDefaultSpecifier' ? 'default' : spec.imported?.name;
        if (!name) continue;
        if (spec.type === 'ImportNamespaceSpecifier') continue;
        if (!imported.names?.has(name)) {
          problems.push(`${file} imports '${name}' from ${node.source.value} but it is not exported`);
        }
      }
    }
  }
  return { ok: problems.length === 0, problems, scanned: graph.scanned };
}

function resolveFilePublic(fromFile, spec) {
  const raw = normalize(join(dirname(fromFile), spec));
  if (existsSync(raw) && statSync(raw).isFile()) return raw;
  if (existsSync(`${raw}.js`)) return `${raw}.js`;
  if (existsSync(`${raw}.mjs`)) return `${raw}.mjs`;
  return raw;
}

function main() {
  const jsRoot = process.argv[2];
  if (!jsRoot) {
    console.error('usage: validate-design-lab-js-deps.mjs <path-to-regulatory-intelligence/js>');
    process.exit(1);
  }
  const result = validateDesignLabJsModuleGraph(jsRoot);
  const bindings = validateDesignLabJsBindings(jsRoot);
  console.log(`validate-design-lab-js-deps: scanned ${result.scanned} modules`);
  if (!result.ok) {
    for (const m of result.missing) {
      console.error(`MISSING: ${m.spec} (from ${m.from}) -> ${m.resolved}`);
    }
  }
  if (!bindings.ok) {
    for (const problem of bindings.problems) console.error(`BINDING: ${problem}`);
  }
  if (!result.ok || !bindings.ok) process.exit(1);
  console.log('validate-design-lab-js-deps: OK');
}

const isMain =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) main();