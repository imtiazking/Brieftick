import {
  isWithinForwardDateWindow,
  GOLDEN_MASTER_TODAY,
  parseDateOnly,
  forwardWindowEnd,
} from './date-window.mjs';

function filterByScenario(items, scenarioId) {
  if (!scenarioId || scenarioId === 'all') return items || [];
  return (items || []).filter((i) => i.scenario === scenarioId);
}

function filterCalendarEventsLab(events, state) {
  const sid = state.scenarioId;
  if (!sid || sid === 'all') return events;
  const pubs = new Map((state.publications || []).map((p) => [p.id, p]));
  const assessments = new Map((state.assessments || []).map((a) => [a.id, a]));
  const obligations = new Map((state.obligations || []).map((o) => [o.id, o]));
  const actions = new Map((state.actions || []).map((a) => [a.id, a]));
  const policies = new Map((state.policies || []).map((p) => [p.id, p]));
  const changes = new Map((state.changes || []).map((c) => [c.id, c]));

  const scenarioFor = (ev) => {
    const map = {
      Publication: () => pubs.get(ev.recordId)?.scenario,
      'Impact Assessment': () => assessments.get(ev.recordId)?.scenario,
      Obligation: () => obligations.get(ev.recordId)?.scenario,
      Action: () => actions.get(ev.recordId)?.scenario,
      Policy: () => policies.get(ev.recordId)?.scenario,
      'Regulatory Change': () => changes.get(ev.recordId)?.scenario,
    };
    return map[ev.recordType]?.();
  };
  return events.filter((ev) => scenarioFor(ev) === sid);
}

/** Design Lab calendar list (golden reference). */
export function computeCalendarFromLabState(state, windowDays = 90, referenceDate = GOLDEN_MASTER_TODAY) {
  const events = filterCalendarEventsLab(state.calendarEvents || [], state);
  return events
    .filter((e) => isWithinForwardDateWindow(e.date, windowDays, referenceDate))
    .map((e) => ({
      id: e.id,
      date: parseDateOnly(e.date),
      kind: e.kind,
      title: e.title,
      recordId: e.recordId,
      recordType: e.recordType,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** Production-shaped calendar events (pure) — mirrors services/calendar.ts semantics. */
export function buildCalendarEventsFromRecords(
  records,
  range,
) {
  const { from, to, organisationId } = range;
  const events = [];
  const { publications = [], obligations = [], impacts = [], actions = [], policies = [] } = records;

  for (const p of publications) {
    if (p.effective_date && p.effective_date >= from && p.effective_date <= to) {
      events.push({
        id: `CAL-P-${p.id}`,
        date: p.effective_date,
        kind: 'effective',
        title: 'Publication effective',
        recordId: p.id,
        recordType: 'Publication',
      });
    }
    if (p.consultation_deadline && p.consultation_deadline >= from && p.consultation_deadline <= to) {
      events.push({
        id: `CAL-C-${p.id}`,
        date: p.consultation_deadline,
        kind: 'consultation',
        title: 'Consultation deadline',
        recordId: p.id,
        recordType: 'Publication',
      });
    }
    if (p.publication_date && p.publication_date >= from && p.publication_date <= to) {
      events.push({
        id: `CAL-PUB-${p.id}`,
        date: p.publication_date,
        kind: 'publication',
        title: 'Published',
        recordId: p.id,
        recordType: 'Publication',
      });
    }
  }

  for (const o of obligations) {
    if (o.organisation_id && organisationId && o.organisation_id !== organisationId) continue;
    const d = o.effective_date || o.due_date;
    if (!d) continue;
    if (d >= from && d <= to) {
      events.push({
        id: `CAL-OBL-${o.id}`,
        date: d,
        kind: 'implementation',
        title: `Obligation effective: ${o.id}`,
        recordId: o.id,
        recordType: 'Obligation',
      });
    }
  }

  for (const i of impacts) {
    if (!i.due_date) continue;
    if (i.due_date >= from && i.due_date <= to) {
      events.push({
        id: `CAL-IA-${i.id}`,
        date: i.due_date,
        kind: 'assessment',
        title: `Assessment due: ${i.id}`,
        recordId: i.id,
        recordType: 'Impact Assessment',
      });
    }
  }

  for (const a of actions) {
    if (!a.due_date) continue;
    if (a.due_date >= from && a.due_date <= to) {
      events.push({
        id: `CAL-ACT-${a.id}`,
        date: a.due_date,
        kind: 'action',
        title: a.title || a.description || a.id,
        recordId: a.id,
        recordType: 'Action',
      });
    }
  }

  for (const p of policies) {
    if (!p.next_review) continue;
    if (p.next_review >= from && p.next_review <= to) {
      events.push({
        id: `CAL-POL-${p.id}`,
        date: p.next_review,
        kind: 'policy',
        title: `Policy review: ${p.name}`,
        recordId: p.id,
        recordType: 'Policy',
      });
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function mapLabStateToCalendarRecords(state, organisationId = 'ORG-DEMO') {
  const sid = state.scenarioId;
  const pubs = filterByScenario(state.publications, sid).map((p) => ({
    id: p.id,
    title: p.title,
    publication_date: p.publishedDate || null,
    effective_date: p.effectiveDate || null,
    consultation_deadline: p.consultationDeadline || null,
  }));
  const obligations = filterByScenario(state.obligations, sid).map((o) => ({
    id: o.id,
    organisation_id: organisationId,
    effective_date: o.effectiveDate || null,
    due_date: null,
    obligation_statement: o.title || o.statement || o.id,
  }));
  const policies = filterByScenario(state.policies, sid).map((p) => ({
    id: p.id,
    name: p.name,
    next_review: p.nextReview || null,
  }));
  const impacts = filterByScenario(state.assessments, sid).map((a) => ({
    id: a.id,
    organisation_id: organisationId,
    due_date: a.dueDate || null,
    status: a.status,
  }));
  const actions = filterByScenario(state.actions, sid).map((a) => ({
    id: a.id,
    organisation_id: organisationId,
    due_date: a.dueDate || null,
    description: a.description || null,
    title: a.description || a.title || a.id,
  }));
  return { publications: pubs, obligations, impacts, actions, policies };
}

export function compareCalendarParity(state, windowDays = 90, referenceDate = GOLDEN_MASTER_TODAY) {
  const from = referenceDate;
  const to = forwardWindowEnd(referenceDate, windowDays);
  const records = mapLabStateToCalendarRecords(state);
  const prod = buildCalendarEventsFromRecords(records, { from, to, organisationId: 'ORG-DEMO' });
  const lab = computeCalendarFromLabState(state, windowDays, referenceDate);
  const labKey = (e) => `${e.id}|${e.date}|${e.kind}`;
  const prodKey = (e) => `${e.id}|${e.date}|${e.kind}`;
  const labSet = new Set(lab.map(labKey));
  const prodSet = new Set(prod.map(prodKey));
  return {
    labCount: lab.length,
    prodCount: prod.length,
    match: lab.length === prod.length && [...labSet].every((k) => prodSet.has(k)),
  };
}
