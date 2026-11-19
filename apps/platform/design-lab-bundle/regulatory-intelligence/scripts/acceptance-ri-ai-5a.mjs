/**

 * AI 5A clarifications — deterministic (no live provider).

 */

import { readFileSync, existsSync } from 'fs';

import { join, dirname } from 'path';

import { fileURLToPath, pathToFileURL } from 'url';

import http from 'http';

import { tmpdir } from 'os';

import {

  AI_ANALYSIS_STATUS,

  AI_ANALYSIS_ERROR_CODES,

  statusForAnalysisErrorCode,

  isAllowedAnalysisStatus,

} from '../js/ai/enums.js';
import { runAi5aFoundationAcceptance } from './acceptance-ri-ai-5a-foundation.mjs';
import { runAi5aExtendedAcceptance } from './acceptance-ri-ai-5a-extended.mjs';

import {

  LOCAL_RI_DEV_ORIGIN,

  LOCAL_AI_BRIDGE_ORIGIN,

  resolveBridgeRoot,

  resolveRepoRoot,

  STATIC_BRIDGE_PROBE_PATHS,

} from './lib/ri-bridge-locations.mjs';

import {

  collectRiPublicAssetFiles,

  getRepoRoots,

  inspectVercelBridgeExposure,

  inspectApiBridgeExposure,

  riClientImportsBridge,

} from './lib/public-asset-scope.mjs';



const __dir = dirname(fileURLToPath(import.meta.url));

const RI_ROOT = join(__dir, '..');

const REPO_ROOT = resolveRepoRoot(__dir);

const BRIDGE_ROOT = resolveBridgeRoot();

const R = {};



function pass(id, ok, reason = '') {

  R[id] = ok ? 'PASS' : `FAIL: ${reason}`;

}



function bridgeImport(rel) {

  return import(pathToFileURL(join(BRIDGE_ROOT, rel)).href);

}



function request(server, { method, path, headers = {}, body }) {

  return new Promise((resolve, reject) => {

    const addr = server.address();

    const req = http.request(

      {

        hostname: '127.0.0.1',

        port: addr.port,

        method,

        path,

        headers,

      },

      (res) => {

        const chunks = [];

        res.on('data', (c) => chunks.push(c));

        res.on('end', () => {

          const text = Buffer.concat(chunks).toString('utf8');

          let json = null;

          try {

            json = JSON.parse(text);

          } catch {

            json = { raw: text };

          }

          resolve({ status: res.statusCode, headers: res.headers, json, text });

        });

      }

    );

    req.on('error', reject);

    if (body) req.write(body);

    req.end();

  });

}



function httpGetStatic(baseOrigin, urlPath) {

  return new Promise((resolve, reject) => {

    const u = new URL(urlPath, baseOrigin);

    const req = http.request(

      {

        hostname: u.hostname,

        port: u.port || 80,

        method: 'GET',

        path: u.pathname + u.search,

        timeout: 8000,

      },

      (res) => {

        const chunks = [];

        res.on('data', (c) => chunks.push(c));

        res.on('end', () => {

          resolve({

            status: res.statusCode,

            contentType: res.headers['content-type'] || '',

            body: Buffer.concat(chunks).toString('utf8'),

          });

        });

      }

    );

    req.on('error', reject);

    req.on('timeout', () => {

      req.destroy();

      reject(new Error('timeout'));

    });

    req.end();

  });

}



async function probeStaticBridgePaths(baseOrigin) {

  const results = [];

  for (const path of STATIC_BRIDGE_PROBE_PATHS) {

    try {

      const res = await httpGetStatic(baseOrigin, path);

      results.push({

        path,

        status: res.status,

        contentType: res.contentType,

        retrievable: res.status === 200 && res.body.length > 0,

        hasMarker: res.body.includes('FORGENIQ_RI_SERVER_PROMPT_ONLY_RI_AI_BRIDGE_5A'),

      });

    } catch (e) {

      results.push({ path, status: 0, contentType: '', retrievable: false, error: e.message });

    }

  }

  return results;

}



