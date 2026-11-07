/**
 * Match user questions to catalogue publications with pdf_primary_v1 evidence.
 */

const TOKEN_RE = /[a-z0-9]+/gi;

/** Step 80 live verifier sample (also used in regression tests). */
export const STEP80_ASK_RI_SAMPLE_QUESTION =
  'What changes is the FCA proposing in CP26/38, and which financial crime controls may be affected?';

/** True when the question names a consultation paper / publication reference (e.g. CP26/38). */
export function questionMentionsPublicationReference(question) {
  const q = String(question || '');
  return (
    /\bcp\s*\d+\s*\/\s*\d+\b/i.test(q) ||
    /\bcp\s*\d+\s*[-/]\s*\d+\b/i.test(q) ||
    /\bconsultation paper\b/i.test(q)
  );
}

function tokens(text) {
  return new Set(String(text || '').toLowerCase().match(TOKEN_RE) || []);
}

/**
 * @param {object} evidence
 */
export function inferPublicationReferenceFromEvidence(evidence) {
  if (evidence?.publicationReference) return String(evidence.publicationReference);
  const url = String(evidence?.canonicalUrl || '');
  const title = String(evidence?.publicationTitle || '');
  const fromUrl = /cp\s*(\d+)\s*[-/]\s*(\d+)/i.exec(url);
  if (fromUrl) return `CP${fromUrl[1]}/${fromUrl[2]}`;
  const fromTitle = /cp\s*(\d+)\s*[/:]\s*(\d+)/i.exec(title);
  if (fromTitle) return `CP${fromTitle[1]}/${fromTitle[2]}`;
  const ext = evidence?.publicationMetadata?.externalDocumentId || evidence?.publicationExternalId;
  if (ext) return String(ext);
  return null;
}

/**
 * Fill publication matching fields from DB row / index (no CP26 hardcoding).
 * @param {object} evidence
 * @param {object} [supplemental]
 */
export function enrichPublicationPdfEvidenceForMatching(evidence, supplemental = {}) {
  const merged = {
    ...evidence,
    ...supplemental,
    publicationTitle:
      supplemental.publicationTitle ?? evidence.publicationTitle ?? evidence.publication_title ?? null,
    canonicalUrl:
      supplemental.canonicalUrl ??
      evidence.canonicalUrl ??
      evidence.publication_canonical_url ??
      evidence.publication_metadata?.canonicalUrl ??
      null,
    publicationExternalId:
      supplemental.publicationExternalId ??
      evidence.publicationExternalId ??
      evidence.publication_external_document_id ??
      null,
  };
  merged.publicationReference =
    supplemental.publicationReference ?? inferPublicationReferenceFromEvidence(merged);
  if (supplemental.integrityVerified !== undefined) {
    merged.integrityVerified = supplemental.integrityVerified;
  } else if (merged.integrityVerified === undefined && merged._verifiedPipeline === true) {
    merged.integrityVerified = true;
  }
  return merged;
}

/**
 * @param {object} evidence publicationPdfEvidence entry
 * @param {string} question
 * @param {{ requireIntegrityVerified?: boolean }} [options]
 */
export function scorePublicationQuestionMatch(evidence, question, options = {}) {
  const requireIntegrity =
    options.requireIntegrityVerified !== undefined ? options.requireIntegrityVerified : true;
  const enriched = enrichPublicationPdfEvidenceForMatching(evidence);

  if (requireIntegrity && enriched.integrityVerified !== true) {
    return 0;
  }

  const q = String(question || '').toLowerCase();
  const qTokens = tokens(q);
  let score = 0;

  const title = String(enriched.publicationTitle || '').toLowerCase();
  const ref = String(enriched.publicationReference || '').toLowerCase().replace(/\s/g, '');
  const url = String(enriched.canonicalUrl || '').toLowerCase();
  const identityHaystack = `${ref} ${url} ${title}`;

  if (ref && q.replace(/\s/g, '').includes(ref)) score += 50;

  const cpRefInQuestion = q.match(/\bcp\s*(\d+)\s*\/\s*(\d+)\b/i);
  if (cpRefInQuestion) {
    const needle = `cp${cpRefInQuestion[1]}/${cpRefInQuestion[2]}`;
    if (identityHaystack.replace(/\s/g, '').includes(needle) || url.includes(`cp${cpRefInQuestion[1]}-${cpRefInQuestion[2]}`)) {
      score += 60;
    }
  }

  for (const t of qTokens) {
    if (t.length < 4) continue;
    if (title.includes(t)) score += 4;
    if (url.includes(t)) score += 2;
  }

  const topicPhrases = [
    'financial crime',
    'systems and controls',
    'fraud prevention',
    'customer due diligence',
    'sanctions screening',
    'aml',
    'money laundering',
  ];
  for (const phrase of topicPhrases) {
    if (q.includes(phrase)) score += 3;
  }

  if (enriched.structured?.pageBoundaryConfirmed !== true) score = Math.min(score, 5);

  return score;
}

/**
 * @param {object[]} evidenceList
 * @param {string} question
 */
export function selectBestPublicationPdfEvidence(evidenceList, question) {
  const ranked = (evidenceList || [])
    .map((e) => ({ evidence: e, score: scorePublicationQuestionMatch(e, question) }))
    .filter((r) => r.score >= 8)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.evidence || null;
}

/**
 * Rank evidence blocks by keyword overlap with the question (physical-page citations only).
 * @param {string} question
 * @param {object[]} blocks
 */
export function rankEvidenceBlocksForQuestion(question, blocks) {
  const qTokens = tokens(question);
  const stop = new Set(['what', 'does', 'the', 'fca', 'how', 'might', 'about', 'changes', 'proposed', 'say']);
  const keywords = [...qTokens].filter((t) => t.length > 3 && !stop.has(t));

  return (blocks || [])
    .map((b) => {
      const text = String(b.extractedText || '').toLowerCase();
      let hits = 0;
      for (const k of keywords) {
        if (text.includes(k)) hits += 1;
      }
      return { block: b, hits };
    })
    .filter((r) => r.hits > 0)
    .sort((a, b) => b.hits - a.hits);
}
