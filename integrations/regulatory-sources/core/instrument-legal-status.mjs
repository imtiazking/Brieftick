/**
 * Deterministic legal-status tracing for FCA rule instruments inside a publication PDF.
 *
 * Separates: source document type, draft vs made instrument, provision-level legal status, commencement
 * (per annex / part, from the instrument's own Commencement paragraph) and transitional references.
 * Nothing is inferred: a date is returned only when a commencement clause or part heading in the instrument states it.
 * Pure text analysis — no network, no database, no AI.
 */

export const INSTRUMENT_ANALYZER_VERSION = 'instrument-legal-status-v1';

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const DATE_RE = '(\\d{1,2})\\s+(January|February|March|April|May|June|July|August|September|October|November|December)\\s+(\\d{4})';

function squash(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

export function parseUkDate(text) {
  const m = new RegExp(DATE_RE, 'i').exec(String(text ?? ''));
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  const day = Number(m[1]);
  const year = Number(m[3]);
  if (!month || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalisePages(pages) {
  return (pages || [])
    .map((p, i) => ({ pageNumber: Number(p.pageNumber ?? p.physicalPageNumber ?? i + 1), text: squash(p.text) }))
    .filter((p) => Number.isFinite(p.pageNumber));
}

/**
 * @param {Array<{ pageNumber?: number, text?: string }>} pages
 */
export function analyzeInstrumentLegalStatus(pages) {
  const all = normalisePages(pages);
  const startPage = all.find((p) => /^Appendix\s*\d*\s*(Made|Draft)\s+rules\s*\(legal instrument\)/i.test(p.text.slice(0, 200)));
  const draftHeading = startPage ? /Draft\s+rules/i.test(startPage.text.slice(0, 200)) : false;
  const instrumentPages = startPage ? all.filter((p) => p.pageNumber > startPage.pageNumber) : [];
  const blob = instrumentPages.map((p) => p.text).join(' ');

  if (!startPage) {
    return {
      analyzerVersion: INSTRUMENT_ANALYZER_VERSION,
      status: 'none',
      reason: 'no_legal_instrument_appendix_detected',
      instrumentStartPage: null,
      annexes: [],
      commencementClauses: [],
      partHeadings: [],
      moduleAnnexMap: {},
      pageCount: all.length,
    };
  }

  const citationMatch = /This instrument may be cited as the ([^.]{5,160}?)\./i.exec(blob);
  const numberMatch = /\bFCA\s*(\d{4}\/\d{1,3})\b/.exec(blob);
  const madeByMatch = new RegExp(`By order of the Board of the Financial Conduct Authority\\s+(${DATE_RE})`, 'i').exec(blob);
  const status = draftHeading ? 'draft' : 'made';

  // Commencement paragraph(s): "F. Part 1 of Annex A comes into force on 1 April 2026."
  const commencementClauses = [];
  const clauseRe = new RegExp(
    `\\b([A-Z])\\.\\s+((?:Part\\s+(\\d+)\\s+of\\s+Annex\\s+([A-Z]))|(?:Annex\\s+([A-Z]))|(?:All other parts of this instrument)|(?:This instrument))\\s+comes?\\s+into\\s+force\\s+on\\s+(${DATE_RE})`,
    'g',
  );
  for (const p of instrumentPages) {
    let m;
    clauseRe.lastIndex = 0;
    while ((m = clauseRe.exec(p.text))) {
      const scope = m[2];
      commencementClauses.push({
        clause: m[1],
        scope: /All other parts/i.test(scope) ? 'all_other_parts' : /^This instrument/i.test(scope) ? 'whole_instrument' : m[3] ? 'annex_part' : 'annex',
        annex: m[4] || m[5] || null,
        part: m[3] ? Number(m[3]) : null,
        dateText: m[6],
        commencementDate: parseUkDate(m[6]),
        page: p.pageNumber,
        quotation: squash(m[0]),
      });
    }
  }

  // Annex headings: "Annex F Amendments to the Consumer Credit sourcebook (CONC)".
  const annexes = [];
  for (const p of instrumentPages) {
    const m = /(?:^|\s)Annex\s+([A-Z])\s+Amendments to (?:the )?([^.]{3,140}?)(?=\s+(?:In this Annex|Part\s+\d|Insert|Delete|\.\.\.|[0-9]))/.exec(p.text);
    if (m && !annexes.some((a) => a.letter === m[1])) {
      const moduleCode = /\(([A-Z]{2,8})\)\s*$/.exec(m[2])?.[1] ?? null;
      annexes.push({ letter: m[1], title: squash(m[2]), moduleCode, startPage: p.pageNumber, endPage: null });
    }
  }
  annexes.sort((a, b) => a.startPage - b.startPage);
  const lastPage = all.length ? all[all.length - 1].pageNumber : 0;
  annexes.forEach((a, i) => {
    a.endPage = i + 1 < annexes.length ? annexes[i + 1].startPage - 1 : lastPage;
  });
  // Material outside the Handbook (e.g. "Annex G Amendments to ...") is still bounded by the next heading.

  // Module to annex table ("Consumer Credit sourcebook (CONC) Annex F").
  const moduleAnnexMap = {};
  const tableRe = /\(([A-Z]{2,8})\)\s+Annex\s+([A-Z])\b/g;
  let tm;
  while ((tm = tableRe.exec(blob))) moduleAnnexMap[tm[1]] = tm[2];
  for (const a of annexes) if (a.moduleCode && !moduleAnnexMap[a.moduleCode]) moduleAnnexMap[a.moduleCode] = a.letter;

  // Part headings: "Part 2: Comes into force on 15 July 2026".
  const partHeadings = [];
  const partRe = new RegExp(`Part\\s+(\\d+):\\s*Comes into force on\\s+(${DATE_RE})`, 'g');
  for (const p of instrumentPages) {
    let m;
    partRe.lastIndex = 0;
    while ((m = partRe.exec(p.text))) {
      const annex = annexes.find((a) => p.pageNumber >= a.startPage && p.pageNumber <= a.endPage)?.letter ?? null;
      partHeadings.push({ annex, part: Number(m[1]), dateText: m[2], commencementDate: parseUkDate(m[2]), page: p.pageNumber, quotation: squash(m[0]) });
    }
  }

  return {
    analyzerVersion: INSTRUMENT_ANALYZER_VERSION,
    status,
    instrumentStartPage: startPage.pageNumber,
    instrumentPageCount: instrumentPages.length,
    title: citationMatch ? squash(citationMatch[1]) : null,
    instrumentNumber: numberMatch ? `FCA ${numberMatch[1]}` : null,
    madeDate: madeByMatch ? parseUkDate(madeByMatch[1]) : null,
    annexes,
    moduleAnnexMap,
    commencementClauses,
    partHeadings,
    pageCount: all.length,
  };
}

/**
 * Resolve the commencement of a provision set out on `page`. Never guesses: returns `unresolved` with a reason.
 * @param {ReturnType<typeof analyzeInstrumentLegalStatus>} instrument
 * @param {{ page: number, provisionReference?: string }} target
 */
export function resolveProvisionCommencement(instrument, target) {
  const base = { provisionReference: target.provisionReference ?? null, page: target.page };
  if (!instrument || instrument.status === 'none') return { ...base, status: 'unresolved', reason: 'no_legal_instrument_in_publication' };
  if (instrument.status === 'draft') return { ...base, status: 'unresolved', reason: 'instrument_is_draft_no_commencement_in_force', instrumentStatus: 'draft' };
  const annex = instrument.annexes.find((a) => target.page >= a.startPage && target.page <= a.endPage);
  if (!annex) return { ...base, status: 'unresolved', reason: 'page_not_within_an_annex', instrumentStatus: instrument.status };

  const clausesForAnnex = instrument.commencementClauses.filter((c) => c.annex === annex.letter);
  const partsInAnnex = instrument.partHeadings
    .filter((h) => h.annex === annex.letter && h.page <= target.page)
    .sort((a, b) => a.page - b.page || a.part - b.part);
  const nextPartOnSamePage = instrument.partHeadings.some((h) => h.annex === annex.letter && h.page === target.page);
  const header = {
    ...base,
    instrumentStatus: instrument.status,
    instrument: { title: instrument.title, number: instrument.instrumentNumber },
    annex: annex.letter,
    annexTitle: annex.title,
  };

  if (partsInAnnex.length || instrument.partHeadings.some((h) => h.annex === annex.letter)) {
    if (!partsInAnnex.length) return { ...header, status: 'unresolved', reason: 'provision_precedes_first_part_heading' };
    if (nextPartOnSamePage) return { ...header, status: 'unresolved', reason: 'several_parts_on_provision_page_requires_manual_confirmation' };
    const part = partsInAnnex[partsInAnnex.length - 1];
    const clause = clausesForAnnex.find((c) => c.part === part.part);
    if (clause && clause.commencementDate !== part.commencementDate) {
      return { ...header, status: 'unresolved', reason: 'part_heading_conflicts_with_commencement_clause' };
    }
    return {
      ...header,
      status: 'resolved',
      commencementDate: part.commencementDate,
      dateText: part.dateText,
      basis: 'annex_part_heading',
      part: part.part,
      evidence: [{ kind: 'part_heading', page: part.page, quotation: part.quotation }, ...(clause ? [{ kind: 'commencement_clause', page: clause.page, quotation: clause.quotation }] : [])],
    };
  }

  const explicit = clausesForAnnex.find((c) => c.scope === 'annex' || (c.scope === 'annex_part' && c.part == null));
  if (explicit) {
    return { ...header, status: 'resolved', commencementDate: explicit.commencementDate, dateText: explicit.dateText, basis: 'commencement_clause_for_annex', clause: explicit.clause, evidence: [{ kind: 'commencement_clause', page: explicit.page, quotation: explicit.quotation }] };
  }
  if (clausesForAnnex.length) return { ...header, status: 'unresolved', reason: 'annex_has_part_specific_clauses_but_no_part_headings' };
  const whole = instrument.commencementClauses.find((c) => c.scope === 'whole_instrument');
  const rest = instrument.commencementClauses.find((c) => c.scope === 'all_other_parts');
  const generic = whole || rest;
  if (generic) {
    return {
      ...header,
      status: 'resolved',
      commencementDate: generic.commencementDate,
      dateText: generic.dateText,
      basis: whole ? 'commencement_clause_whole_instrument' : 'commencement_clause_all_other_parts',
      clause: generic.clause,
      evidence: [{ kind: 'commencement_clause', page: generic.page, quotation: generic.quotation }],
    };
  }
  return { ...header, status: 'unresolved', reason: 'no_commencement_clause_found' };
}

/**
 * Looks for the provision core inside transitional material of the instrument (TP tables or "transitional provision" text).
 * Reports what was scanned; absence is evidence of nothing more than "not referenced", so expert confirmation stays required.
 * @param {Array<{ pageNumber?: number, text?: string }>} pages
 * @param {ReturnType<typeof analyzeInstrumentLegalStatus>} instrument
 * @param {string} core e.g. "7.20.1R"
 */
export function scanTransitionalReferences(pages, instrument, core) {
  const all = normalisePages(pages);
  const bare = String(core || '').replace(/[RGE]$/, '');
  const needle = new RegExp(`(?<![\\d.])${bare.replace(/\./g, '\\.')}\\s*[RGE]?(?![\\d])`);
  const scanned = [];
  const mentions = [];
  for (const p of all) {
    if (instrument?.instrumentStartPage && p.pageNumber <= instrument.instrumentStartPage) continue;
    if (!/transitional provision|TP\s*\d|Transitional Provisions table/i.test(p.text)) continue;
    scanned.push(p.pageNumber);
    const m = needle.exec(p.text);
    if (m) mentions.push({ page: p.pageNumber, context: p.text.slice(Math.max(0, m.index - 120), m.index + 200) });
  }
  return {
    provision: core,
    scannedTransitionalPages: scanned,
    provisionSpecificTransitionalFound: mentions.length > 0,
    mentions,
    requiresExpertConfirmation: true,
    note: mentions.length
      ? 'The provision is referenced in transitional material; read it before relying on the commencement date.'
      : 'No transitional material in the instrument references this provision. This is a text search, not a legal conclusion on in-flight agreements or temporary-permission firms.',
  };
}
