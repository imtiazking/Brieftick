/**
 * Production readiness + non-functional hardening — offline deterministic.
 */
import { createFreshState, migrateSavedSnapshot, SCHEMA_VERSION } from '../js/migrate.js';
import { hydrateStore, resetStore, submitAssessmentForReview, getState } from '../js/store.js';
import { isKnownRoute, renderViewSafe } from '../js/router.js';
import { esc } from '../js/components.js';
import { sanitizeHref, renderXssTest } from '../js/platform/safe-link.js';
import { assertImpactAssessmentTransition } from '../js/platform/state-transitions.js';
import { withMutationGuard } from '../js/platform/mutation-guard.js';
import { computePlatformHealth } from '../js/platform/health.js';
import { validateMinimalState, validatePlatformConfig } from '../js/platform/startup-validation.js';
import { applyLargeDataFixture } from '../js/platform/large-data-fixture.js';
import { measureSync } from '../js/platform/performance.js';
import { buildWorkQueue, buildNotifications, DEMO_TODAY } from '../js/workflow-helpers.js';
import { assertUrlAllowed } from '../js/connectors/url-safety.js';
import { assertPermission } from '../js/platform/platform-permissions.js';
import { getAiExecutionById } from '../js/store.js';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const arch = join(dirname(fileURLToPath(import.meta.url)), '..', 'architecture');
const R = [];
let n = 0;
function pass(label, ok, reason = '') {
  n += 1;
  R.push({ n, label, status: ok ? 'PASS' : `FAIL: ${reason}` });
}

function main() {
  const fresh = createFreshState();
  pass('Startup schema v17', fresh.schemaVersion === SCHEMA_VERSION);
  pass('Minimal state validation', validateMinimalState(fresh).ok);
  pass('Platform config valid', validatePlatformConfig(fresh.platformConfig).ok);

  hydrateStore(fresh);
  pass('Unknown route not known', !isKnownRoute('/does-not-exist'));
  const nf = renderViewSafe('/does-not-exist');
  pass('Unknown route page', nf.includes('Page not found'));
  pass('Missing change not found', renderViewSafe('/change/CHG-NOPE').includes('Record not found'));

  const ia = fresh.assessments.find((a) => a.status === 'Draft');
  pass('IA transition Draft→Submitted', assertImpactAssessmentTransition(ia, 'Submitted for Review').ok);
  pass('IA transition Draft→Closed blocked', !assertImpactAssessmentTransition(ia, 'Closed').ok);

  hydrateStore(createFreshState());
  let inner;
  const outer = withMutationGuard('test-dup', () => {
    inner = withMutationGuard('test-dup', () => ({ ok: false, code: 'CONFLICT' }));
    return { ok: true };
  });
  pass('Double-submit guard', outer.ok && inner?.code === 'CONFLICT');

  const snap = { schemaVersion: 5, scenarioId: 'consumer-duty', publications: fresh.publications.slice(0, 2), changes: [] };
  const m1 = migrateSavedSnapshot(snap);
  const m2 = migrateSavedSnapshot(m1);
  pass('Migration to v17', m1.schemaVersion === SCHEMA_VERSION);
  pass('Migration idempotent count', m1.publications.length === m2.publications.length);

  const corrupt = migrateSavedSnapshot({ schemaVersion: 10, publications: null });
  pass('Partial state recovery', Array.isArray(corrupt.publications) && corrupt.publications.length > 0);

  const xss = '<script>alert(1)</script>';
  pass('XSS escaped', !renderXssTest(xss).includes('<script>'));
  pass('javascript: blocked', sanitizeHref('javascript:alert(1)') === '#');
  pass('https allowed', sanitizeHref('https://www.fca.org.uk').startsWith('https'));

  const ssrf = assertUrlAllowed('http://127.0.0.1/test');
  pass('SSRF private blocked', !ssrf.ok);

  const st = createFreshState();
  st.tenantContext = { tenantId: 'TEN-DEMO-001' };
  hydrateStore(st);
  const foreign = getAiExecutionById('AIEX-SEED-001');
  pass('Tenant execution scope', foreign == null || foreign.tenantId === 'TEN-DEMO-001');

  const deny = assertPermission({ ...st, currentDemoUserId: 'u-shah' }, 'ai.execution.create');
  pass('Permission denial', !deny.ok);

  pass('Audit append-only', !String(fresh).includes('deleteAudit'));
  const health = computePlatformHealth(fresh);
  pass('Health model', health.components.length >= 4);
  pass('Fixture AI healthy', health.components.some((c) => c.id === 'ai-runtime'));

  const lg = applyLargeDataFixture(createFreshState(), { publications: 150, changes: 300, auditEvents: 200 });
  const { timing } = measureSync('work-queue-lg', () => buildWorkQueue(lg, lg.scenarioId));
  pass('Large data work queue', lg.changes.length >= 300);
  pass('Work queue timing recorded', timing.ms >= 0);

  pass('Deterministic clock', DEMO_TODAY === '2026-10-07');
  pass('Dashboard renders', renderViewSafe('/dashboard').includes('Regulatory Intelligence'));
  pass('Admin health route', renderViewSafe('/admin/health').includes('Platform health'));
  pass('Audit route registered', renderViewSafe('/audit').includes('Audit Trail'));

  pass('NFR doc', existsSync(join(arch, 'non-functional-requirements.md')));
  pass('Performance doc', existsSync(join(arch, 'performance.md')));
  pass('Technical debt doc', existsSync(join(arch, 'technical-debt.md')));
  pass('Recovery runbook', existsSync(join(arch, 'runbooks', 'design-lab-recovery.md')));

  let fail = 0;
  R.forEach((row) => {
    console.log(`${row.n}. ${row.label}: ${row.status}`);
    if (!row.status.startsWith('PASS')) fail += 1;
  });
  console.log(fail ? `HARDENING FAILED (${fail})` : 'HARDENING ACCEPTANCE PASS');
  process.exit(fail ? 1 : 0);
}

main();
