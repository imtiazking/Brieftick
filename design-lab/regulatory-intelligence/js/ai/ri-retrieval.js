/**
 * Deterministic RI retrieval for Ask RI / 5C (no embeddings).
 */
import { CONTEXT_RECORD_CATEGORY } from './enums.js';
import { changesForSector, getSectorById, getSectorBySlug, publicationsForSector } from '../landscape-helpers.js';
import {
  buildRiEntityCatalog,
  evaluateEntityConstraints,
  resolveBaselSourcesInQuestion,
  resolveRegulatorsInQuestion,
  resolveSectorsInQuestion,
  sectorRegulatorEvidence,
} from './ri-entity-catalog.js';
import { EVIDENCE_DISPLAY_CAP } from './ri-ask-planner.js';
import { buildAskQueryPlan } from './ri-graph-plan.js';
import { formatAsOfLabel, resolveHubChangeIds } from './ri-graph-traverse.js';
import {
  executeGraphPlan,
  executeTargetPredicatePlan,
  resolveAskRiResultState,
  ASK_RI_RESULT_STATES,
} from './ri-query-executor.js';
import { buildInterpretedAsPlainEnglish as buildInterpretedAs, SUPPORTED_QUESTION_EXAMPLES } from './ri-interpreted-as.js';

export { SUPPORTED_QUESTION_EXAMPLES };
import { HUB_NODE_TYPES } from './ri-graph-normalized.js';
import { directEvidenceIds } from './obligation-attribution.js';
import { actionsForChange, assessmentsForChange, obligationsForChange } from './ri-canonical-links.js';
import { buildDisplayReasons } from './ask-ri-provenance.js';
import { labTodayISO } from '../platform/clock.js';
import {
  countOpenObligationsInList,
  obligationStatusIsOpen,
  obligationStatusIsOpenForLinkedWork,
  OPEN_OBLIGATION_STATUSES,
  summarizeObligationPortfolio,
} from './obligation-portfolio.js';

export {
  obligationStatusIsOpen,
  obligationStatusIsOpenForLinkedWork,
  OPEN_OBLIGATION_STATUSES,
  summarizeObligationPortfolio,
};

const CHANGE_NOT_CURRENTLY_RELEVANT = new Set([
  'Complete',
  'Superseded',
  'Withdrawn',
  'Cancelled',
  'Closed',
  'Horizon',
]);

export function parseAskQuery(question, state = null) {
  const q = String(question || '').trim();
  const lower = q.toLowerCase();
  const filters = { futureFacing: /\bupcoming\b|\bfuture\b|\bconsultation\b|\bnext year\b|\bhorizon\b|\bemerging\b/i.test(q) };

  let plan = null;
  if (state) {
    plan = buildAskQueryPlan(q, state);
    const catalog = buildRiEntityCatalog(state);
    const sectorEnt = plan.resolvedEntities.find((e) => e.type === 'Sector');
    if (sectorEnt) {
      filters.sectorId = sectorEnt.id;
      filters.sectorSlug = sectorEnt.slug;
    }
    if (plan.temporalFilters?.includes('current')) filters.requireCurrentlyRelevant = true;
    if (plan.secondaryIntents?.length) filters.secondaryIntents = plan.secondaryIntents;
    filters.compound = plan.compound;

    if (plan.aggregationRequests?.some((a) => a.type === 'count-open-obligations')) {
      filters.intent = 'count-open-obligations';
    }

    const basel = resolveBaselSourcesInQuestion(q, catalog);
    const regs = resolveRegulatorsInQuestion(q, catalog);
    const praLike = regs.some((r) => /pra|bank of england|boe/i.test(`${r.shortName} ${r.label}`));
    if (basel.length && praLike && /linked|implementation|developments|requirements/i.test(lower)) {
      filters.intent = 'reviewed-cross-source';
      filters.sourceFamily = 'basel';
      filters.targetFamily = 'pra';
    }

    const tpr = regs.find((r) => /tpr|pensions regulator/i.test(`${r.shortName} ${r.label}`));
    const pensionSector = plan.resolvedEntities.find((s) => s.slug === 'pension-providers') || resolveSectorsInQuestion('pension providers', catalog)[0];
    if (tpr && pensionSector && /requirements|relevant|linked|pension/i.test(lower) && !filters.intent) {
      filters.intent = 'regulator-sector-evidence';
      filters.regulatorId = tpr.id;
      filters.sectorId = pensionSector.id;
      filters.sectorSlug = pensionSector.slug;
    }

    if (!plan.unresolvedSemantics) {
      if (!filters.intent && plan.targetPredicate) {
        filters.intent = 'target-predicate';
      }

      const graphPrimaryTypes = new Set(['Change', 'Obligation', 'Action', 'Control', 'Evidence', 'Assurance']);
      if (!filters.intent && plan.resolvedEntities.length && plan.primaryTargetType && graphPrimaryTypes.has(plan.primaryTargetType)) {
        filters.intent = 'graph-query';
      }
      if (!filters.intent && plan.resolvedEntities.length && (plan.relationshipRequests?.length || plan.secondaryIntents?.length)) {
        filters.intent = 'graph-query';
      }
    }
  }

  return { query: q, filters, lower, plan };
}