async function main() {

  process.env.FORGENIQ_REPO_ROOT = REPO_ROOT;



  console.log(`LOCAL RI ORIGIN:\n${LOCAL_RI_DEV_ORIGIN}`);

  console.log(`LOCAL AI BRIDGE ORIGIN:\n${LOCAL_AI_BRIDGE_ORIGIN}`);

  console.log(`BRIDGE SOURCE LOCATION:\n${BRIDGE_ROOT}`);



  pass('bridge-home-exists', existsSync(BRIDGE_ROOT), BRIDGE_ROOT);

  pass('bridge-not-under-repo', !BRIDGE_ROOT.toLowerCase().startsWith(REPO_ROOT.toLowerCase()), BRIDGE_ROOT);



  const onOneDrive = /onedrive/i.test(BRIDGE_ROOT);

  pass('bridge-not-on-onedrive-path', !onOneDrive, BRIDGE_ROOT);



  const staticBase = process.env.RI_STATIC_PROBE_ORIGIN || LOCAL_RI_DEV_ORIGIN;

  const staticProbes = await probeStaticBridgePaths(staticBase);

  const anyRetrievable = staticProbes.some((p) => p.retrievable);

  const promptRetrievable = staticProbes.some(

    (p) => p.path.includes('server-prompt.js') && p.retrievable

  );

  console.log('STATIC HTTP PROBES:', JSON.stringify(staticProbes, null, 2));

  console.log(`BRIDGE STATICALLY RETRIEVABLE:\n${anyRetrievable ? 'YES' : 'NO'}`);

  console.log(`SERVER PROMPT FILE STATICALLY RETRIEVABLE:\n${promptRetrievable ? 'YES' : 'NO'}`);

  pass('bridge-statically-retrievable-no', !anyRetrievable, JSON.stringify(staticProbes));

  pass('server-prompt-statically-retrievable-no', !promptRetrievable);



  const { validateCacheDir } = await bridgeImport('cache-path-policy.js');

  const { validateRequestOrigin, parseAllowedOrigins } = await bridgeImport('origin-policy.js');

  const { SERVER_PROMPT_ASSET_MARKER } = await bridgeImport('server-prompt.js');

  const { createAiBridgeServer } = await bridgeImport('http-server.js');

  const { loadBridgeConfig } = await bridgeImport('bridge-config.js');



  pass('status-enum-size', Object.keys(AI_ANALYSIS_STATUS).length === 4);



  const failedCodes = [

    'INCOMPLETE',

    'REFUSAL',

    'TIMEOUT',

    'RATE_LIMITED',

    'AUTH_ERROR',

    'PROVIDER_ERROR',

  ];

  pass(

    'error-codes-map-to-failed',

    failedCodes.every((c) => statusForAnalysisErrorCode(c) === AI_ANALYSIS_STATUS.FAILED)

  );

  pass(

    'validation-error-codes',

    statusForAnalysisErrorCode('CONTEXT_HASH_MISMATCH') === AI_ANALYSIS_STATUS.VALIDATION_FAILED &&

      statusForAnalysisErrorCode('UNSUPPORTED_DATE_CLAIM') === AI_ANALYSIS_STATUS.VALIDATION_FAILED

  );

  pass('unsafe-cache-not-status', statusForAnalysisErrorCode('UNSAFE_AI_CACHE_PATH') === null);



  const origins = parseAllowedOrigins('');

  pass('origin-default-localhost-only', origins.length === 1 && origins[0] === LOCAL_RI_DEV_ORIGIN);

  pass('origin-allow-localhost', validateRequestOrigin(LOCAL_RI_DEV_ORIGIN, origins).ok);

  pass('origin-reject-127-origin', !validateRequestOrigin('http://127.0.0.1:3000', origins).ok);

  pass('origin-reject-null', !validateRequestOrigin('null', origins).ok);

  pass('origin-reject-missing', !validateRequestOrigin(undefined, origins).ok);

  pass('origin-reject-remote', !validateRequestOrigin('https://evil.example', origins).ok);



  const unsafeRepo = validateCacheDir(join(REPO_ROOT, 'design-lab', 'regulatory-intelligence', 'cache', 'ai-test'), {

    repoRoot: REPO_ROOT,

    designLabRoot: RI_ROOT,

  });

  pass('cache-reject-repo', !unsafeRepo.ok && unsafeRepo.code === AI_ANALYSIS_ERROR_CODES.UNSAFE_AI_CACHE_PATH);



  const oneDriveSeg = validateCacheDir('C:\\Users\\demo\\OneDrive\\forgeniq-ri\\ai-cache', {

    repoRoot: 'D:\\repo',

    designLabRoot: 'D:\\repo\\design-lab\\regulatory-intelligence',

    platform: 'win32',

  });

  pass('cache-reject-onedrive-segment', !oneDriveSeg.ok);



  const safe = validateCacheDir(join(tmpdir(), 'forgeniq-ri', 'ai-cache'), {

    repoRoot: REPO_ROOT,

    designLabRoot: RI_ROOT,

  });

  pass('cache-allow-temp-example', safe.ok);



  pass('cache-empty-disabled', !loadBridgeConfig({ RI_AI_CACHE_DIR: '', FORGENIQ_REPO_ROOT: REPO_ROOT }).diskCache.enabled);



  const badCfg = loadBridgeConfig({

    RI_AI_CACHE_DIR: join(RI_ROOT, 'cache', 'ai-bridge-test'),

    RI_ALLOWED_ORIGINS: LOCAL_RI_DEV_ORIGIN,

    FORGENIQ_REPO_ROOT: REPO_ROOT,

  });

  pass(

    'unsafe-cache-disabled-not-fake-analysis',

    !badCfg.diskCache.enabled && badCfg.bridgeErrorCode === AI_ANALYSIS_ERROR_CODES.UNSAFE_AI_CACHE_PATH

  );



  const badServer = createAiBridgeServer(badCfg);

  await new Promise((r) => badServer.listen(0, '127.0.0.1', r));

  const analyzeWithBadCache = await request(badServer, {

    method: 'POST',

    path: '/analyze',

    headers: { Origin: LOCAL_RI_DEV_ORIGIN, 'Content-Type': 'application/json' },

    body: '{}',

  });

  pass(

    'analyze-with-unsafe-cache-not-configured',

    analyzeWithBadCache.status === 403 || analyzeWithBadCache.status === 503 || analyzeWithBadCache.status === 400

  );

  badServer.close();



  const cfg = loadBridgeConfig({

    RI_AI_CACHE_DIR: '',

    RI_ALLOWED_ORIGINS: LOCAL_RI_DEV_ORIGIN,

    FORGENIQ_REPO_ROOT: REPO_ROOT,

  });

  const server = createAiBridgeServer(cfg);

  await new Promise((r) => server.listen(0, '127.0.0.1', r));



  const health = await request(server, { method: 'GET', path: '/health' });

  pass('health-no-secrets', health.json.service && !JSON.stringify(health.json).includes('sk-'));



  const noOrigin = await request(server, { method: 'POST', path: '/analyze', body: '{}' });

  pass('analyze-reject-no-origin', noOrigin.status === 403);



  const good = await request(server, {

    method: 'POST',

    path: '/analyze',

    headers: {

      Origin: LOCAL_RI_DEV_ORIGIN,

      'Content-Type': 'application/json',

      Host: `127.0.0.1:${server.address().port}`,

    },

    body: JSON.stringify({ analysisId: 'AIA-TEST-001' }),

  });

  pass('analyze-reject-incomplete-body', good.status === 400 || good.status === 503);

  pass(
    'analyze-not-configured-without-openai',
    good.status === 503 || good.status === 400 || good.json?.bridgeState === 'NOT_CONFIGURED'
  );



  server.close();



  const vercelText = readFileSync(join(REPO_ROOT, 'vercel.json'), 'utf8');

  const vercelExposure = inspectVercelBridgeExposure(vercelText);

  const apiExposure = inspectApiBridgeExposure(join(REPO_ROOT, 'api'));

  const { riRoot } = getRepoRoots(REPO_ROOT);

  const clientBridgeRefs = riClientImportsBridge(riRoot);



  console.log(`BRIDGE IN CLIENT BUNDLE:\n${clientBridgeRefs.length ? 'YES' : 'NO'}`);

  console.log(`BRIDGE EXPOSED AS VERCEL FUNCTION:\n${apiExposure.exposedAsFunction ? 'YES' : 'NO'}`);



  pass('ai-bridge-not-in-vercel-routing', !vercelExposure.exposedAsRoute, vercelExposure.reasons.join(', '));

  pass('ai-bridge-not-vercel-function', !apiExposure.exposedAsFunction, apiExposure.matches.join(', '));

  pass('ai-bridge-not-in-client-bundle', clientBridgeRefs.length === 0, clientBridgeRefs.slice(0, 3).join(', '));



  const publicAssets = collectRiPublicAssetFiles(REPO_ROOT);

  const marker = SERVER_PROMPT_ASSET_MARKER;

  const leaks = publicAssets.filter((f) => readFileSync(f, 'utf8').includes(marker));

  console.log(

    leaks.length

      ? `SERVER PROMPT MARKER FOUND IN PUBLIC ASSETS: YES (${leaks.length})`

      : 'SERVER PROMPT MARKER FOUND IN PUBLIC ASSETS: NO'

  );

  pass('56E-server-prompt-marker-not-in-public-assets', leaks.length === 0, leaks.slice(0, 3).join(', '));

  pass('public-asset-scope-nonempty', publicAssets.length > 10, `count=${publicAssets.length}`);

  const foundation = await runAi5aFoundationAcceptance();
  Object.assign(R, foundation.R);
  await runAi5aExtendedAcceptance(R);

  console.log(JSON.stringify(R, null, 2));

  const failed = Object.entries(R).filter(([, v]) => v.startsWith('FAIL'));

  if (failed.length) {

    console.error('AI 5A acceptance failures:', failed);

    process.exit(1);

  }

  console.log('AI 5A clarifications + foundation acceptance: PASS');

}



main().catch((e) => {

  console.error(e);

  process.exit(1);

});


