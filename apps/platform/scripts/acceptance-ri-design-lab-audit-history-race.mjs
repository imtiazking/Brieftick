#!/usr/bin/env node
/**
 * Regression: the audit history of a Finding / Evidence item / Assurance review must survive its detail request.
 *
 * Found by the hosted real-browser UAT: the Assurance page of a CLOSED review showed "No workflow events" although eight
 * events existed. Cause: the events request (fast) cached the history, then the detail request (slower) deleted the cached
 * events and their "loaded" flag, and nothing refetched them. This suite reproduces the load order deterministically
 * with a mocked fetch and asserts the history is still present after both requests settle, in both completion orders.
 *
 * Also covers the explicit refresh used after writes, so the fix cannot trade one staleness bug for another.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const lab = join(root, 'design-lab', 'regulatory-intelligence', 'js', 'platform');

const {
  fetchConnectedAssuranceDetail,
  fetchConnectedFindingDetail,
  fetchConnectedEvidenceDetail,
} = await import(`file:///${join(lab, 'connected-catalogue.js').replace(/\\/g, '/')}`);
const { scheduleConnectedEntityWorkflowEventsFetch, refreshConnectedEntityWorkflowEvents, getConnectedEntityWorkflowEvents } = await import(
  `file:///${join(lab, 'connected-entity-audit.js').replace(/\\/g, '/')}`
);

const { getState } = await import(`file:///${join(root, 'design-lab', 'regulatory-intelligence', 'js', 'store.js').replace(/\\/g, '/')}`);
const freshState = () => {
  const s = getState();
  s.platformConfig = { apiBaseUrl: '/api/ri-lab' };
  delete s.connectedCatalogue;
  return s;
};

let pass = 0;
let fail = 0;
const check = (name, ok, detail) => {
  if (ok) pass += 1;
  else {
    fail += 1;
    console.error(`FAIL: ${name}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
};

const ID = '2ff59648-22c2-49c1-b782-b2885d06081c';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let EXTRA = [];
const EVENTS = Array.from({ length: 3 }, (_, i) => ({ id: `e${i}`, eventType: `EVT_${i}` }));

function mockFetch({ eventsMs, detailMs }) {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/workflow-events')) {
      await sleep(eventsMs);
      return { ok: true, status: 200, json: async () => ({ ok: true, events: [...EVENTS, ...EXTRA] }) };
    }
    await sleep(detailMs);
    if (u.includes('/assurance-reviews/')) return { ok: true, status: 200, json: async () => ({ ok: true, assuranceReview: { id: ID, assuranceStatus: 'CLOSED' }, detail: { metadata: { assuranceStatus: 'CLOSED' } } }) };
    if (u.includes('/findings/')) return { ok: true, status: 200, json: async () => ({ ok: true, finding: { id: ID, title: 'f' }, detail: { metadata: {} } }) };
    if (u.includes('/evidence/')) return { ok: true, status: 200, json: async () => ({ ok: true, evidence: { id: ID, title: 'e' } }) };
    return { ok: false, status: 404, json: async () => ({ ok: false }) };
  };
}

const kinds = [
  { name: 'assurance_review', type: 'assurance_review', detail: fetchConnectedAssuranceDetail },
  { name: 'finding', type: 'finding', detail: fetchConnectedFindingDetail },
  { name: 'evidence', type: 'evidence_item', detail: fetchConnectedEvidenceDetail },
];

for (const k of kinds) {
  for (const [label, eventsMs, detailMs] of [['events finish first (the hosted failure order)', 5, 40], ['detail finishes first', 40, 5]]) {
    mockFetch({ eventsMs, detailMs });
    const state = freshState();
    await Promise.all([scheduleConnectedEntityWorkflowEventsFetch(state, k.type, ID), k.detail(state, ID)]);
    const events = getConnectedEntityWorkflowEvents(state, k.type, ID);
    const cat = state.connectedCatalogue;
    check(`${k.name}: audit history survives its detail request — ${label}`, events.length === 3, events.length);
    check(`${k.name}: load state stays "loaded" — ${label}`, cat.entityWorkflowEventsLoadStateByKey?.[`${k.type}:${ID}`] === 'loaded', cat.entityWorkflowEventsLoadStateByKey);
  }

  // The explicit post-write refresh still replaces stale history with fresh history.
  mockFetch({ eventsMs: 1, detailMs: 1 });
  const state = freshState();
  await scheduleConnectedEntityWorkflowEventsFetch(state, k.type, ID);
  EXTRA = [{ id: `new-${k.name}`, eventType: 'NEW' }];
  await refreshConnectedEntityWorkflowEvents(state, k.type, ID);
  const refreshed = getConnectedEntityWorkflowEvents(state, k.type, ID);
  EXTRA = [];
  check(`${k.name}: post-write refresh picks up the new event`, refreshed.some((e) => e.id === `new-${k.name}`), refreshed);
}

// Static guard: no detail fetcher may clear the audit cache again.
const src = readFileSync(join(lab, 'connected-catalogue.js'), 'utf8');
for (const fn of ['fetchConnectedAssuranceDetail', 'fetchConnectedFindingDetail', 'fetchConnectedEvidenceDetail']) {
  const start = src.indexOf(`export async function ${fn}`);
  const body = src.slice(start, src.indexOf('\nexport ', start + 10));
  check(`${fn} does not delete cached workflow events`, !/delete cat\.entityWorkflowEvents/.test(body));
}

console.log(`Design Lab audit-history race: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
