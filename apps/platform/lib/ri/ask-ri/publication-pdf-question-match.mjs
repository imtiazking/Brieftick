/**
 * Match user questions to catalogue publications with pdf_primary_v1 evidence.
 */

const TOKEN_RE = /[a-z0-9]+/gi;
const PUBLICATION_UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

/** Step 80 live verifier sample (also used in regression tests). */
export const STEP80_ASK_RI_SAMPLE_QUESTION =
  'What changes is the FCA proposing in CP26/38, and which financial crime controls may be affected?';

/** BUS-UAT-018 — Consumer Duty fair-value publication question (staging catalogue). */
export const CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION =
  "What Consumer Duty fair-value obligations are associated with the FCA publication 'Fair value in consumer finance'? Show the source evidence, including PDF citations. Do not invent regulatory deadlines.";

/** Quoted phrases that may name a catalogue publication title. */
export function extractPublicationTitlePhrases(question) {
  const q = String(question || '');
  const phrases = [];
  for (const m of q.matchAll(/['"]([^'"]{6,240})['"]/g)) {
    const p = m[1].trim();
    if (p) phrases.push(p);
  }
  const named = q.match(/\bpublication\s+['"]([^'"]+)['"]/i);
  if (named?.[1]?.trim()) phrases.push(named[1].trim());
  const webpage = q.match(/\bwebpage\s+['"]([^'"]+)['"]/i);
  if (webpage?.[1]?.trim()) phrases.push(webpage[1].trim());
  return [...new Set(phrases)];
}

