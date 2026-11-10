/**
 * Pure Ask RI → Lab mapping helpers (safe for offline acceptance scripts).
 */

/**
 * @param {Array<{ type?: string, physicalPageNumber?: number }>} citations
 */
export function countCitationsByMedium(citations = []) {
  let html = 0;
  let pdf = 0;
  for (const c of citations) {
    if (c.type === 'html_article_v2') html += 1;
    else if (c.type === 'primary_pdf' || c.physicalPageNumber != null) pdf += 1;
  }
  return { html, pdf };
}

/**
 * @param {{ execution?: { evidenceSource?: string, evidenceSources?: string[] } }} result
 * @param {Array<{ type?: string, physicalPageNumber?: number }>} citations
 */
export function resolveCatalogueEvidenceSource(result, citations) {
  const { html, pdf } = countCitationsByMedium(citations);
  if (html && pdf) return 'mixed_catalogue_evidence';
  if (html) return 'html_article_v2';
  if (pdf) return 'pdf_primary_v1';
  const modes = result.execution?.evidenceSources || [];
  if (modes.includes('html_article_v2') && modes.includes('pdf_primary_v1')) return 'mixed_catalogue_evidence';
  if (modes.includes('html_article_v2')) return 'html_article_v2';
  if (modes.includes('pdf_primary_v1')) return 'pdf_primary_v1';
  const legacy = result.execution?.evidenceSource;
  if (legacy === 'html_article_v2' || legacy === 'pdf_primary_v1') return legacy;
  return 'catalogue_publication_evidence_v1';
}
