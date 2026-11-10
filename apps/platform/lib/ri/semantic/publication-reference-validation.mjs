/**
 * Explicit publication reference validation before semantic retrieval (offline).
 */

import { extractPublicationTitlePhrases } from '../ask-ri/publication-pdf-question-match.mjs';
import { buildRegulatoryCatalogueFromPacks, normalizeFcaRef } from './build-regulatory-catalogue.mjs';

const PUBLICATION_UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

const STRUCTURED_REF_RE =
  /\b(CP|PS|FG|DP|TR)\s*(\d{1,3})\s*\/\s*(\d{1,2})\b/gi;

const HANDBOOK_MODULE_RE =
  /\b(COBS|SYSC|PRIN|MIFID|CASS|CONC|ICOBS|MCOB|BCOBS|MAR|SUP)\b(?:\s+[\dA-Z]+(?:\.[\dA-Z]+)*)?/gi;

const PUBLICATION_BLOCKING_STATUSES = new Set([
  'not_in_offline_catalogue',
  'uuid_not_in_offline_catalogue',
  'in_catalogue_not_indexed',
]);

export const REFERENCE_CLASSIFICATIONS = {
  PUBLICATION_STRUCTURED: 'publication_structured',
  PUBLICATION_UUID: 'publication_uuid',
  PUBLICATION_TITLE: 'publication_title',
  FCA_HANDBOOK: 'fca_handbook',
  NO_EXPLICIT: 'no_explicit_reference',
};

function extractStructuredRefs(question) {
  const q = String(question || '');
  const refs = [];
  for (const m of q.matchAll(STRUCTURED_REF_RE)) {
    refs.push({
      raw: m[0],
      normalized: normalizeFcaRef(m[1], m[2], m[3]),
      kind: m[1].toUpperCase(),
      classification: REFERENCE_CLASSIFICATIONS.PUBLICATION_STRUCTURED,
    });
  }
  return refs;
}

function extractHandbookRefs(question) {
  const q = String(question || '');
  const refs = [];
  for (const m of q.matchAll(HANDBOOK_MODULE_RE)) {
    refs.push({
      raw: m[0],
      module: m[1].toUpperCase(),
      classification: REFERENCE_CLASSIFICATIONS.FCA_HANDBOOK,
    });
  }
  return refs;
}

function extractUuids(question) {
  return [...String(question || '').matchAll(PUBLICATION_UUID_RE)].map((m) => ({
    uuid: m[0].toLowerCase(),
    raw: m[0],
    classification: REFERENCE_CLASSIFICATIONS.PUBLICATION_UUID,
  }));
}

function extractExplicitTitleRefs(question) {
  const q = String(question || '');
  const out = [];
  if (!/\b(?:FCA|PRA|publication|policy statement|consultation paper|finalised guidance|guidance)\b/i.test(q)) {
    return out;
  }
  for (const phrase of extractPublicationTitlePhrases(q)) {
    out.push({ phrase, matchMode: 'quoted_explicit', classification: REFERENCE_CLASSIFICATIONS.PUBLICATION_TITLE });
  }
  const titled = q.match(
    /\b(?:Policy Statement|Consultation Paper|Finalised Guidance|Discussion Paper|Technical Resource)\s+(?:PS|CP|FG|DP|TR)?\s*(\d{1,3})\s*\/\s*(\d{1,2})\b/i,
  );
  if (titled) {
    const kind =
      /policy statement/i.test(q) ? 'PS' : /consultation/i.test(q) ? 'CP' : /finalised guidance/i.test(q) ? 'FG' : 'PS';
    out.push({
      phrase: normalizeFcaRef(kind, titled[1], titled[2]),
      matchMode: 'typed_statement',
      classification: REFERENCE_CLASSIFICATIONS.PUBLICATION_TITLE,
    });
  }
  return out;
}

function resolveStructuredRef(ref, catalogue, indexedPublicationIds) {
  const hit = catalogue.byRef.get(ref.normalized.toUpperCase());
  if (!hit) {
    return {
      ref,
      classification: REFERENCE_CLASSIFICATIONS.PUBLICATION_STRUCTURED,
      status: 'not_in_offline_catalogue',
      publicationId: null,
      indexed: false,
      message:
        'Identifier is not present in the authorised offline catalogue for this experiment (does not imply absence from the global regulatory catalogue).',
    };
  }
  const indexed = indexedPublicationIds.has(hit.publicationId);
  return {
    ref,
    classification: REFERENCE_CLASSIFICATIONS.PUBLICATION_STRUCTURED,
    status: indexed ? 'resolved_indexed' : 'in_catalogue_not_indexed',
    publicationId: hit.publicationId,
    publicationTitle: hit.publicationTitle,
    indexed,
    message: indexed ? null : 'Publication is catalogued for this run but has no indexed evidence pack.',
  };
}

