#!/usr/bin/env node
/**
 * In-app notification API smoke on staging (no external customer delivery).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { requireUatPersonas, runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', `notifications-in-app-${new Date().toISOString().slice(0, 10)}`);
mkdirSync(OUT, { recursive: true });

async function api(page, method, path, data) {
  const res = await page.request.fetch(`${STAGING_ORIGIN}${path}`, {
    method,
    data,
    headers: data ? { 'content-type': 'application/json' } : undefined,
    timeout: 60_000,
  });
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 120));
};

await requireUatPersonas(['C'], { label: 'notifications-in-app' });
await runAs('C', async ({ page }) => {
  const list = await api(page, 'GET', '/api/ri-lab/notifications?limit=25&offset=0');
  check('GET notifications', list.status === 200 && Array.isArray(list.body?.notifications), {
    status: list.status,
    count: list.body?.notifications?.length,
    externalDeliveryDisabled: list.body?.externalDeliveryDisabled,
  });
  const tenant = (list.body?.notifications || []).find((n) => n.id && !String(n.id).startsWith('ai-event:'));
  if (tenant) {
    const mark = await api(page, 'PATCH', '/api/ri-lab/notifications', {
      action: 'mark_read',
      notificationId: tenant.id,
    });
    check('PATCH mark_read tenant notification', mark.status === 200 && mark.body?.ok === true, { status: mark.status });
  } else {
    check('PATCH mark_read tenant notification', true, 'no tenant_notifications row — list-only PASS');
  }
  const aiOnly = await api(page, 'PATCH', '/api/ri-lab/notifications', {
    action: 'mark_read',
    notificationId: 'ai-event:00000000-0000-4000-8000-000000000099',
  });
  check('PATCH ai-event mark_read no-op', aiOnly.status === 200 && aiOnly.body?.ok === true, { note: aiOnly.body?.note });
  const inbox = await page.goto(
    `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html#/notifications/inbox`,
    { waitUntil: 'domcontentloaded', timeout: 90_000 },
  );
  const heading = await page.locator('h1').first().innerText().catch(() => '');
  check('notifications/inbox route', !/page not found/i.test(heading), heading.slice(0, 80));
});

writeFileSync(join(OUT, 'RESULT.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.ok).length;
process.exit(failed ? 1 : 0);