import { labObligationStatusToProduction } from './lifecycle-status.mjs';
import {
  classifyObligationPrimaryStatus,
  obligationHasOverdueFlag,
  summarizeObligationPortfolio,
  UI_LABEL_OPEN_OBLIGATIONS,
} from './obligation-portfolio.mjs';
import { summarizeProductionObligationRows } from './dashboard-parity.mjs';

function filterByScenario(items, scenarioId) {
  if (!scenarioId || scenarioId === 'all') return items || [];
  return (items || []).filter((i) => i.scenario === scenarioId);
}

export function mapLabObligationToProductionRow(o) {
  return {
    id: o.id,
    external_key: o.id,
    publication_id: o.publicationId || null,
    regulatory_change_id: o.changeId || null,
    obligation_statement: o.statement,
    citation: o.citation || null,
    source_section: o.sourceSection || null,
    priority: o.priority || null,
    effective_date: o.effectiveDate || null,
    due_date: o.dueDate || null,
    status: labObligationStatusToProduction(o.status),
    owner_user_id: o.ownerId || null,
  };
}

function bucketRecordSets(obligations, statusAccessor) {
  const sets = {
    ACTIVE: [],
    DRAFT: [],
    REVIEW: [],
    CLOSED: [],
    UNCLASSIFIED: [],
    overdueActive: [],
    highPriority: [],
  };
  for (const o of obligations) {
    const status = statusAccessor(o);
    const bucket = classifyObligationPrimaryStatus(status);
    sets[bucket].push(o.id);
    if (bucket === 'ACTIVE' && obligationHasOverdueFlag(status)) sets.overdueActive.push(o.id);
    if (o.priority === 'High') sets.highPriority.push(o.id);
  }
  for (const key of Object.keys(sets)) sets[key].sort();
  return sets;
}

/** Golden obligation list (lab-native status). */
export function computeObligationsFromLabState(state) {
  return filterByScenario(state.obligations, state.scenarioId)
    .map((o) => ({
      id: o.id,
      publication_id: o.publicationId,
      regulatory_change_id: o.changeId || null,
      citation: o.citation || null,
      source_section: o.sourceSection || null,
      priority: o.priority || null,
      effective_date: o.effectiveDate || null,
      due_date: o.dueDate || null,
      status: o.status,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function compareObligationParity(state) {
  const labObls = filterByScenario(state.obligations, state.scenarioId);
  const labPortfolio = summarizeObligationPortfolio(labObls);
  const prodRows = labObls.map(mapLabObligationToProductionRow);
  const prodPortfolio = summarizeProductionObligationRows(prodRows);

  const labSets = bucketRecordSets(labObls, (o) => o.status);
  const prodSets = bucketRecordSets(prodRows, (o) =>
    String(o.status).replaceAll('_', ' '),
  );

  const countsMatch =
    labPortfolio.counts.ACTIVE === prodPortfolio.counts.ACTIVE &&
    labPortfolio.counts.DRAFT === prodPortfolio.counts.DRAFT &&
    labPortfolio.counts.REVIEW === prodPortfolio.counts.REVIEW &&
    labPortfolio.counts.CLOSED === prodPortfolio.counts.CLOSED &&
    labPortfolio.counts.TOTAL === prodPortfolio.counts.TOTAL &&
    labPortfolio.flags.overdueActive === prodPortfolio.flags.overdueActive;

  const setsMatch = ['ACTIVE', 'DRAFT', 'REVIEW', 'CLOSED', 'UNCLASSIFIED', 'overdueActive'].every(
    (k) => labSets[k].join(',') === prodSets[k].join(','),
  );

  const labList = computeObligationsFromLabState(state);
  const prodList = prodRows
    .map((r) => ({
      id: r.id,
      publication_id: r.publication_id,
      regulatory_change_id: r.regulatory_change_id,
      citation: r.citation,
      source_section: r.source_section,
      priority: r.priority,
      effective_date: r.effective_date,
      due_date: r.due_date,
      status: labObls.find((o) => o.id === r.id)?.status,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const listMatch =
    labList.length === prodList.length &&
    labList.every((row, i) => {
      const p = prodList[i];
      return (
        row.id === p.id &&
        row.publication_id === p.publication_id &&
        row.regulatory_change_id === p.regulatory_change_id &&
        row.citation === p.citation
      );
    });

  return {
    match: countsMatch && setsMatch && listMatch,
    labPortfolio,
    prodPortfolio,
    openLabel: UI_LABEL_OPEN_OBLIGATIONS,
    labSets,
    prodSets,
  };
}
