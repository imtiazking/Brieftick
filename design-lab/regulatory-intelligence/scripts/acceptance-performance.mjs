import { createFreshState } from '../js/migrate.js';
import { applyLargeDataFixture } from '../js/platform/large-data-fixture.js';
import { measureSync } from '../js/platform/performance.js';
import { buildWorkQueue, buildNotifications } from '../js/workflow-helpers.js';
import { renderViewSafe } from '../js/router.js';
import { hydrateStore } from '../js/store.js';

const state = applyLargeDataFixture(createFreshState(), {
  publications: 200,
  changes: 400,
  auditEvents: 400,
});
hydrateStore(state);

const results = [];
function bench(name, fn) {
  const { timing } = measureSync(name, fn);
  results.push({ name, ms: timing.ms });
  console.log(`${name}: ${timing.ms}ms`);
}

bench('dashboard-render', () => renderViewSafe('/dashboard'));
bench('changes-register', () => renderViewSafe('/changes'));
bench('work-queue-build', () => buildWorkQueue(state, state.scenarioId));
bench('attention-centre-build', () => buildNotifications(state, state.scenarioId));
bench('audit-view', () => renderViewSafe('/reports'));

const slow = results.filter((r) => r.ms > 3000);
if (slow.length) {
  console.warn('PERFORMANCE WARNING (Design Lab):', slow.map((s) => s.name).join(', '));
}
console.log('PERFORMANCE ACCEPTANCE PASS (timings recorded, no hard SLA)');
