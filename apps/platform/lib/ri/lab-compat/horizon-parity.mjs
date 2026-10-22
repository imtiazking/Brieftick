import { isWithinForwardDateWindow, GOLDEN_MASTER_TODAY } from './date-window.mjs';
import { regulatorExternalKeyFromLabLabel } from './regulator-keys.mjs';

function filterByScenario(items, scenarioId) {
  if (!scenarioId || scenarioId === 'all') return items || [];
  return (items || []).filter((i) => i.scenario === scenarioId);
}

function horizonEventDates(pub) {
  return [pub.consultationDeadline, pub.effectiveDate].filter(Boolean);
}

/** Design Lab `viewHorizon` selection (golden reference). */
export function computeHorizonFromLabState(state, windowDays = 90, referenceDate = GOLDEN_MASTER_TODAY) {
  const pubs = filterByScenario(state.publications, state.scenarioId);
  return pubs
    .filter((p) => horizonEventDates(p).some((d) => isWithinForwardDateWindow(d, windowDays, referenceDate)))
    .map((p) => ({
      id: p.id,
      title: p.title,
      regulator: p.regulator,
      consultation_deadline: p.consultationDeadline || null,
      effective_date: p.effectiveDate || null,
      dates: horizonEventDates(p).filter((d) => isWithinForwardDateWindow(d, windowDays, referenceDate)),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Map lab publications to production list row shape for adapter tests. */
export function mapLabPublicationsToProductionRows(state) {
  return filterByScenario(state.publications, state.scenarioId).map((p) => ({
    id: p.id,
    title: p.title,
    publication_type: p.publicationType || 'publication',
    publication_date: p.publishedDate || null,
    effective_date: p.effectiveDate || null,
    consultation_deadline: p.consultationDeadline || null,
    regulator: {
      acronym: p.regulator,
      external_key: regulatorExternalKeyFromLabLabel(p.regulator),
    },
    source: { external_key: p.sourceId || null },
    orgState: { relevance_status: p.relevanceStatus || null },
  }));
}

/**
 * Production horizon filter (pure) — matches lab forward window on consultation/effective dates.
 */
export function filterHorizonPublications(
  rows,
  filters = {},
  options = {},
) {
  const windowDays = options.windowDays ?? 90;
  const referenceDate = options.referenceDate ?? GOLDEN_MASTER_TODAY;
  const useWindow = !filters.fromDate && !filters.toDate;

  return (rows || [])
    .filter((p) => {
      if (filters.regulatorKey && p.regulator?.external_key !== filters.regulatorKey) return false;
      if (filters.sourceKey && p.source?.external_key !== filters.sourceKey) return false;
      if (filters.publicationType && p.publication_type !== filters.publicationType) return false;
      if (filters.relevance && p.orgState?.relevance_status !== filters.relevance) return false;

      const eventDates = [p.consultation_deadline, p.effective_date].filter(Boolean);
      if (useWindow) {
        return eventDates.some((d) => isWithinForwardDateWindow(d, windowDays, referenceDate));
      }
      if (filters.fromDate || filters.toDate) {
        return eventDates.some((d) => {
          if (filters.fromDate && d < filters.fromDate) return false;
          if (filters.toDate && d > filters.toDate) return false;
          return true;
        });
      }
      return true;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function compareHorizonParity(state, windowDays = 90, referenceDate = GOLDEN_MASTER_TODAY) {
  const lab = computeHorizonFromLabState(state, windowDays, referenceDate);
  const rows = mapLabPublicationsToProductionRows(state);
  const prod = filterHorizonPublications(rows, {}, { windowDays, referenceDate });
  const labIds = lab.map((p) => p.id);
  const prodIds = prod.map((p) => p.id);
  return {
    labCount: labIds.length,
    prodCount: prodIds.length,
    match: labIds.length === prodIds.length && labIds.every((id, i) => id === prodIds[i]),
  };
}