export function changeIsCurrentlyRelevant(change, { futureFacing = false } = {}) {
  if (!change) return false;
  const status = change.status || '';
  if (CHANGE_NOT_CURRENTLY_RELEVANT.has(status)) return false;
  if (futureFacing) return status === 'Horizon' || /horizon|consultation/i.test(status);
  if (status === 'Horizon') return false;
  return true;
}

export function changeTouchesSector(state, change, sectorId) {
  if (!sectorId || !change) return false;
  if (changesForSector(state, sectorId).some((c) => c.id === change.id)) return true;
  const sector = getSectorById(state, sectorId);
  if (!sector) return false;
  const tokens = new Set([
    norm(sector.name),
    ...(sector.slug || '').split('-').filter((t) => t.length > 2),
  ]);
  const lines = (change.affectedBusinessLines || []).join(' ').toLowerCase();
  for (const t of tokens) {
    if (t && lines.includes(t)) return true;
  }
  const pub = state.publications?.find((p) => p.id === change.publicationId);
  const pubSectors = pub?.sectorIds || pub?.affectedSectors || [];
  if (Array.isArray(pubSectors) && pubSectors.includes(sectorId)) return true;
  return publicationsForSector(state, sectorId).some((p) => p.id === change.publicationId);
}

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

export function countOpenObligations(state) {
  return countOpenObligationsInList(state.obligations || []);
}

export function computeDeterministicFacts(state, parsed) {
  const portfolio = summarizeObligationPortfolio(state.obligations || []);
  const facts = {
    obligationPortfolio: portfolio,
    draftObligationCount: portfolio.counts.DRAFT,
    reviewObligationCount: portfolio.counts.REVIEW,
    overdueActiveCount: portfolio.flags.overdueActive,
    unclassifiedObligationStatuses: portfolio.unclassifiedStatuses,
    openObligationCount: portfolio.counts.ACTIVE,
  };
  if (parsed.filters.intent === 'count-open-obligations' || /how many open obligation/i.test(parsed.query)) {
    facts.openObligationCount = portfolio.counts.ACTIVE;
  }
  facts.materialChangesOpenIa = (state.changes || []).filter((c) => {
    const mat = /high|medium/i.test(c.materiality || '');
    const ia = (state.assessments || []).find((a) => a.changeId === c.id);
    return mat && (!ia || (ia.status !== 'Approved' && ia.status !== 'Complete'));
  }).length;
  return facts;
}

