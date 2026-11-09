#!/usr/bin/env node
/**
 * RI-UX-002 + RI-NOTIF-001 — AI publication table + Attention Centre search (static + filter unit).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { filterNotificationsClient } from '../../../design-lab/regulatory-intelligence/js/platform/notification-attention.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const platform = join(__dir, '..');
const lab = join(__dir, '..', '..', '..', 'design-lab', 'regulatory-intelligence');
let fail = 0;

function defaultAttentionCentreQuery() {
  return { q: '', type: 'all', status: 'all', severity: 'all', from: '', to: '', sort: 'newest' };
}

function pass(id, detail) {
  console.log(`PASS: ${id} — ${detail}`);
}

function failTest(id, detail) {
  fail += 1;
  console.error(`FAIL: ${id} — ${detail}`);
}

const pubViews = readFileSync(join(lab, 'js/publication-views.js'), 'utf8');
const aiSection = pubViews.slice(pubViews.indexOf('renderPublicationAiTabConnected'));
if (aiSection.includes("'Provider'") || aiSection.includes("'Model'")) {
  failTest('ri_ux_002', 'Publication AI table must not show Provider/Model columns');
} else if (
  !aiSection.includes("['Analysis', 'Status', 'Completed', 'Classification', 'Findings preview', 'Claims']")
) {
  failTest('ri_ux_002_headers', 'Publication AI table headers');
} else {
  pass('ri_ux_002', 'business-facing AI table without Provider/Model');
}

const gov = readFileSync(join(lab, 'js/ai-governance-views.js'), 'utf8');
if (!gov.includes("'Provider'")) {
  failTest('ri_ux_002_gov', 'AI Governance must retain Provider column');
} else {
  pass('ri_ux_002_gov', 'governance register keeps Provider');
}

const notifRoute = readFileSync(join(platform, 'app/api/ri-lab/notifications/route.ts'), 'utf8');
if (!notifRoute.includes('parseLabNotificationQuery') || !notifRoute.includes('totalMatching')) {
  failTest('ri_notif_api', 'notifications API must support tenant-scoped query');
} else {
  pass('ri_notif_api', 'server-side notification query');
}

const opViews = readFileSync(join(lab, 'js/operational-views.js'), 'utf8');
const attn = readFileSync(join(lab, 'js/platform/notification-attention.js'), 'utf8');
if (!opViews.includes('renderAttentionCentreControls') || !attn.includes('data-attention-search')) {
  failTest('ri_notif_ui', 'Attention Centre filter UI');
} else {
  pass('ri_notif_ui', 'Attention Centre controls');
}

const sample = [
  {
    id: 'n1',
    message: 'Approval required for impact assessment',
    title: 'Consumer Duty assessment',
    type: 'Approval request',
    entityType: 'impact_assessment',
    entityId: '277132be-45af-4a45-9920-624b71c4da52',
    at: '2026-11-01T12:00:00Z',
    severity: 'High',
    read: false,
    href: '#/assessment/277132be-45af-4a45-9920-624b71c4da52',
  },
  {
    id: 'n2',
    message: 'AI review pending',
    title: 'Run complete',
    type: 'AI review',
    entityType: 'ai_analysis_run',
    entityId: 'abc',
    at: '2026-10-30T12:00:00Z',
    severity: 'Medium',
    read: true,
    href: '#/ai-governance',
  },
];

const partial = filterNotificationsClient(sample, { q: '277132be', type: 'all', status: 'all', severity: 'all', from: '', to: '', sort: 'newest' });
if (partial.totalMatching !== 1 || partial.notifications[0]?.entityId !== sample[0].entityId) {
  failTest('ri_notif_partial_uuid', 'partial UUID search');
} else {
  pass('ri_notif_partial_uuid', 'partial entity id match');
}

const ai = filterNotificationsClient(sample, { q: 'AI review', type: 'all', status: 'all', severity: 'all', from: '', to: '', sort: 'newest' });
if (ai.totalMatching !== 1) {
  failTest('ri_notif_keyword', 'keyword search');
} else {
  pass('ri_notif_keyword', 'message/type keyword');
}

const caseInsensitive = filterNotificationsClient(sample, { q: 'CONSUMER duty', type: 'all', status: 'all', severity: 'all', from: '', to: '', sort: 'newest' });
if (caseInsensitive.totalMatching !== 1) {
  failTest('ri_notif_case', 'case-insensitive search');
} else {
  pass('ri_notif_case', 'case-insensitive title match');
}

const combined = filterNotificationsClient(sample, {
  q: '',
  type: 'ai_review',
  status: 'read',
  severity: 'all',
  from: '',
  to: '',
  sort: 'newest',
});
if (combined.totalMatching !== 1 || !combined.notifications[0]?.read) {
  failTest('ri_notif_combined', 'type + read filter');
} else {
  pass('ri_notif_combined', 'combined filters');
}

const cleared = filterNotificationsClient(sample, defaultAttentionCentreQuery());
if (cleared.totalMatching !== 2) {
  failTest('ri_notif_clear', 'full list when filters default');
} else {
  pass('ri_notif_clear', 'default query shows all');
}

if (!fail) console.log('\nacceptance-phase-8-ri-ux-002-notif-001: PASS\n');
else {
  console.error(`\nacceptance-phase-8-ri-ux-002-notif-001: FAIL (${fail})\n`);
  process.exit(1);
}
