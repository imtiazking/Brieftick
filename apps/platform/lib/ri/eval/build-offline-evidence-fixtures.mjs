import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createMinimalCp26PdfBuffer } from '../../../../../integrations/regulatory-sources/fixtures/cp26-38-minimal-pdf.mjs';
import { extractRegulatoryPdfContent } from '../../../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import { analyzeRegulatoryPdfDocument } from '../../../../../integrations/regulatory-sources/core/regulatory-pdf-analysis.mjs';
import { FG22_5_PRIMARY_PDF_URL } from '../../../../../integrations/regulatory-sources/core/regulatory-pdf-allowlist.mjs';
import { buildPublicationPdfEvidenceIndex } from '../ask-ri/publication-pdf-evidence.mjs';
import { CP26_38_STAGING } from '../ingestion/snapshot/cp26-38-staging-identity.mjs';
import { FAIR_VALUE_CONSUMER_FINANCE_PUBLICATION_ID } from '../ask-ri/publication-question-scope.mjs';
import { EXTRACTION_PROFILE_PDF_PRIMARY_V1 } from '../ingestion/snapshot/extraction-revision-types.mjs';

function sha256Json(obj) {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function writePack(dir, fileBase, pack) {
  const filename = `${fileBase}-v1.json`;
  writeFileSync(join(dir, filename), JSON.stringify(pack, null, 2));
  return filename;
}

/**
 * Offline subset built from verified integration fixtures — not a staging DB export.
 */
export function writeOfflineEvidenceFixtures(dir, report) {
  const fg22Blocks = [2, 3, 4, 5].map((page) => ({
    documentEvidenceId: `intro-${page}`,
    pageNumber: page,
    sectionReference: 'Introduction',
    extractedText:
      'FG22/5 Final non-Handbook Guidance for firms on the Consumer Duty. This guidance sets out our expectations on the Consumer Duty and fair value in consumer finance.',
  }));
  for (const page of [58, 64, 66, 67]) {
    fg22Blocks.push({
      documentEvidenceId: `ch7-p${page}`,
      pageNumber: page,
      sectionReference: '7.1',
      kind: 'numbered_clause',
      extractedText: `Firms should assess whether the price paid provides fair value and monitor value outcomes through the product lifecycle (page ${page}).`,
    });
  }
  const fg22Analysis = analyzeRegulatoryPdfDocument({
    structured: { pages: [] },
    publicationMetadata: { publicationType: 'finalised_guidance' },
    canonicalUrl: FG22_5_PRIMARY_PDF_URL,
  });
  const fg22Evidence = {
    publicationId: 'a761cacc-8742-493d-b200-eb5d9a3ab884',
    extractionRevisionId: '56fd1525-7f30-401e-82fd-16abf90100aa',
    publicationTitle: 'FG22/5',
    publicationReference: 'FG22/5',
    canonicalUrl: FG22_5_PRIMARY_PDF_URL,
    integrityVerified: true,
    obligationGradeSuitable: false,
    structured: { pageBoundaryConfirmed: true, pages: [] },
    evidenceBlocks: fg22Blocks,
    publicationMetadata: { publicationType: 'finalised_guidance', primaryPdfUrl: FG22_5_PRIMARY_PDF_URL },
    analysis: fg22Analysis,
    regulatorShortName: 'FCA',
    regulatorLabel: 'Financial Conduct Authority',
  };

  const fairHtml = {
    publicationId: FAIR_VALUE_CONSUMER_FINANCE_PUBLICATION_ID,
    extractionRevisionId: '613c078c-3639-4ce5-9666-73c5352f44fd',
    publicationTitle: 'Fair value in consumer finance',
    canonicalUrl: 'https://www.fca.org.uk/publications/good-and-poor-practice/fair-value-consumer-finance',
    integrityVerified: true,
    evidenceBlocks: [
      {
        documentEvidenceId: 'fv-h1',
        sectionReference: 'Fair value',
        extractedText:
          'Firms should deliver fair value under Consumer Duty (PRIN 2A.4). Supervisory examples illustrate good and poor practice — examples are not new legal obligations.',
        evidenceKind: 'supervisory_example',
      },
      {
        documentEvidenceId: 'fv-h2',
        sectionReference: 'Examples',
        extractedText:
          'Examples of good practice under Consumer Duty fair value in consumer finance for product governance and monitoring customer outcomes.',
        evidenceKind: 'supervisory_example',
      },
    ],
    extractionProfile: 'html_article_v2',
    evidenceMedium: 'fca_webpage',
    regulatorShortName: 'FCA',
    regulatorLabel: 'Financial Conduct Authority',
    publicationMetadata: { publicationType: 'supervisory_examples' },
  };

  const pdf = createMinimalCp26PdfBuffer();
  const extracted = awaitExtract(pdf);
  const structured =
    extracted.ok && extracted.structured
      ? extracted.structured
      : {
          pageBoundaryConfirmed: true,
          pageCount: 1,
          pages: [{ pageNumber: 1, paragraphs: [{ paragraphIndex: 1, text: 'fraud prevention and AML monitoring proposals' }] }],
          parserVersion: 'offline-fixture',
        };
  const cp26Blocks = buildPdfEvidenceBlocks(
    {
      publicationId: CP26_38_STAGING.publicationId,
      extractionRevisionId: CP26_38_STAGING.pdfExtractionRevisionId,
      sourcePdfSha256: CP26_38_STAGING.primaryPdfRawContentSha256,
      extractionProfile: EXTRACTION_PROFILE_PDF_PRIMARY_V1,
    },
    structured,
  );
  const cp26Pdf = buildPublicationPdfEvidenceIndex(
    {
      id: CP26_38_STAGING.pdfExtractionRevisionId,
      publication_id: CP26_38_STAGING.publicationId,
      extraction_profile: EXTRACTION_PROFILE_PDF_PRIMARY_V1,
      raw_content_sha256: CP26_38_STAGING.primaryPdfRawContentSha256,
      publication_metadata: { publicationTypeLabel: 'Consultation paper', publicationType: 'consultation' },
      canonical_url: CP26_38_STAGING.canonicalUrl,
    },
    structured,
    cp26Blocks,
  );
  Object.assign(cp26Pdf, {
    publicationTitle: 'CP26/38 Financial Crime Guide updates',
    publicationReference: 'CP26/38',
    canonicalUrl: CP26_38_STAGING.canonicalUrl,
    integrityVerified: true,
    obligationGradeSuitable: false,
    regulatorShortName: 'FCA',
    regulatorLabel: 'Financial Conduct Authority',
    analysis: analyzeRegulatoryPdfDocument({
      structured,
      publicationMetadata: { publicationType: 'consultation' },
      canonicalUrl: CP26_38_STAGING.canonicalUrl,
    }),
  });

  const cp26Html = {
    publicationId: CP26_38_STAGING.publicationId,
    extractionRevisionId: CP26_38_STAGING.extractionRevisionId,
    publicationTitle: 'CP26/38 Financial Crime Guide updates',
    publicationReference: 'CP26/38',
    canonicalUrl: CP26_38_STAGING.canonicalUrl,
    integrityVerified: true,
    evidenceBlocks: [
      {
        documentEvidenceId: 'cp26-h1',
        sectionReference: 'Overview',
        extractedText:
          'CP26/38 proposes updates to the Financial Crime Guide. This is a consultation — proposals are not binding requirements.',
        evidenceKind: 'consultation_proposal',
      },
    ],
    extractionProfile: 'html_article_v2',
    regulatorShortName: 'FCA',
    publicationMetadata: { publicationType: 'consultation' },
  };

  const packs = [
    packShell(fairHtml, 'fair-value-consumer-finance', 'html_article_v2', 'supervisory_examples'),
    packShell(fg22Evidence, 'fg22-5-primary-pdf', 'pdf_primary_v1', 'finalised_guidance'),
    packShell(cp26Pdf, 'cp26-38-primary-pdf', 'pdf_primary_v1', 'consultation'),
    packShell(cp26Html, 'cp26-38-html-article', 'html_article_v2', 'consultation'),
  ];

  for (const { fileBase, pack } of packs) {
    const file = writePack(dir, fileBase, pack);
    report.packsWritten.push({
      file,
      publicationId: pack.publicationId,
      profile: pack.profile,
      exportSource: 'offline_fixture_subset',
    });
  }
}

function packShell(askRiEvidence, fileBase, profile, regulatoryStatus) {
  const samples = (askRiEvidence.evidenceBlocks || []).slice(0, 12).map((b) => ({
    sectionReference: b.sectionReference,
    pageNumber: b.pageNumber,
    extractedText: String(b.extractedText || '').slice(0, 400),
  }));
  return {
    fileBase,
    pack: {
      packVersion: 1,
      publicationId: askRiEvidence.publicationId,
      publicationTitle: askRiEvidence.publicationTitle,
      publicationType: askRiEvidence.publicationMetadata?.publicationType || regulatoryStatus,
      regulator: askRiEvidence.regulatorShortName || 'FCA',
      canonicalUrl: askRiEvidence.canonicalUrl || null,
      extractionRevisionId: askRiEvidence.extractionRevisionId,
      extractionProfile: profile,
      profile,
      contentSha256: sha256Json(samples),
      regulatoryStatus,
      verifiedTextSamples: samples,
      askRiEvidence,
      retrievalProvenance: { exportSource: 'offline_fixture_subset', note: 'Public FCA content fragments for offline eval only' },
      exportSource: 'offline_fixture_subset',
    },
  };
}

function awaitExtract(pdf) {
  try {
    return extractRegulatoryPdfContent(pdf, { expectedTitle: 'CP26/38' });
  } catch {
    return { ok: false };
  }
}