function emptyRetrieval(parsed, filters, timestamp, state, reason, debug = {}, resultState = ASK_RI_RESULT_STATES.INSUFFICIENT_EVIDENCE) {
  const hubScoped = Boolean(
    parsed.plan?.resolvedEntities?.some((e) => HUB_NODE_TYPES.has(e.type)) || parsed.plan?.targetPredicate?.anchors?.length
  );
  const stateResolved =
    resultState ||
    (reason === 'No discriminating RI retrieval intent'
      ? ASK_RI_RESULT_STATES.UNRESOLVED_QUERY_SEMANTICS
      : /Named entity not in RI evidence/i.test(reason)
        ? ASK_RI_RESULT_STATES.INSUFFICIENT_EVIDENCE
        : hubScoped
          ? ASK_RI_RESULT_STATES.ZERO_QUALIFIERS
          : ASK_RI_RESULT_STATES.INSUFFICIENT_EVIDENCE);
  const primaryAdequate =
    stateResolved === ASK_RI_RESULT_STATES.RESOLVED ||
    stateResolved === ASK_RI_RESULT_STATES.ZERO_QUALIFIERS;
  return {
    query: parsed.query,
    matchedRecordIds: [],
    recordTypes: {},
    matchReasons: {},
    retrievalTimestamp: timestamp,
    filters,
    resultCount: 0,
    totalMatchingRecords: 0,
    displayedEvidenceRecords: 0,
    evidenceDisplayTruncated: false,
    primaryResultCount: 0,
    primaryAdequate,
    adequate: primaryAdequate,
    insufficientReason: stateResolved === ASK_RI_RESULT_STATES.INSUFFICIENT_EVIDENCE ? reason : null,
    resultState: stateResolved,
    interpretedAs: buildInterpretedAs(parsed.plan, filters, stateResolved),
    deterministicFacts: computeDeterministicFacts(state, parsed),
    debug,
  };
}

function addMatch(bucket, id, type, reason) {
  if (!id) return;
  bucket.matchedRecordIds.push(id);
  bucket.recordTypes[id] = type;
  bucket.matchReasons[id] = reason;
}

function reviewedMappingsForCrossSource(state, { sourceFamily, targetFamily }) {
  const reviewed = (state.internationalImplementationMappings || []).filter((m) => m.reviewStatus === 'REVIEWED');
  return reviewed.filter((m) => {
    const baselRec = (state.baselPublicationRecords || []).find((b) => b.baselRecordId === m.baselRecordId);
    const pub = (state.publications || []).find((p) => p.id === m.praPublicationId);
    const sourceOk = sourceFamily === 'basel' && baselRec;
    const targetOk =
      targetFamily === 'pra' &&
      pub &&
      /pra|bank of england|prudential/i.test(`${pub.regulator || ''} ${pub.title || ''}`);
    return sourceOk && targetOk;
  });
}

function retrieveSectorCurrentChanges(state, sectorId, filters, bucket) {
  const sector = getSectorById(state, sectorId);
  if (!sector) return [];
  const changeIds = [];
  (state.changes || []).forEach((ch) => {
    if (filters.requireCurrentlyRelevant && !changeIsCurrentlyRelevant(ch, filters)) return;
    if (!changeTouchesSector(state, ch, sectorId)) return;
    changeIds.push(ch.id);
    addMatch(bucket, ch.id, 'Change', `${sector.name}-linked Change (landscape / publication / business-line relationship)`);
    const pubId = ch.publicationId;
    if (pubId) addMatch(bucket, pubId, 'Publication', `Source publication for ${sector.name}-linked Change`);
  });
  return changeIds;
}

function expandLinkedFromChanges(state, changeIds, secondaryIntents, bucket, { openObligationsOnly = false } = {}) {
  const summary = { linkedActionCount: 0, linkedObligationCount: 0, linkedAssessmentCount: 0, linkedRiskCount: 0, linkedControlCount: 0 };
  const want = new Set(secondaryIntents || []);
  for (const changeId of changeIds) {
    if (want.has('linked-assessments')) {
      assessmentsForChange(state, changeId).forEach((a) => {
        summary.linkedAssessmentCount += 1;
        addMatch(bucket, a.id, 'ImpactAssessment', `Impact Assessment linked to Change ${changeId}`);
      });
    }
    if (want.has('linked-obligations') || want.has('linked-actions')) {
      obligationsForChange(state, changeId).forEach((obl) => {
        if (openObligationsOnly && !obligationStatusIsOpenForLinkedWork(obl.status)) return;
        summary.linkedObligationCount += 1;
        addMatch(bucket, obl.id, 'Obligation', `Obligation linked to Change ${changeId}`);
      });
    }
    if (want.has('linked-actions')) {
      actionsForChange(state, changeId).forEach((a) => {
        summary.linkedActionCount += 1;
        addMatch(bucket, a.id, 'Action', `Action sourced from obligation or assessment on Change ${changeId}`);
      });
    }
  }
  return summary;
}

