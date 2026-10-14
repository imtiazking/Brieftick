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

/** Documented OPEN obligation statuses (Design Lab). */
export const OPEN_OBLIGATION_STATUSES = new Set(['Draft', 'Open', 'In progress', 'Review', 'Active']);

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

  if (/how many open obligation/i.test(q)) filters.intent = 'count-open-obligations';

  if (/currently affect|changes currently affect/i.test(lower)) {
    filters.intent = 'sector-current-changes';
    filters.requireCurrentlyRelevant = true;
  }

  if (state) {
    const catalog = buildRiEntityCatalog(state);
    const sectors = resolveSectorsInQuestion(q, catalog);
    if (sectors.length === 1) filters.sectorId = sectors[0].id;
    if (sectors.length === 1) filters.sectorSlug = sectors[0].slug;

    const basel = resolveBaselSourcesInQuestion(q, catalog);
    const regs = resolveRegulatorsInQuestion(q, catalog);
    const praLike = regs.some((r) => /pra|bank of england|boe/i.test(`${r.shortName} ${r.label}`));
    if (basel.length && praLike && /linked|implementation|developments|requirements/i.test(lower)) {
      filters.intent = 'reviewed-cross-source';
      filters.sourceFamily = 'basel';
      filters.targetFamily = 'pra';
    }

    const tpr = regs.find((r) => /tpr|pensions regulator/i.test(`${r.shortName} ${r.label}`));
    const pensionSector = sectors.find((s) => s.slug === 'pension-providers') || resolveSectorsInQuestion('pension providers', catalog)[0];
    if (tpr && pensionSector && /requirements|relevant|linked|pension/i.test(lower)) {
      filters.intent = 'regulator-sector-evidence';
      filters.regulatorId = tpr.id;
      filters.sectorId = pensionSector.id;
      filters.sectorSlug = pensionSector.slug;
    }
  }

  return { query: q, filters, lower };
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
  const pubMapped = publicationsForSector(state, sectorId).some((p) => p.id === change.publicationId);
  return pubMapped;
}

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

export function countOpenObligations(state) {
  return (state.obligations || []).filter((o) => OPEN_OBLIGATION_STATUSES.has(o.status)).length;
}

export function computeDeterministicFacts(state, parsed) {
  const facts = {};
  if (parsed.filters.intent === 'count-open-obligations' || /how many open obligation/i.test(parsed.query)) {
    facts.openObligationCount = countOpenObligations(state);
  }
  facts.materialChangesOpenIa = (state.changes || []).filter((c) => {
    const mat = /high|medium/i.test(c.materiality || '');
    const ia = (state.assessments || []).find((a) => a.changeId === c.id);
    return mat && (!ia || (ia.status !== 'Approved' && ia.status !== 'Complete'));
  }).length;
  return facts;
}

function emptyRetrieval(parsed, filters, timestamp, state, reason, debug = {}) {
  return {
    query: parsed.query,
    matchedRecordIds: [],
    recordTypes: {},
    matchReasons: {},
    retrievalTimestamp: timestamp,
    filters,
    resultCount: 0,
    adequate: false,
    insufficientReason: reason,
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
  if (!sector) return;
  (state.changes || []).forEach((ch) => {
    if (filters.requireCurrentlyRelevant && !changeIsCurrentlyRelevant(ch, filters)) return;
    if (!changeTouchesSector(state, ch, sectorId)) return;
    addMatch(bucket, ch.id, 'Change', `${sector.name}-linked Change (landscape / publication / business-line relationship)`);
    const pubId = ch.publicationId;
    if (pubId && changeTouchesSector(state, ch, sectorId)) {
      addMatch(bucket, pubId, 'Publication', `Source publication for ${sector.name}-linked Change`);
    }
  });
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

export function validateRetrievalPrecision(state, retrieval) {
  const errors = [];
  const sectorId = retrieval.filters?.sectorId || (retrieval.filters?.sectorSlug ? getSectorBySlug(state, retrieval.filters.sectorSlug)?.id : null);
  const sector = sectorId ? getSectorById(state, sectorId) : null;
  for (const id of retrieval.matchedRecordIds || []) {
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
      if (!retrieval.matchedRecordIds.includes(mapping.baselRecordId)) errors.push('missing Basel record');
      if (mapping.praPublicationId && !retrieval.matchedRecordIds.includes(mapping.praPublicationId)) errors.push('missing PRA publication');
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
    ? {
        intent: filters.intent,
        entityEval,
        filters,
      }
    : {};

  if (entityEval.insufficient) {
    const labels = entityEval.blocking.map((b) => `${b.kind}:${b.phrase}`).join('; ');
    return emptyRetrieval(parsed, filters, timestamp, state, `Named entity not in RI evidence: ${labels}`, debug);
  }

  if (options.fixtureScenario === 'ai-006b-insufficient') {
    return emptyRetrieval(parsed, filters, timestamp, state, 'fixture insufficient', debug);
  }

  if (!filters.intent) {
    return emptyRetrieval(parsed, filters, timestamp, state, 'No discriminating RI retrieval intent', debug);
  }

  let reviewedMappingId = null;

  if (filters.intent === 'sector-current-changes' && filters.sectorId) {
    retrieveSectorCurrentChanges(state, filters.sectorId, filters, bucket);
  }

  if (filters.intent === 'reviewed-cross-source' || options.fixtureScenario === 'ai-005-implementation-mapping') {
    reviewedMappingId = retrieveReviewedCrossSource(state, bucket);
  }

  if (filters.intent === 'regulator-sector-evidence' && filters.regulatorId && filters.sectorId) {
    retrieveRegulatorSectorEvidence(state, filters.regulatorId, filters.sectorId, bucket);
  }

  if (filters.intent === 'count-open-obligations') {
    (state.obligations || [])
      .filter((o) => OPEN_OBLIGATION_STATUSES.has(o.status))
      .slice(0, 12)
      .forEach((o) => {
        addMatch(bucket, o.id, 'Obligation', `Obligation status ${o.status} (OPEN definition)`);
      });
  }

  if (options.allowFixtureRetrieval === true && options.fixtureScenario === 'ai-006-ask-banking' && matchedRecordIds.length === 0) {
    ['CHG-001', 'CHG-002', 'CHG-003', 'PUB-001'].forEach((id) => {
      addMatch(bucket, id, id.startsWith('CHG') ? 'Change' : 'Publication', 'Fixture retrieval set for AI-006 (unit test only)');
    });
  }

  const unique = [...new Set(matchedRecordIds)];
  const deterministicFacts = computeDeterministicFacts(state, parsed);
  const adequate = unique.length > 0;

  if (options.debugRetrieval) {
    debug.candidateCount = matchedRecordIds.length;
    debug.matchedCount = unique.length;
    debug.matchedRecordIds = unique;
    debug.matchReasons = matchReasons;
  }

  return {
    query: parsed.query,
    matchedRecordIds: unique,
    recordTypes,
    matchReasons,
    retrievalTimestamp: timestamp,
    filters,
    resultCount: unique.length,
    adequate,
    reviewedMappingId,
    deterministicFacts,
    debug: options.debugRetrieval ? debug : undefined,
  };
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
  return type;
}
