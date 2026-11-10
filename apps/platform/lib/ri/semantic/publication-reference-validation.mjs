/**
 * Explicit publication reference validation before semantic retrieval (offline).
 */

import { extractPublicationTitlePhrases } from '../ask-ri/publication-pdf-question-match.mjs';
import { buildRegulatoryCatalogueFromPacks, normalizeFcaRef } from './build-regulatory-catalogue.mjs';

const PUBLICATION_UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

const STRUCTURED_REF_RE =
  /\b(CP|PS|FG|DP|TR)\s*(\d{1,3})\s*\/\s*(\d{1,2})\b/gi;

const HANDBOOK_BLOCK_RE =
  /\b(COBS|SYSC|PRIN|MIFID|CASS|CONC|ICOBS|MCOB|BCOBS|MAR|SUP)\b/i;

function extractStructuredRefs(question) {
  const q = String(question || '');
  const refs = [];
  for (const m of q.matchAll(STRUCTURED_REF_RE)) {
    refs.push({
      raw: m[0],
      normalized: normalizeFcaRef(m[1], m[2], m[3]),
      kind: m[1].toUpperCase(),
    });
  }
  return refs;
}

function extractUuids(question) {
  return [...String(question || '').matchAll(PUBLICATION_UUID_RE)].map((m) => m[0].toLowerCase());
}

function extractExplicitTitleRefs(question) {
  const q = String(question || '');
  const out = [];
  if (!/\b(?:FCA|PRA|publication|policy statement|consultation paper|finalised guidance|guidance)\b/i.test(q)) {
    return out;
  }
  for (const phrase of extractPublicationTitlePhrases(q)) {
    out.push({ phrase, matchMode: 'quoted_explicit' });
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
    });
  }
  return out;
}