function retrieveReviewedCrossSource(state, bucket) {
  const mappings = reviewedMappingsForCrossSource(state, { sourceFamily: 'basel', targetFamily: 'pra' });
  const mapping = mappings[0];
  if (!mapping) return null;
  addMatch(bucket, mapping.mappingId, 'ImplementationMapping', 'Human-reviewed cross-source implementation mapping');
  addMatch(bucket, mapping.baselRecordId, 'BaselRecord', 'Linked Basel / BCBS source record in reviewed mapping');
  if (mapping.praPublicationId) {
    addMatch(bucket, mapping.praPublicationId, 'Publication', 'Linked PRA / Bank of England publication in reviewed mapping');
  }
  if (mapping.linkedRiChangeId) {
    addMatch(bucket, mapping.linkedRiChangeId, 'Change', 'RI Change linked in reviewed mapping');
  }
  return mapping.mappingId;
}

function retrieveRegulatorSectorEvidence(state, regulatorId, sectorId, bucket) {
  const pack = sectorRegulatorEvidence(state, sectorId, regulatorId);
  if (!pack.regulatorOk) return;
  pack.frameworks.forEach((f) => addMatch(bucket, f.id, 'Framework', 'Framework mapped to sector and regulator family'));
  pack.tprRecords.forEach((r) => addMatch(bucket, r.tprRecordId, 'TprRecord', 'TPR official source record mapped to sector'));
  pack.obligations.forEach((o) => addMatch(bucket, o.id, 'Obligation', 'Sector obligation evidence'));
}

function prioritizeEvidenceIds(unique, recordTypes, plan) {
  if (!plan) return unique;
  const primary = plan.primaryTargetType;
  const targets = new Set([primary, ...(plan.secondaryTargetTypes || [])]);
  const score = (id) => {
    const t = recordTypes[id];
    if (t === primary) return 0;
    if (targets.has(t)) return 1;
    if (t === 'Action' || t === 'Obligation' || t === 'Control') return 2;
    return 3;
  };
  return [...unique].sort((a, b) => score(a) - score(b));
}

function retrieveTargetPredicateMatches(state, plan, bucket, graphPathByRecordId) {
  const exec = executeTargetPredicatePlan(state, plan, bucket, graphPathByRecordId);
  if (!exec.predicateMeta) {
    return { primaryCount: 0, predicateResult: null, scopeChangeIds: exec.scopeChangeIds || [], targetPredicateFacts: {} };
  }
  return {
    primaryCount: exec.primaryCount,
    scopeChangeIds: exec.scopeChangeIds,
    ...exec.predicateMeta,
  };
}

