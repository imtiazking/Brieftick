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
function stripHtmlTags(fragment) {
  return String(fragment || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pushHtmlBlock(blocks, ctx, seq, sectionReference, extractedText) {
  const chunk = String(extractedText || '').replace(/\s+/g, ' ').trim();
  if (chunk.length < 35) return seq;
  const next = seq + 1;
  blocks.push({
    documentEvidenceId: stableHtmlEvidenceId(ctx.publicationId, ctx.extractionRevisionId, next, chunk),
    publicationId: ctx.publicationId,
    extractionRevisionId: ctx.extractionRevisionId,
    extractionProfile: 'html_article_v2',
    sectionReference,
    extractedText: chunk,
    evidenceKind: classifyHtmlPassageKind(chunk),
    pageBoundaryConfirmed: true,
  });
  return next;
}

/**
 * Section blocks from normalised HTML headings (FCA article pages) with text fallback.
 */
export function buildHtmlArticleEvidenceBlocks(ctx) {
  const text = String(ctx.normalisedArticleText || '').replace(/\r\n/g, '\n');
  const html = String(ctx.normalisedArticleHtml || '');
  const blocks = [];
  let seq = 0;

  if (html.includes('<h')) {
    const sections = html.split(/(?=<h[1-4]\b)/i);
    for (const section of sections) {
      const headingMatch = section.match(/^<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/i);
      if (!headingMatch) continue;
      const heading = stripHtmlTags(headingMatch[2]) || 'Section';
      const bodyHtml = section.slice(headingMatch[0].length);
      const body = stripHtmlTags(bodyHtml);
      if (body.length < 35) continue;
      const parts = body.split(/(?<=[.!?])\s+(?=[A-Z])/).filter((p) => p.length >= 35);
      if (parts.length <= 1) {
        seq = pushHtmlBlock(blocks, ctx, seq, heading, body);
      } else {
        for (const part of parts.slice(0, 12)) {
          seq = pushHtmlBlock(blocks, ctx, seq, heading, part);
        }
      }
    }
  }

  if (!blocks.length) {
    const chunks = text
      .split(/\n{2,}/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter((p) => p.length >= 35);
    let currentSection = 'Article body';
    for (const chunk of chunks) {
      const heading = chunk.match(
        /^(PRIN\s+[\dA-Z.]+|FG\s*\d+\s*\/\s*\d+|Chapter\s+\d+|Fair value|Good practice|Poor practice|Consumer Duty|Examples? of)/i,
      );
      if (heading) currentSection = heading[1].replace(/\s+/g, ' ').trim();
      seq = pushHtmlBlock(blocks, ctx, seq, currentSection, chunk);
    }
  }

  if (!blocks.length && text.trim().length >= 80) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    let currentSection = 'Article body';
    for (const line of lines) {
      if (
        line.length <= 120 &&
        /^[A-Z]/.test(line) &&
        !/[.!?]$/.test(line) &&
        (/(practice|fair value|consumer duty|assessment|outcome|guidance)/i.test(line) || /^[A-Z][\w\s,'-]{4,90}$/.test(line))
      ) {
        currentSection = line;
        continue;
      }
      if (line.length < 35) continue;
      seq = pushHtmlBlock(blocks, ctx, seq, currentSection, line);
    }
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

  const webStatus = String(ctx.extractionQuality?.webpageExtraction?.status || '').toLowerCase();
  const webOk = webStatus === 'complete' || webStatus === 'pass' || webStatus === 'ok';
  const textLen = String(ctx.normalisedArticleText || '').trim().length;
  if (!webOk && textLen < 80) {
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
  const composed = composeHtmlSubstantiveAnswer({
    question,
    citationSource,
    rankedBlocks,
    citations,
    ctx,
    matchScore,
  });

  return {
    status: 'ANSWERED',
    answer: composed.answer,
    citations,
    audit: {
      evidenceSource: 'html_article_v2',
      matchScore,
      synthesisMode: 'deterministic_webpage_grounded',
      humanReviewStatus: 'pending_review',
      mustNotPresentAsBindingObligation: false,
      distinguishesExamplesFromObligations: true,
      keyFindings: composed.keyFindings,
      uncertainties: composed.uncertainties,
      evidenceConfidence: composed.evidenceConfidence,
      sectionBlockCount: ctx.evidenceBlocks?.length ?? 0,
      citedSectionCount: citations.length,
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

function computeHtmlEvidenceConfidence({ matchScore, sectionBlockCount, citedSectionCount }) {
  if (citedSectionCount >= 3 && (matchScore ?? 0) >= 12) return 'HIGH';
  if (citedSectionCount >= 2 && sectionBlockCount >= 3) return 'MEDIUM';
  if (citedSectionCount >= 1 && sectionBlockCount <= 1) return 'MEDIUM';
  return citedSectionCount >= 1 ? 'MEDIUM' : 'LOW';
}

function buildHtmlKeyFindings({ rankedBlocks, citationSource }) {
  const keyFindings = [];
  const uncertainties = [
    'Binding Handbook obligations must be confirmed against PRIN / COCON source rules — this FCA supervisory page is not the legal instrument.',
    'Firm-specific fair-value assessments require human compliance judgement beyond webpage examples.',
  ];

  if (rankedBlocks.some((r) => /PRIN\s+2A\.4|consumer duty/i.test(r.block.extractedText))) {
    keyFindings.push(
      'The FCA webpage cross-references existing Consumer Duty fair-value expectations (e.g. PRIN 2A.4). This is signposted guidance on the page, not a new obligation introduced by the article.',
    );
  }
  const examples = rankedBlocks.filter((r) => r.block.evidenceKind === 'supervisory_example').slice(0, 3);
  for (const r of examples) {
    keyFindings.push(
      `Supervisory observation (${r.block.sectionReference}): "${String(r.block.extractedText).slice(0, 160)}${r.block.extractedText.length > 160 ? '…' : ''}" — illustrative good/poor practice; not a standalone legal requirement.`,
    );
  }
  const narrative = rankedBlocks.filter((r) => r.block.evidenceKind !== 'supervisory_example').slice(0, 2);
  for (const r of narrative) {
    keyFindings.push(
      `Source narrative (${r.block.sectionReference}): "${String(r.block.extractedText).slice(0, 180)}${r.block.extractedText.length > 180 ? '…' : ''}"`,
    );
  }
  if (!keyFindings.length) {
    uncertainties.push('No section-specific fair-value passages ranked highly for this question — review citations before relying on the summary.');
  }
  return { keyFindings: keyFindings.slice(0, 6), uncertainties: uncertainties.slice(0, 4) };
}

function composeHtmlSubstantiveAnswer({ question, citationSource, rankedBlocks, citations, ctx, matchScore }) {
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

  const { keyFindings, uncertainties } = buildHtmlKeyFindings({ rankedBlocks, citationSource });
  const evidenceConfidence = computeHtmlEvidenceConfidence({
    matchScore,
    sectionBlockCount: ctx.evidenceBlocks?.length ?? 0,
    citedSectionCount: citations.length,
  });

  return {
    answer: parts.join(' '),
    keyFindings,
    uncertainties,
    evidenceConfidence,
  };
}