function resolveUuid(refRow, catalogue, indexedPublicationIds) {
  const uuid = refRow.uuid;
  const hit = catalogue.byUuid.get(uuid);
  if (!hit) {
    return {
      ref: refRow,
      classification: REFERENCE_CLASSIFICATIONS.PUBLICATION_UUID,
      status: 'uuid_not_in_offline_catalogue',
      publicationId: null,
      indexed: false,
      message:
        'Publication UUID is not present in the authorised offline catalogue (does not imply the UUID is globally invalid).',
    };
  }
  return {
    ref: refRow,
    classification: REFERENCE_CLASSIFICATIONS.PUBLICATION_UUID,
    status: indexedPublicationIds.has(hit.publicationId) ? 'resolved_indexed' : 'in_catalogue_not_indexed',
    publicationId: hit.publicationId,
    publicationTitle: hit.publicationTitle,
    indexed: indexedPublicationIds.has(hit.publicationId),
    message: null,
  };
}

function resolveTitlePhrase(phraseRow, catalogue, indexedPublicationIds) {
  const phrase = phraseRow.phrase;
  const key = String(phrase).trim().toLowerCase();
  const exact = catalogue.byTitle.get(key);
  if (exact) {
    return {
      ref: phraseRow,
      classification: REFERENCE_CLASSIFICATIONS.PUBLICATION_TITLE,
      status: indexedPublicationIds.has(exact.publicationId) ? 'resolved_indexed' : 'in_catalogue_not_indexed',
      publicationId: exact.publicationId,
      publicationTitle: exact.publicationTitle,
      indexed: indexedPublicationIds.has(exact.publicationId),
    };
  }
  const fuzzy = catalogue.entries.find((e) => e.publicationTitle?.toLowerCase() === key);
  if (fuzzy) {
    return {
      ref: phraseRow,
      classification: REFERENCE_CLASSIFICATIONS.PUBLICATION_TITLE,
      status: indexedPublicationIds.has(fuzzy.publicationId) ? 'resolved_indexed' : 'in_catalogue_not_indexed',
      publicationId: fuzzy.publicationId,
      publicationTitle: fuzzy.publicationTitle,
      indexed: indexedPublicationIds.has(fuzzy.publicationId),
    };
  }
  return {
    ref: phraseRow,
    classification: REFERENCE_CLASSIFICATIONS.PUBLICATION_TITLE,
    status: 'title_not_in_offline_catalogue',
    publicationId: null,
    indexed: false,
    message: 'Quoted publication title does not match an entry in the offline catalogue.',
  };
}

function handbookResolutions(handbooks) {
  return handbooks.map((h) => ({
    ref: h,
    classification: REFERENCE_CLASSIFICATIONS.FCA_HANDBOOK,
    status: 'handbook_reference_not_publication',
    publicationId: null,
    indexed: false,
    message:
      'FCA Handbook module reference is not a publication identifier; evidence sufficiency is assessed from indexed publications only.',
  }));
}

function resolutionBlocksSelection(resolution, ctx) {
  if (resolution.classification === REFERENCE_CLASSIFICATIONS.FCA_HANDBOOK) return false;
  if (PUBLICATION_BLOCKING_STATUSES.has(resolution.status)) return true;
  if (resolution.status === 'title_not_in_offline_catalogue') {
    return (
      ctx.structured.length === 0 &&
      ctx.uuids.length === 0 &&
      ctx.titles.length > 0 &&
      !ctx.resolutions.some((r) => r.status === 'resolved_indexed')
    );
  }
  return false;
}

/**
 * @param {string} question
 * @param {ReturnType<typeof buildRegulatoryCatalogueFromPacks>} catalogue
 * @param {Set<string>} indexedPublicationIds publications with evidence chunks in the active index
 */
