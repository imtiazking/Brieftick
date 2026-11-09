/**
 * Ask RI — html_article_v2 catalogue webpage evidence (FCA publication pages).
 */
import { createHash } from 'node:crypto';
import {
  enrichPublicationPdfEvidenceForMatching,
  rankEvidenceBlocksForQuestion,
  scorePublicationQuestionMatch,
  selectBestPublicationPdfEvidence,
} from './publication-pdf-question-match.mjs';

function stableHtmlEvidenceId(publicationId, revisionId, seq, text) {
  return createHash('sha256')
    .update(`${publicationId}:${revisionId}:${seq}:${text.slice(0, 80)}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * @param {object} ctx
 */
export function buildHtmlArticleEvidenceBlocks(ctx) {
  const text = String(ctx.normalisedArticleText || '').replace(/\r\n/g, '\n');
  const blocks = [];
  const chunks = text.split(/\n{2,}/).map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.length >= 35);
  let seq = 0;
  let currentSection = 'Article body';
  for (const chunk of chunks) {
    const heading = chunk.match(/^(PRIN\s+[\dA-Z.]+|FG\s*\d+\s*\/\s*\d+|Chapter\s+\d+)/i);
    if (heading) currentSection = heading[1].replace(/\s+/g, ' ').trim();
    seq += 1;
    blocks.push({
      documentEvidenceId: stableHtmlEvidenceId(ctx.publicationId, ctx.extractionRevisionId, seq, chunk),
      publicationId: ctx.publicationId,
      extractionRevisionId: ctx.extractionRevisionId,
      extractionProfile: 'html_article_v2',
      sectionReference: currentSection,
      extractedText: chunk,
      evidenceKind: classifyHtmlPassageKind(chunk),
      pageBoundaryConfirmed: true,
    });
  }
  return blocks;
}

function classifyHtmlPassageKind(text) {
  const t = String(text).toLowerCase();
  if (/\b(good practice|poor practice|case study|example of)\b/.test(t)) return 'supervisory_example';
  if (/\b(prin\s+2a\.4|rules?\s+require|must\s+ensure|obligation)\b/.test(t)) return 'regulatory_reference';
  if (/\b(finalised guidance|guidance\s+for firms)\b/.test(t)) return 'guidance_reference';
  return 'webpage_narrative';
}

export function buildPublicationHtmlEvidenceIndex(revisionRow, artefacts) {
  const metaParsed = artefacts.metaParsed || {};
  return {
    publicationId: revisionRow.publication_id,
    extractionRevisionId: revisionRow.id,
    extractionProfile: 'html_article_v2',
    canonicalUrl: revisionRow.canonical_url || metaParsed?.publicationMetadata?.canonicalUrl,
    publicationMetadata: revisionRow.publication_metadata || metaParsed?.publicationMetadata,
    extractionQuality: revisionRow.extraction_quality || metaParsed?.extractionQuality,
    pdfAttachments: revisionRow.pdf_attachments || metaParsed?.pdfAttachments || [],
    normalisedArticleText: artefacts.text,
    normalisedArticleHtml: artefacts.html,
      evidenceBlocks: artefacts.evidenceBlocks || [],
      extractionProfile: 'html_article_v2',
      evidenceMedium: 'fca_webpage',
      integrityVerified: artefacts.integrityVerified === true,
    obligationGradeSuitable: (revisionRow.extraction_quality || metaParsed?.extractionQuality)
      ?.obligationGradeSuitable,
  };
}

/**
 * @param {object} publicationEvidence
 * @param {string} question
 */
export function answerAskRiFromPublicationHtmlEvidence(publicationEvidence, question) {
  const ctx = enrichPublicationPdfEvidenceForMatching(publicationEvidence);
  const matchScore = scorePublicationQuestionMatch(ctx, question, { requireIntegrityVerified: false });

  if (ctx.integrityVerified !== true) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      answer: 'Stored FCA webpage evidence failed integrity verification.',
      citations: [],
      audit: { evidenceSource: 'html_article_v2', matchScore },
    };
  }

  if (!ctx.evidenceBlocks?.length) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      answer: 'No html_article_v2 text blocks are available for this publication.',
      citations: [],
      audit: { evidenceSource: 'html_article_v2', matchScore },
    };
  }

  const webOk = ctx.extractionQuality?.webpageExtraction?.status === 'complete';
  if (!webOk) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      answer: 'Webpage extraction is not marked complete for this publication version.',
      citations: [],
      audit: { evidenceSource: 'html_article_v2', matchScore, extractionQuality: ctx.extractionQuality },
    };
  }

  if (matchScore < 8) {
    return {
      status: 'UNRESOLVED',
      answer: 'This question is not mapped to this FCA webpage evidence.',
      citations: [],
      audit: { evidenceSource: 'html_article_v2', matchScore, publicationTitle: ctx.publicationTitle },
    };
  }

  const rankedBlocks = rankEvidenceBlocksForQuestion(question, ctx.evidenceBlocks);
  if (!rankedBlocks.length) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      answer:
        'The stored FCA webpage does not contain verified passages that answer this question. No answer was fabricated.',
      citations: [],
      audit: { evidenceSource: 'html_article_v2', matchScore },
    };
  }

  const citationSource = {
    regulatoryAuthority: ctx.regulatorLabel || 'Financial Conduct Authority',
    regulatorShortName: ctx.regulatorShortName || 'FCA',
    publicationTitle: ctx.publicationTitle,
    publicationReference: ctx.publicationReference,
    sourceUrl: ctx.canonicalUrl,
    extractionRevisionId: ctx.extractionRevisionId,
    publicationId: ctx.publicationId,
    evidenceMedium: 'fca_webpage',
  };

  const citations = rankedBlocks.slice(0, 8).map((r) => formatHtmlArticleCitation(citationSource, r.block));
  const answer = composeHtmlSubstantiveAnswer({ question, citationSource, rankedBlocks, citations, ctx });

  return {
    status: 'ANSWERED',
    answer,
    citations,
    audit: {
      evidenceSource: 'html_article_v2',
      matchScore,
      synthesisMode: 'deterministic_webpage_grounded',
      humanReviewStatus: 'pending_review',
      mustNotPresentAsBindingObligation: false,
      distinguishesExamplesFromObligations: true,
    },
  };
}

export function answerAskRiFromBestPublicationHtmlEvidence(evidenceList, question) {
  const best = selectBestPublicationPdfEvidence(evidenceList, question);
  if (!best) {
    return {
      status: 'UNRESOLVED',
      answer: null,
      citations: [],
      audit: { evidenceSource: 'html_article_v2', matchScore: 0 },
    };
  }
  return answerAskRiFromPublicationHtmlEvidence(best, question);
}

function formatHtmlArticleCitation(ctx, block) {
  const ref = ctx.publicationTitle || 'FCA publication';
  const regulator = ctx.regulatorShortName || 'FCA';
  const kind = block.evidenceKind || 'webpage_narrative';
  const kindLabel =
    kind === 'supervisory_example'
      ? 'supervisory example (not a new obligation)'
      : kind === 'regulatory_reference'
        ? 'regulatory cross-reference'
        : 'webpage source';
  return {
    type: 'html_article_v2',
    regulatoryAuthority: ctx.regulatoryAuthority,
    regulatorShortName: ctx.regulatorShortName,
    publicationTitle: ctx.publicationTitle,
    publicationReference: ctx.publicationReference,
    sourceUrl: ctx.sourceUrl,
    sectionReference: block.sectionReference,
    excerpt: String(block.extractedText || '').slice(0, 600),
    extractionRevisionId: ctx.extractionRevisionId,
    publicationId: ctx.publicationId,
    evidenceId: block.documentEvidenceId,
    regulatoryStatus: kind === 'supervisory_example' ? 'supervisory_example' : 'source_supported',
    citationLabel: `${regulator} — ${ref} — ${block.sectionReference} (${kindLabel}; FCA webpage)`,
    mustNotPresentAsBindingObligation: kind === 'supervisory_example',
    attributedPublicationId: ctx.publicationId,
  };
}

function composeHtmlSubstantiveAnswer({ question, citationSource, rankedBlocks, citations, ctx }) {
  const refLabel = citationSource.publicationTitle || 'this FCA publication';
  const parts = [];
  parts.push(
    `${citationSource.regulatoryAuthority} webpage “${refLabel}” (${citationSource.sourceUrl || 'catalogue canonical URL'}). Summary from verified html_article_v2 text only — not generative AI.`,
  );

  const mentionsPrin = /prin\s*2a\.4/i.test(question) || rankedBlocks.some((r) => /PRIN\s+2A\.4/i.test(r.block.extractedText));
  if (mentionsPrin) {
    parts.push(
      'The webpage references PRIN 2A.4 (Consumer Duty / fair value). Cross-references to rule text are signposted on the page; binding wording sits in the Handbook, not in this supervisory narrative.',
    );
  }

  const mentionsFg = /FG\s*22\s*\/\s*5|FG22/i.test(question) || (ctx.pdfAttachments || []).some((a) => /fg\s*22/i.test(`${a.title} ${a.url}`));
  if (mentionsFg) {
    parts.push(
      'FG22/5 is separately published FCA guidance (PDF). Webpage citations below are not FG22/5 page extracts unless explicitly labelled as a linked PDF publication in the catalogue.',
    );
  }

  const exampleBlocks = rankedBlocks.filter((r) => r.block.evidenceKind === 'supervisory_example').slice(0, 2);
  const narrativeBlocks = rankedBlocks.filter((r) => r.block.evidenceKind !== 'supervisory_example').slice(0, 3);

  for (const r of narrativeBlocks) {
    const t = String(r.block.extractedText || '').replace(/\s+/g, ' ').trim();
    parts.push(`Source narrative (${r.block.sectionReference}): "${t.slice(0, 220)}${t.length > 220 ? '…' : ''}"`);
  }
  for (const r of exampleBlocks) {
    const t = String(r.block.extractedText || '').replace(/\s+/g, ' ').trim();
    parts.push(
      `Supervisory example (${r.block.sectionReference}) — illustrates good/poor practice, not a new firm obligation: "${t.slice(0, 180)}${t.length > 180 ? '…' : ''}"`,
    );
  }

  parts.push(
    `${citations.length} FCA webpage citation(s) below. No regulatory deadlines were invented. Human review required before compliance decisions.`,
  );

  return parts.join(' ');
}
