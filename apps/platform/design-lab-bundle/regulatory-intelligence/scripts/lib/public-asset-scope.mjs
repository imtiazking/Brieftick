import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname, normalize } from 'path';

const IMPORT_RE = /\bfrom\s+['"]([^'"]+)['"]/g;
const IMPORT_SIDE_RE = /\bimport\s+['"]([^'"]+)['"]/g;
const HREF_SRC_RE = /(?:href|src)\s*=\s*['"]([^'"]+)['"]/gi;

export const RI_APP_URL_PREFIX = '/design-lab/regulatory-intelligence/';

export function getRepoRoots(repoRoot) {
  const riRoot = join(repoRoot, 'design-lab', 'regulatory-intelligence');
  return { repoRoot, riRoot };
}

function resolveWebPath(riRoot, fromFile, spec) {
  if (!spec || spec.startsWith('http:') || spec.startsWith('https:') || spec.startsWith('data:')) return null;
  let rel = spec;
  if (rel.startsWith(RI_APP_URL_PREFIX)) {
    rel = rel.slice(RI_APP_URL_PREFIX.length);
  } else if (rel.startsWith('/')) {
    if (!rel.startsWith(RI_APP_URL_PREFIX)) return null;
    rel = rel.slice(RI_APP_URL_PREFIX.length);
  }
  const base = dirname(fromFile);
  const abs = normalize(join(base, rel));
  if (!abs.startsWith(normalize(riRoot))) return null;
  return abs;
}

function collectFromHtml(riRoot, htmlPath, seen) {
  if (!existsSync(htmlPath) || seen.has(htmlPath)) return;
  seen.add(htmlPath);
  const text = readFileSync(htmlPath, 'utf8');
  let m;
  const re = new RegExp(HREF_SRC_RE.source, 'gi');
  while ((m = re.exec(text))) {
    const target = resolveWebPath(riRoot, htmlPath, m[1]);
    if (!target || !existsSync(target)) continue;
    if (target.endsWith('.html')) collectFromHtml(riRoot, target, seen);
    else if (/\.(js|mjs|css)$/i.test(target)) collectFromSource(riRoot, target, seen);
  }
}

function collectFromSource(riRoot, filePath, seen) {
  if (!existsSync(filePath) || seen.has(filePath)) return;
  seen.add(filePath);
  const text = readFileSync(filePath, 'utf8');
  for (const pattern of [IMPORT_RE, IMPORT_SIDE_RE]) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(text))) {
      const target = resolveWebPath(riRoot, filePath, m[1]);
      if (!target || !existsSync(target)) continue;
      if (/\.(js|mjs)$/i.test(target)) collectFromSource(riRoot, target, seen);
      else if (/\.css$/i.test(target)) seen.add(target);
    }
  }
}

export function collectRiPublicAssetFiles(repoRoot) {
  const { riRoot } = getRepoRoots(repoRoot);
  const entry = join(riRoot, 'index.html');
  const seen = new Set();
  collectFromHtml(riRoot, entry, seen);
  return [...seen].sort();
}

export function inspectVercelBridgeExposure(vercelJsonText) {
  const exposed = [];
  if (/\/analyze/i.test(vercelJsonText)) exposed.push('rewrite-mentions-analyze');
  if (/ri-ai-bridge/i.test(vercelJsonText)) exposed.push('rewrite-mentions-ri-ai-bridge');
  if (/ai-bridge/i.test(vercelJsonText)) exposed.push('rewrite-mentions-ai-bridge');
  return { exposedAsRoute: exposed.length > 0, reasons: exposed };
}

export function inspectApiBridgeExposure(apiDir) {
  if (!existsSync(apiDir)) return { exposedAsFunction: false, matches: [] };
  const matches = [];
  for (const name of readdirSync(apiDir)) {
    if (/ri-ai-bridge|ai-bridge|\/analyze/i.test(name)) matches.push(name);
  }
  return { exposedAsFunction: matches.length > 0, matches };
}

export function riClientImportsBridge(riRoot) {
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (name === 'node_modules' || name === 'scripts') continue;
        walk(p);
      } else if (/\.(js|mjs|html)$/i.test(name)) {
        const t = readFileSync(p, 'utf8');
        if (
          t.includes('ri-ai-bridge/') ||
          t.includes('server/ai-bridge') ||
          t.includes('RI_AI_BRIDGE_HOME') ||
          t.includes('forgeniq-ri\\ri-ai-bridge')
        ) {
          hits.push(p);
        }
      }
    }
  };
  walk(join(riRoot, 'js'));
  walk(join(riRoot, 'css'));
  const index = join(riRoot, 'index.html');
  if (existsSync(index)) {
    const t = readFileSync(index, 'utf8');
    if (t.includes('ri-ai-bridge') || t.includes('ai-bridge')) hits.push(index);
  }
  return hits;
}
