/**
 * Deterministic mixed html_article_v2 + pdf_primary_v1 answer for publication-scoped Ask RI.
 */

/**
 * @param {object[]} pdfCitations
 */
export function buildFairValuePdfKeyFindings(pdfCitations) {
  const cites = pdfCitations || [];
  const blob = cites.map((c) => `${c.excerpt || ''} ${c.physicalPageNumber}`).join(' ');
  const lc = blob.toLowerCase();
  const findings = [];
  const push = (cond, msg) => {
    if (cond && !findings.some((f) => f === msg)) findings.push(msg);
  };

  push(
    /before (firms )?offer|prior to offering|before offering|before they offer/i.test(lc),
    'FG22/5 (finalised guidance): assess fair value before offering products or services.',
  );
  push(
    /(throughout|lifecycle|monitor).*(fair )?value|monitor fair value/i.test(lc),
    'FG22/5 (finalised guidance): monitor fair value throughout the product lifecycle.',
  );
  push(
    /vulnerable|vulnerability|customer group|different customer/i.test(lc),
    'FG22/5 (finalised guidance): consider different customer groups and vulnerability when assessing fair value.',
  );
  push(
    /distribution|intermediar|chain|charge/i.test(lc),
    'FG22/5 (finalised guidance): assess distribution-chain charges and value passed to customers where applicable.',
  );
  push(
    /take action|appropriate action|not deliver|poor value|remediat/i.test(lc),
    'FG22/5 (finalised guidance): take appropriate action where fair value is not delivered.',
  );

  for (const c of cites) {
    if (findings.length >= 6) break;
    const ex = String(c.excerpt || '').replace(/\s+/g, ' ').trim();
    if (!ex) continue;
    const line = `FG22/5 physical page ${c.physicalPageNumber}: "${ex.slice(0, 160)}${ex.length > 160 ? '…' : ''}" — finalised FCA guidance (Handbook PRIN 2A is binding).`;
    if (!findings.some((f) => f.includes(`physical page ${c.physicalPageNumber}`))) findings.push(line);
  }

  return findings.slice(0, 6);
}

/**
 * @param {object} htmlAnswer
 * @param {object} pdfSupplement
 * @param {string} question
 */
export function composeMixedHtmlPdfAnswer(htmlAnswer, pdfSupplement, question) {
  const pdfCites = pdfSupplement?.citations || [];
  const htmlCites = htmlAnswer?.citations || [];
  if (!pdfCites.length) {
    return {
      answer: htmlAnswer?.answer || '',
      keyFindings: htmlAnswer?.audit?.keyFindings || [],
      uncertainties: htmlAnswer?.audit?.uncertainties || [],
      evidenceConfidence: htmlAnswer?.audit?.evidenceConfidence || 'MEDIUM',
    };
  }

  const htmlTitle =
    htmlCites[0]?.publicationTitle || htmlAnswer?.audit?.publicationTitle || 'Fair value in consumer finance';
  const pdfRef = pdfCites[0]?.publicationReference || pdfCites[0]?.publicationTitle || 'FG22/5';
  const htmlKeyFindings = (htmlAnswer?.audit?.keyFindings || []).map((f) =>
    String(f).startsWith('FCA webpage:') ? f : `FCA webpage: ${f}`,
  );
  let pdfKeyFindings = buildFairValuePdfKeyFindings(pdfCites);

  const parts = [];
  parts.push(
    `Financial Conduct Authority — mixed catalogue evidence from the supervisory webpage “${htmlTitle}” (html_article_v2) and ${pdfRef} Chapter 7 — The price and value outcome (pdf_primary_v1). Deterministic synthesis from verified sources only — not generative AI.`,
  );
  parts.push(
    'Binding Consumer Duty fair-value obligations sit in PRIN 2A in the FCA Handbook. The FCA webpage describes supervisory good and poor practice examples. FG22/5 is finalised non-Handbook guidance on meeting fair-value expectations — it does not create new legal obligations or deadlines.',
  );

  let htmlBody = String(htmlAnswer?.answer || '');
  htmlBody = htmlBody
    .replace(/^Financial Conduct Authority webpage[^.]+\.\s*/i, '')
    .replace(/Summary from verified html_article_v2 text only[^.]*\.\s*/i, '')
    .replace(/\d+ FCA webpage citation\(s\) below[^.]*\.\s*/i, '')
    .replace(/FG22\/5 is separately published[^.]+\.\s*/i, '')
    .trim();
  if (htmlBody) {
    parts.push(`FCA supervisory webpage: ${htmlBody}`);
  }

  const pdfPassages = pdfCites.map((c) => {
    const ex = String(c.excerpt || '').replace(/\s+/g, ' ').trim();
    const sect = c.sectionReference ? ` (${c.sectionReference})` : '';
    return `${pdfRef} physical page ${c.physicalPageNumber}${sect}: "${ex.slice(0, 220)}${ex.length > 220 ? '…' : ''}"`;
  });
  parts.push(`FG22/5 primary PDF (finalised guidance): ${pdfPassages.join(' ')}`);

  parts.push(
    `${htmlCites.length || htmlAnswer?.citations?.length || 0} FCA webpage and ${pdfCites.length} FG22/5 PDF page citation(s) below. Human review required before compliance or product governance decisions.`,
  );

  const fairValueQ = /fair[- ]?value|consumer duty|consumer finance/i.test(String(question || ''));
  if (fairValueQ && !pdfKeyFindings.length) {
    pdfKeyFindings.push(
      'FG22/5 Chapter 7 passages cited below support Consumer Duty fair-value assessment and monitoring expectations.',
    );
  }

  return {
    answer: parts.join(' '),
    keyFindings: [...htmlKeyFindings, ...pdfKeyFindings].slice(0, 8),
    uncertainties: (htmlAnswer?.audit?.uncertainties || []).filter(Boolean),
    evidenceConfidence: 'HIGH',
  };
}
