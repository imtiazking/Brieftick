#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TRIAGE_PAGE_SIZES,
  compareTriageRows,
  itemMatchesSearch,
  itemMatchesVerificationFilter,
  paginateTriageItems,
} from '../lib/ri/triage/triage-list-pagination.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const failures = [];
const check = (name, ok) => {
  if (!ok) failures.push(name);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

const route = readFileSync(join(root, 'apps', 'platform', 'app', 'api', 'ri-lab', 'triage', 'route.ts'), 'utf8');
const service = readFileSync(join(root, 'apps', 'platform', 'lib', 'ri', 'services', 'triage-queues.ts'), 'utf8');
const triage = readFileSync(
  join(root, 'design-lab', 'regulatory-intelligence', 'js', 'platform', 'connected-triage.js'),
  'utf8',
);

check('route accepts page and pageSize', route.includes('pageSize') && route.includes('normaliseTriagePageSize'));
check('service paginates after queue filter', service.includes('paginateTriageItems') && !service.includes('MAX_ITEMS = 150'));
check('pagination metadata exposed', service.includes('pagination:') && service.includes('filteredTotal'));
check('stable sort keys on rows', service.includes('runCreatedAt') && service.includes('claimIndex'));
check(
  'UI has prev/next and page size',
  triage.includes('data-triage-prev') && triage.includes('data-triage-page-size-select'),
);
check('server-side filter reload', triage.includes('loadConnectedTriageScreen') && triage.includes('verificationFilter'));

const sample = Array.from({ length: 30 }, (_, i) => ({
  findingId: `f${String(i).padStart(2, '0')}`,
  runCreatedAt: new Date(2026, 0, 30 - Math.floor(i / 5)).toISOString(),
  claimIndex: i % 5,
  humanVerification: i % 3 === 0 ? 'VERIFIED' : 'UNVERIFIED',
  hasPersistedDecision: i % 3 === 0,
  countsAsGenuineHumanVerification: i % 6 === 0,
  countsAsUatOrTest: i % 9 === 0,
  approvalStatus: 'NONE',
  regulator: `REG${i}`,
}));

const pages = paginateTriageItems(sample, { page: 1, pageSize: 25 });
const pages2 = paginateTriageItems(sample, { page: 2, pageSize: 25 });
check('page 1 length', pages.items.length === 25);
check('page 2 length', pages2.items.length === 5);
const ids = new Set([...pages.items, ...pages2.items].map((x) => x.findingId));
check('no duplicate across pages', ids.size === 30);
check('allowed page sizes', TRIAGE_PAGE_SIZES.join() === '25,50,100');

const sorted = [...sample].sort(compareTriageRows);
check('stable sort is deterministic', sorted[0].findingId === [...sample].sort(compareTriageRows)[0].findingId);
check('search filter', itemMatchesSearch({ regulator: 'FCA Handbook' }, 'handbook') === true);
check('verification filter', itemMatchesVerificationFilter({ humanVerification: 'REJECTED' }, 'REJECTED') === true);

if (failures.length) {
  console.error(`acceptance-ri-triage-pagination: FAIL (${failures.length})`);
  process.exit(1);
}
console.log('acceptance-ri-triage-pagination: PASS');