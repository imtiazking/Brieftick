/**
 * Offline semantic retrieval authority gate — reuses Design Lab RI entity catalogue logic.
 */
import { REGULATORS } from '../../../../../packages/reference-data/catalogue/regulators.mjs';
import {
  evaluateEntityConstraints,
  resolveRegulatorsInQuestion,
  normalizeAskQuestionForEntityResolution,
} from '../ask-ri/port/ai/ri-entity-catalog.js';

export function buildOfflineRiLabStateForAuthorityGate({ indexedRegulatorIds = ['REG-FCA'] } = {}) {
  const indexed = new Set(indexedRegulatorIds);
  return {
    landscapeRegulators: REGULATORS.map((r) => ({
      id: r.regulatorId,
      name: r.name,
      shortName: r.acronym,
      evidenceIndexed: indexed.has(r.regulatorId),
    })),
    org: { jurisdictions: ['United Kingdom'] },
    sectors: [],
    regulatoryFrameworks: [],
    baselPublicationRecords: [],
    riSources: [],
  };
}

function wordBoundaryIncludes(hay, needle) {
  const n = String(needle || '').trim().toLowerCase();
  if (!n || n.length < 2) return false;
  const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return re.test(String(hay || ''));
}

/**
 * Non-indexed regulators explicitly referenced as authorities (FDA, EMA, etc.) or Basel-as-authority.
 */
export function detectAuthorityOutsideIndexedCorpus(question, { indexedRegulatorIds = ['REG-FCA'] } = {}) {
  const q = normalizeAskQuestionForEntityResolution(question);
  const indexed = new Set(indexedRegulatorIds);
  const mentionsFca =
    wordBoundaryIncludes(q, 'fca') ||
    wordBoundaryIncludes(q, 'financial conduct authority') ||
    indexed.has('REG-FCA') === false;

  const hits = [];
  for (const reg of REGULATORS) {
    if (indexed.has(reg.regulatorId)) continue;
    const aliases = [reg.acronym, reg.name, reg.regulatorId?.replace('REG-', '')].filter(Boolean);
    if (aliases.some((a) => wordBoundaryIncludes(q, a))) {
      hits.push({ regulatorId: reg.regulatorId, label: reg.name, acronym: reg.acronym });
    }
  }

  const baselAsAuthority =
    /\b(basel\s*(iii|3(\.1)?)|bcbs|output\s+floor)\b/i.test(q) &&
    !mentionsFca &&
    !/\b(fca|financial conduct authority)\b/i.test(q);

  const fdaAsAuthority = /\bFDA\b/.test(question) && !/\b(fca|financial conduct authority)\b/i.test(q);

  if (fdaAsAuthority) {
    hits.push({ regulatorId: 'REG-FDA-EXTERNAL', label: 'U.S. Food and Drug Administration', acronym: 'FDA' });
  }
  if (baselAsAuthority) {
    hits.push({ regulatorId: 'REG-BIS', label: 'Basel Committee / BCBS', acronym: 'BCBS' });
  }

  if (!hits.length) return null;
  return { authorities: hits, mentionsIndexedFca: /\b(fca|financial conduct authority)\b/i.test(q) };
}

export function evaluateSemanticRetrievalAuthorityGate(question, options = {}) {
  const indexedRegulatorIds = options.indexedRegulatorIds || ['REG-FCA'];
  const labState = buildOfflineRiLabStateForAuthorityGate({ indexedRegulatorIds });
  const entity = evaluateEntityConstraints(labState, question);
  const outside = detectAuthorityOutsideIndexedCorpus(question, { indexedRegulatorIds });

  const resolved = resolveRegulatorsInQuestion(normalizeAskQuestionForEntityResolution(question), entity.catalog);
  const resolvedIndexed = resolved.filter((r) => indexedRegulatorIds.includes(r.id));

  const jurisdictionNoise = new Set(['uk', 'u.k.', 'united kingdom', 'gb', 'great britain', 'england']);
  const regulatorBlocking = (entity.blocking || []).filter((b) => {
    if (b.kind !== 'regulator') return false;
    const p = String(b.phrase || '').trim().toLowerCase();
    return !jurisdictionNoise.has(p);
  });
  if (regulatorBlocking.length) {
    return {
      blockSemanticSelection: true,
      abstainReason: 'unsupported_regulator_in_question',
      outcome: 'abstain_unsupported_regulator',
      blocking: regulatorBlocking,
      entity,
      outside,
    };
  }

  if (outside && !outside.mentionsIndexedFca) {
    return {
      blockSemanticSelection: true,
      abstainReason: 'authority_outside_indexed_corpus',
      outcome: 'abstain_foreign_authority',
      authorities: outside.authorities,
      entity,
    };
  }

  return {
    blockSemanticSelection: false,
    outcome: 'proceed',
    resolvedRegulators: resolvedIndexed,
    entity,
    outside,
  };
}
