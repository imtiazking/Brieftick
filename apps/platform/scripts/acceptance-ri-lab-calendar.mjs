#!/usr/bin/env node
/**
 * Phase 10 — connected regulatory calendar (GET /api/ri-lab/calendar + Design Lab connected view).
 *
 * Proves: window parsing fails closed; the provenance scope is applied exactly as for every other register
 * (operational hides UAT / synthetic / unverified rows, scope=all shows them labelled); out-of-window and undated records are
 * excluded; real titles replace record-id placeholders; events are sorted; the client renderer escapes every dynamic value,
 * links to existing routes, reports empty/error states honestly; and the route is wired to tenant (RLS) listers behind ri:read.
 * Deterministic. No network, no provider call, no paid AI.
 */
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = `
export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2);
    const root = ${JSON.stringify(pathToFileURL(platformRoot + '/').href)};
    return next(root + (/\\.(m?js|ts|json)$/.test(rel) ? rel : rel + '.ts'), context);
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);

const { buildLabCalendar, parseCalendarWindow } = await import('../lib/ri/lab-api/lab-calendar.ts');
const labRoot = join(platformRoot, '..', '..', 'design-lab', 'regulatory-intelligence', 'js');
const toUrl = (p) => `file:///${p.replace(/\\/g, '/')}`;
const { getState } = await import(toUrl(join(labRoot, 'store.js')));
const cal = await import(toUrl(join(labRoot, 'platform', 'connected-calendar.js')));

