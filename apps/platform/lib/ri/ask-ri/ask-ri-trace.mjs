/**
 * Non-sensitive Ask RI catalogue evidence trace (staging diagnostics).
 */

export function buildAskRiEvidenceTrace(state, result) {
  const meta = state.publicationPdfEvidenceLoadMeta || {};
  const htmlList = state.publicationHtmlEvidence || [];
  const pdfList = state.publicationPdfEvidence || [];
  const htmlErrors = state.publicationHtmlEvidenceErrors || [];
  const pdfErrors = state.publicationPdfEvidenceErrors || [];

  return {
    publicationScoped: meta.skipped !== true,
    resolveMethod: meta.publicationResolveMethod ?? null,
    scopedPublicationIds: meta.scopedPublicationIds ?? null,
    supplementaryPdfPublicationIds: meta.supplementaryPdfPublicationIds ?? null,
    htmlRevisionQuery: {
      attempted: Boolean(meta.scopedPublicationIds?.length),
      lookup: meta.htmlRevisionLookup ?? null,
      rowsFound: meta.htmlRevisionRowsFound ?? null,
      publicationVersionCount: meta.publicationVersionCount ?? null,
      loadedCount: meta.htmlLoadedCount ?? htmlList.length,
      errorCodes: [...new Set(htmlErrors.map((e) => e.code).filter(Boolean))],
      publicationIds: htmlList.map((e) => e.publicationId),
      blockCounts: htmlList.map((e) => ({
        publicationId: e.publicationId,
        blocks: e.evidenceBlocks?.length ?? 0,
        revisionId: e.extractionRevisionId,
      })),
    },
    pdfRevisionQuery: {
      loadedCount: meta.pdfLoadedCount ?? pdfList.length,
      errorCodes: [...new Set(pdfErrors.map((e) => e.code).filter(Boolean))],
      publicationIds: pdfList.map((e) => e.publicationId),
    },
    result: {
      status: result?.status ?? null,
      executionEvidenceSource: result?.execution?.evidenceSource ?? null,
      queryPlanMode: result?.queryPlan?.mode ?? null,
      citationCount: result?.citations?.length ?? 0,
    },
  };
}
