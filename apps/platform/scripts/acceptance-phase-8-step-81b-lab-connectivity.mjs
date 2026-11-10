#!/usr/bin/env node
/**
 * Step 81B — Design Lab API adapter + /api/ri-lab security foundation.
 */
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createApiPlatformAdapter } from '../../../design-lab/regulatory-intelligence/js/adapters/api-platform-adapter.js';
import { assertPermission } from '../../../design-lab/regulatory-intelligence/js/platform/platform-permissions.js';
import { createFreshState } from '../../../design-lab/regulatory-intelligence/js/migrate.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

let apiInactive = true;
try {
  createApiPlatformAdapter().getConfig();
  apiInactive = false;
} catch {
  apiInactive = true;
}
if (apiInactive) pass('API adapter requires bootstrap before getConfig');
else failMsg('unbootstrapped adapter should throw');

const sanitizeSrc = readFileSync(join(platformRoot, 'lib', 'ri', 'lab-api', 'sanitize.ts'), 'utf8');
if (sanitizeSrc.includes('FORBIDDEN_KEY_RE') && sanitizeSrc.includes('normalised_html_storage')) {
  pass('sanitize module strips storage paths');
} else failMsg('sanitize module');

const sessionSrc = readFileSync(join(platformRoot, 'lib', 'ri', 'lab-api', 'session-payload.ts'), 'utf8');
if (sessionSrc.includes('resolveLabChangeWritesEnabled')) {
  pass('session payload gated writes flag');
} else failMsg('session payload writes gate');

const connectedState = createFreshState();
connectedState.platformConfig.adapterMode = 'api';
connectedState.platformConfig.featureFlags = { ...(connectedState.platformConfig.featureFlags || {}), apiAdapter: true };
const denied = assertPermission(connectedState, 'change.update');
if (!denied.ok && denied.code === 'FORBIDDEN') pass('mock permissions blocked in connected mode');
else failMsg('connected assertPermission');

const apiRoute = join(platformRoot, 'app', 'api', 'ri-lab', 'session', 'route.ts');
const staticRoute = join(
  platformRoot,
  'app',
  'design-lab',
  'regulatory-intelligence',
  '[[...path]]',
  'route.ts',
);
if (readFileSync(apiRoute, 'utf8').includes('requireRiContext')) pass('session route uses requireRiContext');
else failMsg('session route auth');

const baseRoute = join(platformRoot, 'app', 'design-lab', 'regulatory-intelligence', 'route.ts');
if (
  existsSync(staticRoute) &&
  existsSync(baseRoute) &&
  readFileSync(staticRoute, 'utf8').includes('serveDesignLabSegments')
) {
  pass('design lab static route present');
} else failMsg('static route');

const nextConfig = readFileSync(join(platformRoot, 'next.config.ts'), 'utf8');
if (nextConfig.includes('/design-lab/regulatory-intelligence')) {
  pass('design lab hosted URL configured');
} else failMsg('design lab hosted URL configured');

const mw = readFileSync(join(platformRoot, 'middleware.ts'), 'utf8');
if (mw.includes('/design-lab/regulatory-intelligence')) pass('design lab middleware public matcher');
else failMsg('design lab middleware');

const adapterSrc = readFileSync(
  join(platformRoot, '..', '..', 'design-lab', 'regulatory-intelligence', 'js', 'adapters', 'api-platform-adapter.js'),
  'utf8',
);
if (adapterSrc.includes('credentials: \'same-origin\'') && !adapterSrc.includes('service_role')) {
  pass('adapter uses same-origin fetch without service role');
} else failMsg('adapter security');

const adapterStubMarker = 'Future production API adapter contract (non-functional in Design Lab)';
if (adapterSrc.includes('async bootstrap()') && !adapterSrc.includes(adapterStubMarker)) {
  pass('design-lab api adapter implements connected bootstrap');
} else failMsg('design-lab api adapter is stub or missing bootstrap');

const adapter = createApiPlatformAdapter({ apiBaseUrl: '/api/ri-lab' });
if (typeof adapter.bootstrap === 'function' && typeof adapter.probe === 'function') {
  pass('createApiPlatformAdapter exposes bootstrap and probe');
} else failMsg('createApiPlatformAdapter missing bootstrap/probe methods');

if (!fail) console.log('\nacceptance-phase-8-step-81b-lab-connectivity: PASS\n');
else {
  console.error(`\nacceptance-phase-8-step-81b-lab-connectivity: FAIL (${fail})\n`);
  process.exit(1);
}