let pass = 0;
let fail = 0;
const check = (id, ok, detail) => {
  if (ok) pass += 1;
  else {
    fail += 1;
    console.error(`FAIL: ${id}${detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  }
};

// ------------------------------------------------------------------------------------------------ window parsing
check('window: 30/90/180/365 accepted', [30, 90, 180, 365].every((w) => parseCalendarWindow(String(w)) === w));
check('window: unsupported values fall back to 90 (never widen)', ['7', '9999', '-1', 'abc', '', null, undefined].every((w) => parseCalendarWindow(w) === 90));

// ------------------------------------------------------------------------------------------------ builder
const ORG = 'b8f5e3a1-00ad-4000-8000-000000000001';
const OP = { labProvenanceLocked: true, labCreationMode: 'operational' };
const UAT = { labProvenanceLocked: true, labCreationMode: 'uat_authorised' };
const SYN = { recordProvenance: 'synthetic_uat' };
const FROM = '2026-11-26';

const input = {
  publications: [
    { id: 'p1', title: 'FCA CP26/9 Consumer Duty review', effective_date: '2026-12-15', consultation_deadline: '2026-12-01', publication_date: '2026-01-01' },
    { id: 'p-far', title: 'Far future', effective_date: '2030-01-01' },
  ],
  obligations: [
    { id: 'o-op', obligation_statement: 'Firms must report incidents within 24 hours', status: 'OPEN', effective_date: '2026-12-20', metadata: OP },
    { id: 'o-uat', obligation_statement: 'UAT obligation', status: 'OPEN', due_date: '2026-12-21', metadata: UAT },
    { id: 'o-syn', obligation_statement: 'Synthetic', status: 'OPEN', due_date: '2026-12-22', metadata: SYN },
    { id: 'o-none', obligation_statement: 'No provenance', status: 'OPEN', due_date: '2026-12-23', metadata: {} },
    { id: 'o-late', obligation_statement: 'Outside window', status: 'OPEN', due_date: '2027-12-23', metadata: OP },
    { id: 'o-undated', obligation_statement: 'No date', status: 'OPEN', metadata: OP },
  ],
  impacts: [{ id: 'i-op', status: 'IN_REVIEW', due_date: '2026-12-05', metadata: OP }],
  actions: [
    { id: 'a-op', title: 'Update incident runbook', status: 'OPEN', due_date: '2026-12-02', metadata: OP },
    { id: 'a-uat', title: 'UAT action', status: 'OPEN', due_date: '2026-12-03', metadata: UAT },
  ],
};

const run = (scope, extra = {}) => buildLabCalendar({ ...input, ...extra }, { organisationId: ORG, scope, from: FROM, window: 90 });
const operational = run('operational');
const all = run('all');
const idsOf = (r) => r.events.map((e) => e.recordId);

check('operational: shows operational obligation, impact, action', ['o-op', 'i-op', 'a-op'].every((id) => idsOf(operational).includes(id)), idsOf(operational));
check('operational: hides UAT / synthetic / unverified tenant rows', ['o-uat', 'o-syn', 'o-none', 'a-uat'].every((id) => !idsOf(operational).includes(id)), idsOf(operational));
check('all: includes UAT / synthetic / unverified rows too', ['o-uat', 'o-syn', 'o-none', 'a-uat', 'o-op'].every((id) => idsOf(all).includes(id)), idsOf(all));
check('all: UAT rows are labelled uat_authorised', all.events.find((e) => e.recordId === 'o-uat')?.dataProvenance === 'uat_authorised' && all.events.find((e) => e.recordId === 'a-uat')?.dataProvenance === 'uat_authorised');
check('operational rows are labelled operational', operational.events.find((e) => e.recordId === 'o-op')?.dataProvenance === 'operational');
check('catalogue publications are labelled catalogue', operational.events.find((e) => e.recordType === 'Publication')?.dataProvenance === 'catalogue');
check('scope=all never adds a row the input did not contain', idsOf(all).every((id) => [...input.obligations, ...input.impacts, ...input.actions, ...input.publications].some((r) => r.id === id)));
check('out-of-window obligation excluded', !idsOf(all).includes('o-late'));
check('undated obligation excluded', !idsOf(all).includes('o-undated'));
check('publication outside window excluded', !idsOf(all).includes('p-far'));
check('publication in the past excluded', !operational.events.some((e) => e.id === 'CAL-PUB-p1'));
check('publication effective + consultation both present', ['CAL-P-p1', 'CAL-C-p1'].every((id) => operational.events.some((e) => e.id === id)));
check('window bounds recorded', operational.from === FROM && operational.window === 90 && operational.to > FROM, [operational.from, operational.to]);

const titleOf = (id) => operational.events.find((e) => e.recordId === id)?.title ?? '';
check('title: obligation uses statement, not record id', titleOf('o-op').includes('report incidents within 24 hours') && !titleOf('o-op').includes('o-op'), titleOf('o-op'));
check('title: action uses its title', titleOf('a-op') === 'Update incident runbook', titleOf('a-op'));
check('title: publication includes its real title', operational.events.find((e) => e.id === 'CAL-P-p1')?.title.includes('Consumer Duty review'));
check('title: impact shows status', titleOf('i-op').includes('IN_REVIEW'));
check('status propagated to tenant events; catalogue events carry none', operational.events.find((e) => e.recordId === 'a-op')?.status === 'OPEN' && operational.events.find((e) => e.recordId === 'p1')?.status === null);
check('events sorted by date then id', operational.events.every((e, i, a) => i === 0 || a[i - 1].date < e.date || (a[i - 1].date === e.date && a[i - 1].id <= e.id)));
check('provenance counts report hidden UAT', operational.provenance.uatAuthorised >= 2, operational.provenance);

const longStatement = 'x'.repeat(400);
const long = run('operational', { obligations: [{ id: 'o-long', obligation_statement: longStatement, status: 'OPEN', due_date: '2026-12-10', metadata: OP }] });
check('title: very long statement truncated', long.events.find((e) => e.recordId === 'o-long').title.length < 140);

const empty = buildLabCalendar({ publications: [], obligations: [], impacts: [], actions: [] }, { organisationId: ORG, scope: 'operational', from: FROM, window: 30 });
check('empty tenant: zero events, no fabricated entries', empty.events.length === 0);

// ------------------------------------------------------------------------------------------------ client module
check('client: href maps record types to existing routes',
  cal.calendarEventHref({ recordType: 'Obligation', recordId: 'a b' }) === '#/obligation/a%20b'
  && cal.calendarEventHref({ recordType: 'Impact Assessment', recordId: 'x' }) === '#/assessment/x'
  && cal.calendarEventHref({ recordType: 'Publication', recordId: 'x' }) === '#/publication/x'
  && cal.calendarEventHref({ recordType: 'Action', recordId: 'x' }) === '#/action/x'
  && cal.calendarEventHref({ recordType: 'Mystery', recordId: 'x' }) === '#/calendar');
check('client: window normalisation fails closed', cal.normaliseCalendarWindow('180') === 180 && cal.normaliseCalendarWindow('1') === 90 && cal.normaliseCalendarWindow(undefined) === 90);

const hostile = cal.renderConnectedCalendarEvents([
  { id: 'e', date: '2026-12-01', kind: '"><img src=x onerror=alert(1)>', title: '<script>alert(1)</script>', recordType: 'Action', recordId: '"><b>', status: '<i>s</i>', dataProvenance: 'operational' },
]);
check('client: no raw markup from titles, kinds, ids or statuses', !/<script|<img|<b>|<i>/.test(hostile) && hostile.includes('&lt;script&gt;'), hostile);
check('client: UAT events carry a visible label', cal.renderConnectedCalendarEvents([{ id: 'e', date: '2026-12-01', kind: 'action', title: 't', recordType: 'Action', recordId: 'x', dataProvenance: 'uat_authorised' }]).includes('Authorised UAT'));
check('client: empty list renders nothing', cal.renderConnectedCalendarEvents([]) === '' && cal.renderConnectedCalendarEvents(undefined) === '');
check('client: empty summary is honest', /No dated regulatory events/.test(cal.summariseCalendar({ total: 0, from: '2026-11-26', to: '2027-02-24', events: [] })));
check('client: summary reports hidden UAT items', /2 authorised-UAT/.test(cal.summariseCalendar({ total: 1, from: '2026-11-26', to: '2027-02-24', calendarProvenance: { uatAuthorised: 2 } })));

const shell = cal.renderConnectedCalendarShell();
check('client: shell has window selector, status and list hooks', ['data-connected-calendar-window-select', 'data-connected-calendar-status', 'data-connected-calendar-list'].every((h) => shell.includes(h)));

const s = getState();
s.platformConfig = { apiBaseUrl: '/api/ri-lab' };
let requested = '';
globalThis.fetch = async (u) => {
  requested = String(u);
  return { ok: true, status: 200, json: async () => ({ ok: true, events: [], total: 0 }) };
};
await cal.fetchConnectedCalendar(s, 30);
check('client: requests tenant API with operational scope and normalised window', requested === '/api/ri-lab/calendar?window=30&dataScope=operational', requested);
globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({ ok: false, error: 'forbidden' }) });
let err = '';
try { await cal.fetchConnectedCalendar(s, 90); } catch (e) { err = e.message; }
check('client: API refusal surfaces as an error, never an empty calendar', err === 'forbidden', err);

// ------------------------------------------------------------------------------------------------ wiring
const read = (...p) => readFileSync(join(...p), 'utf8');
const route = read(platformRoot, 'app', 'api', 'ri-lab', 'calendar', 'route.ts');
check('route: requires ri:read', /requireRiContext\('ri:read'\)/.test(route));
check('route: uses RLS-scoped tenant listers, not a privileged client', /listObligations\(ctx\.supabase/.test(route) && /listImpactAssessments\(ctx\.supabase/.test(route) && /listRiActions\(ctx\.supabase/.test(route) && !/service[_-]?role|admin/i.test(route));
check('route: applies the lab data scope and window parsers', /parseLabDataScope\(url\)/.test(route) && /parseCalendarWindow/.test(route));
check('route: dynamic (never cached across users)', /dynamic = 'force-dynamic'/.test(route));
const views = read(labRoot, 'views.js');
const app = read(labRoot, 'app.js');
check('views: connected calendar renders the shell, not the Unavailable placeholder', /renderConnectedCalendarShell\(\)/.test(views) && !/Tenant regulatory calendar events are not available/.test(views));
check('app: calendar hydrate is wired', /hydrateConnectedCalendar\(document\)/.test(app));
const bundle = join(platformRoot, 'design-lab-bundle', 'regulatory-intelligence', 'js', 'platform', 'connected-calendar.js');
let bundled = '';
try { bundled = read(bundle); } catch { /* reported below */ }
check('bundle: synced copy of connected-calendar.js is identical to source', bundled === read(labRoot, 'platform', 'connected-calendar.js'));

console.log(`acceptance-ri-lab-calendar: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
