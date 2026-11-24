#!/usr/bin/env node
/**
 * Design Lab triage screens use the tenant triage API and do not invent counts.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateFindingTriage, TRIAGE_QUEUES } from '../lib/ri/classification/regulatory-classification-policy.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const lab = join(root, 'design-lab', 'regulatory-intelligence', 'js');
const failures = [];
const check = (name, ok) => {
  if (!ok) failures.push(name);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

const app = readFileSync(join(lab, 'app.js'), 'utf8');
const views = readFileSync(join(lab, 'views.js'), 'utf8');
const router = readFileSync(join(lab, 'router.js'), 'utf8');
const triage = readFileSync(join(lab, 'platform', 'connected-triage.js'), 'utf8');
const catalogue = readFileSync(join(lab, 'platform', 'connected-catalogue.js'), 'utf8');
const store = readFileSync(join(lab, 'store.js'), 'utf8');
const route = readFileSync(join(root, 'apps', 'platform', 'app', 'api', 'ri-lab', 'triage', 'route.ts'), 'utf8');
const service = readFileSync(join(root, 'apps', 'platform', 'lib', 'ri', 'services', 'triage-queues.ts'), 'utf8');

check('router knows triage', router.includes("'triage'"));
check('views render triage screens', views.includes("case 'triage'") && views.includes('renderTriageScreen'));
check('dashboard mounts live triage board', views.includes('renderTriageBoard()'));
check(
  'dashboard avoids zero headline before catalogue ready',
  store.includes('catalogueLoading') && views.includes('Loading staging catalogue') && store.includes('publicationTotal'),
);
check('catalogue loader stores summary total', catalogue.includes('catalogue/summary') && catalogue.includes('publicationTotal'));
check('navigation exposes three queues', ['triage/obligations', 'triage/non-obligations', 'triage/exceptions'].every((p) => app.includes(p)));
check('cards do not hardcode a count', !/data-triage-count="[^"]+">\d+/.test(triage));
check('triage read is tenant scoped', route.includes("requireRiContext('ai:read')") && service.includes('organisation_id'));
check('triage does not approve obligations', service.includes('legallyVerified: false') && !route.includes('submitFindingReview'));
check('non-obligation copy refuses approved obligations', triage.includes('cannot become approved obligations'));

const policy = {
  nonBindingPublicationTypes: [],
  entries: [
    { code: 'R', legalStatus: 'binding', conversionEnabled: true, destinationQueue: 'OBLIGATION_TRIAGE' },
    { code: 'G', legalStatus: 'non_binding', conversionEnabled: false, destinationQueue: 'NON_OBLIGATION_TRIAGE' },
  ],
};
const binding = evaluateFindingTriage({
  policy,
  finding: { citationStatus: 'VERIFIED', modelLabels: ['binding_requirement'] },
});
const guidance = evaluateFindingTriage({
  policy,
  finding: { citationStatus: 'VERIFIED', modelLabels: ['guidance'] },
});
const ambiguous = evaluateFindingTriage({
  policy,
  finding: { citationStatus: 'UNVERIFIED', modelLabels: ['binding_requirement'] },
});
check('verified binding label routes to obligation triage', binding.queue === TRIAGE_QUEUES.OBLIGATION && binding.conversionEligible === false);
check('guidance routes to non-obligation triage and cannot convert', guidance.queue === TRIAGE_QUEUES.NON_OBLIGATION && guidance.conversionEligible === false);
check('unverified binding label stays in exception triage', ambiguous.queue === TRIAGE_QUEUES.EXCEPTION && ambiguous.conversionEligible === false);

if (failures.length) {
  console.error(`acceptance-ri-triage-screens: FAIL (${failures.length})`);
  process.exit(1);
}
console.log('acceptance-ri-triage-screens: PASS');
