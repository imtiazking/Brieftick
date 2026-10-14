import { createFreshState } from '../js/migrate.js';
import { hydrateStore } from '../js/store.js';
import { renderViewSafe } from '../js/router.js';

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
const dash = renderViewSafe('/dashboard');
console.log(`status not colour-only (badge title): ${dash.includes('title=') ? 'PASS' : 'FAIL'}`);
if (!dash.includes('title=')) fail += 1;
process.exit(fail ? 1 : 0);