/** True when the question names a consultation paper / catalogue publication (CP ref, UUID, or quoted title). */
export function questionMentionsPublicationReference(question) {
  const q = String(question || '');
  if (
    /\bcp\s*\d+\s*\/\s*\d+\b/i.test(q) ||
    /\bcp\s*\d+\s*[-/]\s*\d+\b/i.test(q) ||
    /\bconsultation paper\b/i.test(q)
  ) {
    return true;
  }
  if (PUBLICATION_UUID_RE.test(q)) return true;
  if (/\b(?:FCA|PRA|regulatory)\s+publication\s+['"]/i.test(q)) return true;
  if (/\b(?:FCA|PRA)\s+webpage\s+['"]/i.test(q)) return true;
  if (/\bpublication\s+['"][^'"]+['"]/i.test(q)) return true;
  if (/\bwebpage\s+['"][^'"]+['"]/i.test(q)) return true;
  const quotes = extractPublicationTitlePhrases(q);
  if (
    quotes.some((p) => p.length >= 10) &&
    /\b(fair[- ]value|consumer duty|consumer finance|source evidence|pdf citation|primary pdf|webpage|html[- ]only)/i.test(
      q,
    )
  ) {
    return true;
  }
  return false;
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
    'fair value',
    'consumer duty',
    'consumer finance',
  ];

  for (const phrase of extractPublicationTitlePhrases(question)) {
    const p = phrase.toLowerCase().trim();
    if (p.length >= 6 && (title.includes(p) || title.replace(/\s+/g, ' ').includes(p))) {
      score += 48;
    }
  }
  for (const phrase of topicPhrases) {
    if (q.includes(phrase)) score += 3;
  }

  const htmlArticleEvidence =
    enriched.extractionProfile === 'html_article_v2' ||
    enriched.evidenceMedium === 'fca_webpage' ||
    (enriched.evidenceBlocks?.length && !enriched.structured);
  if (!htmlArticleEvidence && enriched.structured?.pageBoundaryConfirmed !== true) {
    score = Math.min(score, 5);
  }

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

const QUESTION_STOP = new Set([
  'what',
  'does',
  'the',
  'fca',
  'how',
  'might',
  'about',
  'changes',
  'proposed',
  'say',
  'show',
  'including',
  'associated',
  'with',
  'publication',
  'source',
  'evidence',
  'citations',
  'invent',
  'regulatory',
  'deadlines',
  'obligations',
  'duty',
]);

const TOPICAL_PHRASES = [
  'fair value',
  'fair-value',
  'consumer duty',
  'consumer finance',
  'price and value',
  'value outcome',
  'assessing value',
  'value assessment',
  'monitoring value',
];

function normalisePhrase(p) {
  return String(p || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function questionTopicAnchors(question) {
  const q = normalisePhrase(question);
  const anchors = [];
  for (const phrase of TOPICAL_PHRASES) {
    const norm = phrase.replace('-', ' ');
    if (q.includes(norm) || q.includes(phrase)) anchors.push(norm);
  }
  if (/fair[- ]?value|consumer duty/i.test(q)) {
    anchors.push('chapter 7', 'price and value');
  }
  return [...new Set(anchors)];
}

function isFrontMatterOrNavigationalBlock(block) {
  const text = String(block.extractedText || '');
  const textLc = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const section = String(block.sectionReference || '').toLowerCase();
  const haystack = `${section} ${textLc}`;

  if (/^(about this|who should read|foreword|ministerial|summary of (changes|feedback)|how to respond)/i.test(textLc)) {
    return true;
  }
  if (/table of contents\b|^contents\b/i.test(textLc) && textLc.length < 1200) return true;
  if (/^chapter\s+\d+\s*[-–—]\s*chapter\s+\d+/i.test(textLc) && textLc.length < 400) return true;

  const substantiveTopic =
    /chapter\s*7|price and value outcome|the price and value|\b7\.\d{1,2}\b|assessing value|value assessment and monitoring/i.test(
      haystack,
    );
  if (substantiveTopic) return false;

  const pageNum = block.pageNumber;
  if (pageNum != null && pageNum <= 8) {
  const looksLikeIntro =
      /(finalised guidance|finalized guidance|consumer duty|fg\s*22|this guidance|we are publishing|sets out our expectations)/i.test(
        textLc,
      ) && !/7\.\d+|chapter\s*7|price and value|assessing value/i.test(haystack);
    if (looksLikeIntro) return true;
  }
  return false;
}

/**
 * Lexical + topical relevance score for a single evidence block (higher = more substantively on-topic).
 * @param {string} question
 * @param {object} block
 */
export function scoreEvidenceBlockForQuestion(question, block) {
  const qLc = normalisePhrase(question);
  const text = String(block.extractedText || '');
  const textLc = text.toLowerCase();
  const section = String(block.sectionReference || '');
  let score = 0;

  for (const anchor of questionTopicAnchors(question)) {
    if (textLc.includes(anchor) || section.toLowerCase().includes(anchor)) score += 14;
  }

  const qTokens = tokens(question);
  const keywords = [...qTokens].filter((t) => t.length > 3 && !QUESTION_STOP.has(t));
  let hits = 0;
  for (const k of keywords) {
    if (textLc.includes(k)) {
      hits += 1;
      score += k.length >= 8 ? 4 : 2;
    }
  }

  if (/fair[- ]?value|consumer duty|consumer finance|obligation/i.test(qLc)) {
    if (/chapter\s*7|price and value|the price and value outcome/i.test(`${section} ${textLc}`)) score += 30;
    if (/^7\.\d+/i.test(section) || /\b7\.\d{1,2}\b/.test(text.slice(0, 200))) score += 24;
    if (block.kind === 'numbered_clause' && /^7\./i.test(section)) score += 28;
    if (/assessing value|value assessment|monitoring value|fair value for customers/i.test(textLc)) score += 18;
  }

  if (text.length >= 140) score += 4;
  if (text.length >= 80 && /\b(should|must|firms?|customers?|products?|price|value|outcome)\b/i.test(text)) score += 3;

  if (isFrontMatterOrNavigationalBlock(block)) score -= 90;
  if (text.length < 50 && hits <= 1) score -= 25;

  return Math.max(0, score);
}

/**
 * Rank evidence blocks by topical relevance (physical-page citations only).
 * @param {string} question
 * @param {object[]} blocks
 */
export function rankEvidenceBlocksForQuestion(question, blocks) {
  return (blocks || [])
    .map((b) => {
      const score = scoreEvidenceBlockForQuestion(question, b);
      return { block: b, score, hits: score > 0 ? 1 : 0 };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Prefer substantively scored blocks for citation surfaces (drops weak intro/navigational hits when richer evidence exists).
 * @param {ReturnType<typeof rankEvidenceBlocksForQuestion>} ranked
 * @param {number} max
 */
export function selectRankedBlocksForCitations(ranked, max = 5) {
  if (!ranked?.length) return [];
  const withoutFront = ranked.filter((r) => !isFrontMatterOrNavigationalBlock(r.block));
  const substantive = withoutFront.filter((r) => r.score >= 24);
  if (substantive.length >= 2) return substantive.slice(0, max);
  const moderate = withoutFront.filter((r) => r.score >= 14);
  if (moderate.length >= 2) return moderate.slice(0, max);
  const use = withoutFront.length ? withoutFront : ranked;
  return use.slice(0, max);
}