function resolveStructuredRef(ref, catalogue, indexedPublicationIds) {
  const hit = catalogue.byRef.get(ref.normalized.toUpperCase());
  if (!hit) {
    return {
      ref,
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
    status: indexed ? 'resolved_indexed' : 'in_catalogue_not_indexed',
    publicationId: hit.publicationId,
    publicationTitle: hit.publicationTitle,
    indexed,
    message: indexed ? null : 'Publication is catalogued for this run but has no indexed evidence pack.',
  };
}

function resolveUuid(uuid, catalogue, indexedPublicationIds) {
  const hit = catalogue.byUuid.get(uuid);
  if (!hit) {
    return {
      ref: { uuid },
      status: 'uuid_not_in_offline_catalogue',
      publicationId: null,
      indexed: false,
      message:
        'Publication UUID is not present in the authorised offline catalogue (does not imply the UUID is globally invalid).',
    };
  }
  return {
    ref: { uuid },
    status: indexedPublicationIds.has(hit.publicationId) ? 'resolved_indexed' : 'in_catalogue_not_indexed',
    publicationId: hit.publicationId,
    publicationTitle: hit.publicationTitle,
    indexed: indexedPublicationIds.has(hit.publicationId),
    message: null,
  };
}

function resolveTitlePhrase(phrase, catalogue, indexedPublicationIds) {
  const key = String(phrase).trim().toLowerCase();
  const exact = catalogue.byTitle.get(key);
  if (exact) {
    return {
      ref: { phrase },
      status: indexedPublicationIds.has(exact.publicationId) ? 'resolved_indexed' : 'in_catalogue_not_indexed',
      publicationId: exact.publicationId,
      publicationTitle: exact.publicationTitle,
      indexed: indexedPublicationIds.has(exact.publicationId),
    };
  }
  const fuzzy = catalogue.entries.find((e) => e.publicationTitle?.toLowerCase() === key);
  if (fuzzy) {
    return {
      ref: { phrase },
      status: indexedPublicationIds.has(fuzzy.publicationId) ? 'resolved_indexed' : 'in_catalogue_not_indexed',
      publicationId: fuzzy.publicationId,
      publicationTitle: fuzzy.publicationTitle,
      indexed: indexedPublicationIds.has(fuzzy.publicationId),
    };
  }
  return {
    ref: { phrase },
    status: 'title_not_in_offline_catalogue',
    publicationId: null,
    indexed: false,
    message: 'Quoted publication title does not match an entry in the offline catalogue.',
  };
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
  const handbookHit = HANDBOOK_BLOCK_RE.test(String(question || ''));

  const resolutions = [
    ...structured.map((r) => resolveStructuredRef(r, catalogue, indexedPublicationIds)),
    ...uuids.map((u) => resolveUuid(u, catalogue, indexedPublicationIds)),
    ...titles.map((t) => resolveTitlePhrase(t.phrase, catalogue, indexedPublicationIds)),
  ];

  const hasExplicit = structured.length > 0 || uuids.length > 0 || titles.length > 0;
  if (!hasExplicit && !handbookHit) {
    return {
      hasExplicitReference: false,
      resolutions: [],
      restrictToPublicationIds: null,
      blockSemanticSelection: false,
      abstainReason: null,
      outcome: 'no_explicit_reference',
    };
  }

  if (handbookHit && !hasExplicit) {
    return {
      hasExplicitReference: true,
      resolutions: [
        {
          ref: { handbook: String(question).match(HANDBOOK_BLOCK_RE)?.[0] },
          status: 'handbook_not_in_offline_catalogue',
          publicationId: null,
          indexed: false,
          message:
            'Handbook module reference is outside the offline publication index for this experiment.',
        },
      ],
      restrictToPublicationIds: null,
      blockSemanticSelection: true,
      abstainReason: 'handbook_source_not_indexed',
      outcome: 'abstain_handbook_reference',
    };
  }

  const resolvedIndexed = resolutions.filter((r) => r.status === 'resolved_indexed');
  const unresolved = resolutions.filter(
    (r) =>
      r.status === 'not_in_offline_catalogue' ||
      r.status === 'uuid_not_in_offline_catalogue' ||
      r.status === 'title_not_in_offline_catalogue' ||
      r.status === 'in_catalogue_not_indexed',
  );

  const restrictIds = resolvedIndexed.map((r) => r.publicationId).filter(Boolean);
  const uniqueRestrict = [...new Set(restrictIds)];

  let blockSemanticSelection = false;
  let abstainReason = null;
  let outcome = 'mixed';

  if (unresolved.length > 0) {
    blockSemanticSelection = true;
    const first = unresolved[0];
    abstainReason =
      first.status === 'not_in_offline_catalogue' || first.status === 'uuid_not_in_offline_catalogue'
        ? 'unresolved_explicit_publication_reference'
        : first.status === 'in_catalogue_not_indexed'
          ? 'publication_not_in_offline_index'
          : 'unresolved_explicit_title';
    outcome = 'abstain_unresolved_reference';
  } else if (uniqueRestrict.length === 1) {
    outcome = 'restrict_single_publication';
  } else if (uniqueRestrict.length > 1) {
    outcome = 'restrict_multiple_publications';
  }

  if (uuids.length > 0 && structured.some((s) => /\bFG|CP|PS/i.test(s.normalized))) {
    const uuidRes = resolutions.filter((r) => r.ref?.uuid);
    const refRes = resolutions.filter((r) => r.ref?.normalized);
    if (
      uuidRes.some((u) => u.status.includes('not_in')) &&
      refRes.some((s) => s.status === 'resolved_indexed' && s.publicationId)
    ) {
      blockSemanticSelection = true;
      abstainReason = 'conflicting_uuid_and_structured_reference';
      outcome = 'abstain_reference_conflict';
    }
  }

  return {
    hasExplicitReference: true,
    resolutions,
    restrictToPublicationIds: blockSemanticSelection ? null : uniqueRestrict.length ? uniqueRestrict : null,
    blockSemanticSelection,
    abstainReason,
    outcome,
  };
}

/** @deprecated Use validateExplicitPublicationReferences — kept for pilot re-exports */
export function validatePublicationReference(question, rankedPublications, catalogue, indexedIds) {
  if (!catalogue) {
    const ids = extractUuids(question);
    const fakeOnly = ids.length === 1 && ids[0] === '00000000-0000-4000-8000-000000000001';
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
