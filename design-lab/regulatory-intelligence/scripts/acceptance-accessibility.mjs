import { createFreshState } from '../js/migrate.js';
import { hydrateStore } from '../js/store.js';
import { renderViewSafe } from '../js/router.js';
import { badge } from '../js/components.js';

const routes = [
  '/dashboard',
  '/work',
  '/notifications',
  '/governance',
  '/ai-governance',
  '/assurance',
  '/ingestion',
  '/reports',
  '/change/CHG-001',
];

hydrateStore(createFreshState());
let fail = 0;
routes.forEach((route, i) => {
  const html = renderViewSafe(route);
  const hasHeading = /<h1/i.test(html);
  const badgesHaveText = !html.includes('ri-badge"></span>');
  const ok = hasHeading && badgesHaveText && !html.includes('undefined') && !html.includes('NaN');
  console.log(`${i + 1}. ${route}: ${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) fail += 1;
});
const statusChip = badge('On Track');
const statusA11yOk =
  statusChip.includes('title=') &&
  statusChip.includes('ri-badge') &&
  !/<span class="ri-badge[^"]*"><\/span>/.test(statusChip);
console.log(`status not colour-only (badge title): ${statusA11yOk ? 'PASS' : 'FAIL'}`);
if (!statusA11yOk) fail += 1;
const dash = renderViewSafe('/dashboard');
const dashBadges = dash.match(/<span[^>]*ri-badge[^>]*>/g) || [];
const dashBadgeOk = dashBadges.every((b) => b.includes('title=') || b.includes('aria-label='));
console.log(`dashboard badge attributes: ${dashBadgeOk ? 'PASS' : 'FAIL'}`);
if (!dashBadgeOk) fail += 1;
process.exit(fail ? 1 : 0);