export function validateExplicitPublicationReferences(question, catalogue, indexedPublicationIds) {
  const structured = extractStructuredRefs(question);
  const uuids = extractUuids(question);
  const titles = extractExplicitTitleRefs(question);
  const handbooks = extractHandbookRefs(question);

  const publicationResolutions = [
    ...structured.map((r) => resolveStructuredRef(r, catalogue, indexedPublicationIds)),
    ...uuids.map((u) => resolveUuid(u, catalogue, indexedPublicationIds)),
    ...titles.map((t) => resolveTitlePhrase(t, catalogue, indexedPublicationIds)),
  ];
  const resolutions = [...publicationResolutions, ...handbookResolutions(handbooks)];

  const ctx = { structured, uuids, titles, handbooks, resolutions };
  const hasPublicationExplicit = structured.length > 0 || uuids.length > 0 || titles.length > 0;
  const hasHandbookOnly = handbooks.length > 0 && !hasPublicationExplicit;

  const parsedTokens = {
    publicationStructured: structured.map((r) => r.normalized),
    publicationUuids: uuids.map((u) => u.uuid),
    publicationTitles: titles.map((t) => t.phrase),
    handbookModules: handbooks.map((h) => h.module),
  };

  if (!hasPublicationExplicit && handbooks.length === 0) {
    return {
      hasExplicitReference: false,
      parsedTokens,
      resolutions: [],
      restrictToPublicationIds: null,
      blockSemanticSelection: false,
      abstainReason: null,
      outcome: 'no_explicit_reference',
      blockingCondition: null,
    };
  }

  if (hasHandbookOnly) {
    return {
      hasExplicitReference: true,
      parsedTokens,
      resolutions,
      restrictToPublicationIds: null,
      blockSemanticSelection: false,
      abstainReason: null,
      outcome: 'handbook_open_retrieval',
      blockingCondition: null,
    };
  }

  const blockingRes = publicationResolutions.filter((r) => resolutionBlocksSelection(r, ctx));
  const resolvedIndexed = publicationResolutions.filter((r) => r.status === 'resolved_indexed');
  const restrictIds = [...new Set(resolvedIndexed.map((r) => r.publicationId).filter(Boolean))];

  let blockSemanticSelection = blockingRes.length > 0;
  let abstainReason = null;
  let outcome = 'mixed';
  let blockingCondition = null;

  if (blockSemanticSelection) {
    const first = blockingRes[0];
    abstainReason =
      first.status === 'not_in_offline_catalogue' || first.status === 'uuid_not_in_offline_catalogue'
        ? 'unresolved_explicit_publication_reference'
        : first.status === 'in_catalogue_not_indexed'
          ? 'publication_not_in_offline_index'
          : 'unresolved_explicit_title';
    outcome = 'abstain_unresolved_reference';
    blockingCondition = `publication_reference:${first.status}`;
  } else if (uniqueRestrictLength(restrictIds) === 1) {
    outcome = 'restrict_single_publication';
  } else if (uniqueRestrictLength(restrictIds) > 1) {
    outcome = 'restrict_multiple_publications';
  } else if (hasPublicationExplicit) {
    outcome = 'open_retrieval_with_explicit_anchors';
  }

  if (uuids.length > 0 && structured.some((s) => /\bFG|CP|PS/i.test(s.normalized))) {
    const uuidRes = publicationResolutions.filter((r) => r.classification === REFERENCE_CLASSIFICATIONS.PUBLICATION_UUID);
    const refRes = publicationResolutions.filter(
      (r) => r.classification === REFERENCE_CLASSIFICATIONS.PUBLICATION_STRUCTURED,
    );
    if (
      uuidRes.some((u) => PUBLICATION_BLOCKING_STATUSES.has(u.status) || u.status === 'uuid_not_in_offline_catalogue') &&
      refRes.some((s) => s.status === 'resolved_indexed' && s.publicationId)
    ) {
      blockSemanticSelection = true;
      abstainReason = 'conflicting_uuid_and_structured_reference';
      outcome = 'abstain_reference_conflict';
      blockingCondition = 'reference_conflict';
    }
  }

  return {
    hasExplicitReference: true,
    parsedTokens,
    resolutions,
    restrictToPublicationIds: blockSemanticSelection ? null : restrictIds.length ? restrictIds : null,
    blockSemanticSelection,
    abstainReason,
    outcome,
    blockingCondition,
  };
}

function uniqueRestrictLength(ids) {
  return new Set(ids).size;
}

/** Diagnostics helper for eval regression (no side effects). */
export function diagnoseExplicitPublicationReferences(question, catalogue, indexedPublicationIds) {
  const v = validateExplicitPublicationReferences(question, catalogue, indexedPublicationIds);
  return {
    parsedTokens: v.parsedTokens,
    outcome: v.outcome,
    blockSemanticSelection: v.blockSemanticSelection,
    blockingCondition: v.blockingCondition,
    resolutions: (v.resolutions || []).map((r) => ({
      classification: r.classification,
      status: r.status,
      publicationId: r.publicationId,
      ref: r.ref,
    })),
  };
}

/** @deprecated Use validateExplicitPublicationReferences — kept for pilot re-exports */
export function validatePublicationReference(question, rankedPublications, catalogue, indexedIds) {
  if (!catalogue) {
    const ids = extractUuids(question);
    const fakeOnly = ids.length === 1 && ids[0].uuid === '00000000-0000-4000-8000-000000000001';
    return {
      blockSelection: fakeOnly,
      reason: fakeOnly ? 'fabricated_uuid_strict_validation' : null,
      cf04Risk: false,
    };
  }
  const v = validateExplicitPublicationReferences(question, catalogue, indexedIds);
  return {
    blockSelection: v.blockSemanticSelection,
    reason: v.abstainReason,
    cf04Risk: v.outcome === 'abstain_reference_conflict',
    detail: v,
  };
}