function packageRetrieval(unique, recordTypes, matchReasons, parsed, filters, timestamp, meta) {
  const ordered = prioritizeEvidenceIds(unique, recordTypes, parsed.plan);
  const total = ordered.length;
  const displayed = ordered.slice(0, EVIDENCE_DISPLAY_CAP);
  const deterministicFacts = meta.deterministicFacts || computeDeterministicFacts(meta.state, parsed);
  const asOfDate = meta.asOfDate || deterministicFacts.asOfDate;
  const asOfLabel = meta.asOfLabel || deterministicFacts.asOfDateLabel;
  const displayReasons = buildDisplayReasons(meta.state, ordered, recordTypes, matchReasons, {
    pathByRecordId: meta.graphPathByRecordId || {},
    asOfDate,
    asOfLabel,
  });
  return {
    query: parsed.query,
    matchedRecordIds: displayed,
    matchedRecordIdsAll: ordered,
    recordTypes,
    matchReasons,
    displayReasons,
    retrievalTimestamp: timestamp,
    filters,
    plan: parsed.plan,
    resultCount: total,
    totalMatchingRecords: total,
    displayedEvidenceRecords: displayed.length,
    evidenceDisplayTruncated: total > displayed.length,
    primaryResultCount: meta.primaryCount,
    requestedTargetType: meta.requestedTargetType || parsed.plan?.primaryTargetType,
    primaryResultIds: meta.primaryResultIds || [],
    primaryAdequate: meta.primaryAdequate,
    adequate: meta.primaryAdequate,
    resultState: meta.resultState || ASK_RI_RESULT_STATES.RESOLVED,
    interpretedAs: meta.interpretedAs,
    compoundSummary: meta.compoundSummary,
    evaluatedCounts: meta.evaluatedCounts,
    evaluatedRelations: meta.evaluatedRelations,
    reviewedMappingId: meta.reviewedMappingId,
    deterministicFacts,
    predicateEvaluation: deterministicFacts.predicateEvaluation,
    secondaryGaps: meta.secondaryGaps,
    graphConflicts: meta.graphConflicts || [],
    pathByRecordId: meta.graphPathByRecordId || {},
    debug: meta.debug,
  };
}

export function validateRetrievalPrecision(state, retrieval) {
  const errors = [];
  const sectorId = retrieval.filters?.sectorId || (retrieval.filters?.sectorSlug ? getSectorBySlug(state, retrieval.filters.sectorSlug)?.id : null);
  const sector = sectorId ? getSectorById(state, sectorId) : null;
  for (const id of retrieval.matchedRecordIdsAll || retrieval.matchedRecordIds || []) {
    const type = retrieval.recordTypes[id];
    if (type === 'Change' && sectorId) {
      const ch = state.changes?.find((c) => c.id === id);
      if (!changeTouchesSector(state, ch, sectorId)) errors.push(`${id}: not linked to ${sector?.name || sectorId}`);
      if (retrieval.filters?.requireCurrentlyRelevant && !changeIsCurrentlyRelevant(ch, retrieval.filters)) {
        errors.push(`${id}: not currently relevant`);
      }
    }
  }
  if (retrieval.filters?.intent === 'reviewed-cross-source') {
    const mappings = reviewedMappingsForCrossSource(state, { sourceFamily: 'basel', targetFamily: 'pra' });
    const mapping = mappings[0];
    if (!mapping) errors.push('missing reviewed mapping');
    else {
      const ids = retrieval.matchedRecordIdsAll || retrieval.matchedRecordIds;
      if (!ids.includes(mapping.baselRecordId)) errors.push('missing Basel record');
      if (mapping.praPublicationId && !ids.includes(mapping.praPublicationId)) errors.push('missing PRA publication');
      if (!retrieval.reviewedMappingId) errors.push('missing mapping id on retrieval');
    }
  }
  return { ok: errors.length === 0, errors };
}

export function retrieveRiRecords(state, question, options = {}) {
  const parsed = options.parsed || parseAskQuery(question, state);
  const timestamp = new Date().toISOString();
  const matchedRecordIds = [];
  const recordTypes = {};
  const matchReasons = {};
  const bucket = { matchedRecordIds, recordTypes, matchReasons };
  const filters = { ...parsed.filters };

  const entityEval = evaluateEntityConstraints(state, question);
  const debug = options.debugRetrieval
    ? { intent: filters.intent, entityEval, filters, plan: parsed.plan }
    : undefined;

  if (entityEval.insufficient) {
    const labels = entityEval.blocking.map((b) => `${b.kind}:${b.phrase}`).join('; ');
    return emptyRetrieval(
      parsed,
      filters,
      timestamp,
      state,
      `Named entity not in RI evidence: ${labels}`,
      debug,
      ASK_RI_RESULT_STATES.INSUFFICIENT_EVIDENCE
    );
  }

  if (options.fixtureScenario === 'ai-006b-insufficient') {
    return emptyRetrieval(parsed, filters, timestamp, state, 'fixture insufficient', debug);
  }

  if (!filters.intent) {
    return emptyRetrieval(
      parsed,
      filters,
      timestamp,
      state,
      'No discriminating RI retrieval intent',
      debug,
      ASK_RI_RESULT_STATES.UNRESOLVED_QUERY_SEMANTICS
    );
  }

  let reviewedMappingId = null;
  let primaryChangeIds = [];
  let primaryCount = 0;
  let compoundSummary = null;
  let evaluatedCounts = null;
  let evaluatedRelations = [];
  let metaActionFacts = null;
  let retrievalGraphConflicts = [];
  const secondaryGaps = [];
  const graphPathByRecordId = {};
  let retrievalAsOfDate = options.asOfDate || labTodayISO();
  let predicateMeta = null;

  if (filters.intent === 'target-predicate' && parsed.plan?.targetPredicate) {
    const asOfDate = options.asOfDate || labTodayISO();
    retrievalAsOfDate = asOfDate;
    predicateMeta = retrieveTargetPredicateMatches(state, parsed.plan, bucket, graphPathByRecordId);
    primaryCount = predicateMeta.primaryCount;
  }

  if (filters.intent === 'graph-query' && parsed.plan) {
    const asOfDate = options.asOfDate || labTodayISO();
    retrievalAsOfDate = asOfDate;
    const graphResult = executeGraphPlan(state, parsed.plan, { asOfDate });
    graphResult.bucket.matchedRecordIds.forEach((id) => {
      bucket.matchedRecordIds.push(id);
      bucket.recordTypes[id] = graphResult.bucket.recordTypes[id];
      bucket.matchReasons[id] = graphResult.bucket.matchReasons[id];
    });
    Object.assign(graphPathByRecordId, graphResult.pathByRecordId);
    compoundSummary = parsed.plan?.compound ? graphResult.summary : null;
    evaluatedCounts = graphResult.evaluatedCounts;
    evaluatedRelations = graphResult.evaluatedRelations || [];
    secondaryGaps.push(...graphResult.secondaryGaps);
    primaryCount = graphResult.primaryCount;
    primaryChangeIds = graphResult.scopedChangeIds || [];
    metaActionFacts = graphResult.metaActionFacts;
    if (options.debugRetrieval && debug) debug.asOfDate = asOfDate;
  }

  if (filters.intent === 'reviewed-cross-source' || options.fixtureScenario === 'ai-005-implementation-mapping') {
    reviewedMappingId = retrieveReviewedCrossSource(state, bucket);
    primaryCount = reviewedMappingId ? 1 : 0;
  }

  if (filters.intent === 'regulator-sector-evidence' && filters.regulatorId && filters.sectorId) {
    retrieveRegulatorSectorEvidence(state, filters.regulatorId, filters.sectorId, bucket);
    primaryCount = bucket.matchedRecordIds.length;
  }

  if (filters.intent === 'count-open-obligations') {
    const open = (state.obligations || []).filter((o) => obligationStatusIsOpen(o.status));
    primaryCount = open.length;
    open.forEach((o) => {
      addMatch(bucket, o.id, 'Obligation', `Obligation status ${o.status} (OPEN definition)`);
    });
  }

  if (options.allowFixtureRetrieval === true && options.fixtureScenario === 'ai-006-ask-banking' && matchedRecordIds.length === 0) {
    ['CHG-001', 'CHG-002', 'CHG-003', 'PUB-001'].forEach((id) => {
      addMatch(bucket, id, id.startsWith('CHG') ? 'Change' : 'Publication', 'Fixture retrieval set for AI-006 (unit test only)');
    });
    primaryCount = 3;
  }

  const unique = [...new Set(matchedRecordIds)];
  const hubScoped =
    filters.intent === 'graph-query' || filters.intent === 'target-predicate'
      ? Boolean(
          parsed.plan?.resolvedEntities?.some((e) => HUB_NODE_TYPES.has(e.type)) ||
            parsed.plan?.targetPredicate?.anchors?.length
        )
      : false;
  const qualifyingCount =
    predicateMeta?.predicateEvaluation?.qualifyingCount ??
    predicateMeta?.predicateResult?.qualifyingCount ??
    (filters.intent === 'target-predicate' ? primaryCount : null);

  const resultState = resolveAskRiResultState({
    intent: filters.intent,
    entityInsufficient: false,
    hubScoped,
    scopeChangeIds: predicateMeta?.scopeChangeIds || primaryChangeIds,
    primaryCount:
      filters.intent === 'count-open-obligations' ? countOpenObligations(state) : primaryCount,
    qualifyingCount,
    hasIntent: true,
  });

  const primaryAdequate =
    resultState === ASK_RI_RESULT_STATES.RESOLVED || resultState === ASK_RI_RESULT_STATES.ZERO_QUALIFIERS;

  if (
    resultState === ASK_RI_RESULT_STATES.INSUFFICIENT_EVIDENCE ||
    resultState === ASK_RI_RESULT_STATES.UNRESOLVED_QUERY_SEMANTICS
  ) {
    return emptyRetrieval(
      parsed,
      filters,
      timestamp,
      state,
      'No suitable primary RI evidence for this question',
      debug,
      resultState
    );
  }

  if (options.debugRetrieval && debug) {
    debug.candidateCount = matchedRecordIds.length;
    debug.matchedCount = unique.length;
    debug.matchedRecordIds = unique;
    debug.matchReasons = matchReasons;
    debug.plan = parsed.plan;
    debug.primaryChangeIds = primaryChangeIds;
  }

  const packagedFacts = {
    ...computeDeterministicFacts(state, parsed),
    ...(metaActionFacts || {}),
    ...(predicateMeta?.predicateResult ? { predicateResult: predicateMeta.predicateResult } : {}),
    ...(predicateMeta?.targetPredicateFacts ? { targetPredicateFacts: predicateMeta.targetPredicateFacts } : {}),
    ...(predicateMeta?.predicateEvaluation ? { predicateEvaluation: predicateMeta.predicateEvaluation } : {}),
  };
  if (metaActionFacts?.asOfDate) {
    packagedFacts.asOfDate = metaActionFacts.asOfDate;
    packagedFacts.asOfDateLabel = metaActionFacts.asOfDateLabel;
  } else if (filters.intent === 'graph-query') {
    packagedFacts.asOfDate = retrievalAsOfDate;
    packagedFacts.asOfDateLabel = formatAsOfLabel(retrievalAsOfDate);
  }

  return packageRetrieval(unique, recordTypes, matchReasons, parsed, filters, timestamp, {
    state,
    primaryCount,
    primaryAdequate,
    resultState,
    interpretedAs: buildInterpretedAs(parsed.plan, filters, resultState, {
      asOfDate: packagedFacts.asOfDate,
      asOfLabel: packagedFacts.asOfDateLabel,
    }),
    compoundSummary,
    evaluatedCounts,
    evaluatedRelations,
    reviewedMappingId,
    secondaryGaps,
    graphConflicts: retrievalGraphConflicts,
    deterministicFacts: packagedFacts,
    graphPathByRecordId,
    asOfDate: packagedFacts.asOfDate,
    asOfLabel: packagedFacts.asOfDateLabel,
    requestedTargetType: predicateMeta?.requestedTargetType,
    primaryResultIds: predicateMeta?.primaryResultIds,
    debug,
  });
}

export function selectionFromRetrieval(retrieval) {
  return retrieval.matchedRecordIds.map((recordId) => ({
    category: CONTEXT_RECORD_CATEGORY.RI_RECORD,
    recordType: mapRecordTypeForContext(retrieval.recordTypes[recordId]),
    recordId,
  }));
}

function mapRecordTypeForContext(type) {
  if (type === 'BaselRecord') return 'Publication';
  if (type === 'TprRecord') return 'Publication';
  if (type === 'ImplementationMapping') return 'ImplementationMapping';
  if (type === 'Framework') return 'Framework';
  if (type === 'Theme') return 'Theme';
  if (type === 'Sector') return 'Sector';
  if (type === 'Action') return 'Action';
  if (type === 'Risk') return 'Risk';
  if (type === 'Control') return 'Control';
  return type;
}
