/**
 * Provision-level conversion eligibility (RI-CLS-005) and legal-instrument detection (RI-CLS-006).
 *
 * A publication being binding is not enough: a finding converts only when its quotation comes from a section
 * of the legal instrument that sets out the cited provision as live text (unamended instrument text or text
 * inserted as wholly new), the provision marker matches the classification code, and the reviewer classifies
 * the provision as operative. Application, permission, exemption and definition provisions route to
 * Non-Obligation Triage. Provisions whose amendment markup cannot be read from the text layer (underlining and
 * strike-through are lost on extraction), deleted provisions, transitional provisions carrying mandatory language
 * and operative provisions without recognised mandatory language route to Exception Triage for human review.
 * public.ri_submit_ai_finding_review enforces the same rules and remains authoritative; the regular expressions
 * below are mirrored there verbatim.
 */

export const PROVISION_FUNCTIONS = Object.freeze({
  OPERATIVE: 'OPERATIVE_REQUIREMENT',
  EVIDENTIAL: 'EVIDENTIAL_PROVISION',
  APPLICATION: 'APPLICATION',
  PERMISSION: 'PERMISSION',
  EXEMPTION: 'EXEMPTION',
  TRANSITIONAL: 'TRANSITIONAL',
  DEFINITION: 'DEFINITION',
});

export const PROVISION_FUNCTION_LABELS = Object.freeze({
  OPERATIVE_REQUIREMENT: 'Operative requirement (duty on the firm, including transitional duties)',
  EVIDENTIAL_PROVISION: 'Evidential provision',
  APPLICATION: 'Application / scope',
  PERMISSION: 'Permission',
  EXEMPTION: 'Exemption',
  TRANSITIONAL: 'Transitional arrangement (no standalone duty)',
  DEFINITION: 'Definition',
});

export const NON_OPERATIVE_PROVISION_FUNCTIONS = Object.freeze([
  PROVISION_FUNCTIONS.APPLICATION,
  PROVISION_FUNCTIONS.PERMISSION,
  PROVISION_FUNCTIONS.EXEMPTION,
  PROVISION_FUNCTIONS.TRANSITIONAL,
  PROVISION_FUNCTIONS.DEFINITION,
]);

/** Text status of a provision set out in an instrument section; only the first two are convertible. */
export const PROVISION_TEXT_STATUS = Object.freeze({
  INSTRUMENT_TEXT: 'INSTRUMENT_TEXT',
  NEW_TEXT: 'NEW_TEXT',
  AMENDMENT_MARKUP_UNCERTAIN: 'AMENDMENT_MARKUP_UNCERTAIN',
  DELETED: 'DELETED',
});
export const CONVERTIBLE_PROVISION_TEXT_STATUSES = Object.freeze([
  PROVISION_TEXT_STATUS.INSTRUMENT_TEXT,
  PROVISION_TEXT_STATUS.NEW_TEXT,
]);

/** FCA Handbook provision markers. TS has no marker and cannot be grounded this way (fails closed). */
export const PROVISION_MARKERS = Object.freeze(['R', 'E', 'G', 'D', 'P', 'C', 'UK', 'EU']);

/**
 * Reviewer-entered reference, whitespace collapsed: "CONC 4.8.2R", "CONC 4.8.2 R", "4.8.2R", an appendix
 * provision "DISP App 5.3.2E" or a chapter-form transitional provision "SYSC TP 13.1R". Transitional table rows
 * ("SUP TP 1.9A 4R") are not set out in a parseable form and fail closed.
 */
export const PROVISION_REFERENCE_PATTERN =
  '^(?:([A-Z]{2,6}) )?((?:App )?[0-9]{1,2}[A-Z]?\\.[0-9]{1,2}[A-Z]?\\.[0-9]{1,3}[A-Z]?|TP [0-9]{1,3}[A-Z]?\\.[0-9]{1,3}[A-Z]?) ?(R|E|G|D|P|C|UK|EU)$';
/** Recognised mandatory language. Corroborates the reviewer's classification; absence routes to Exception Triage. */
export const DUTY_LANGUAGE_PATTERN =
  '\\m(must|shall|is required to|are required to|is required|are required|is to|are to|must not|may not|may only|is prohibited|are prohibited|prohibited from|is obliged to|are obliged to|has to|have to|ensure|ensures|take reasonable steps|takes reasonable steps|is a condition|no [a-z]+ may)\\M';
export const NON_OPERATIVE_LANGUAGE_PATTERN =
  '\\m(applies to|apply to|applies only|does not apply|do not apply|is exempt|are exempt|exemption|need not|is not required to|are not required to|disapplied|disapplies)\\M';

const REFERENCE_RE = new RegExp(PROVISION_REFERENCE_PATTERN);
const toJsWordBoundaries = (p) => p.replace(/\\m|\\M/g, '\\b');
const DUTY_RE = new RegExp(toJsWordBoundaries(DUTY_LANGUAGE_PATTERN), 'i');
const NON_OPERATIVE_RE = new RegExp(toJsWordBoundaries(NON_OPERATIVE_LANGUAGE_PATTERN), 'i');
const TEXT_PROVISION_RE =
  /(?:(?<![A-Za-z0-9.])(?<!App\s{1,3})(?:([A-Z]{2,6})\s+)?|(?<![A-Za-z0-9])(?=App\s))((?:App\s+)?\d{1,2}[A-Z]?\.\d{1,2}[A-Z]?\.\d{1,3}[A-Z]?|TP\s+\d{1,3}[A-Z]?\.\d{1,3}[A-Z]?)\s*(R|E|G|D|P|C|UK|EU)(?![A-Za-z])/g;
const TRANSITIONAL_TABLE_RE = /\bTP\s*\d+(?:\.\d+)?\s*Transitional provisions?\b/i;
const INSTRUMENT_HEADING_RE = /Made rules\s*\(legal instrument\)/i;
const INSTRUMENT_TITLE_RE = /\bINSTRUMENT\s+20\d{2}\b/;
const INSTRUMENT_POWERS_RE = /Powers exercised|makes this instrument in the exercise/i;

/**
 * Amending-instrument conventions. Underlining and strike-through are not present in the text layer, so every
 * amending instruction (capitalised "Amend", "Insert", "Replace", ... at the start of an instruction) makes the
 * following text uncertain until an explicit statement that the text is new and not underlined.
 */
const AMENDMENT_EVENT_RES = [
  [/\bAnnex [A-Z]{1,2}\s+Amendments?\b/g, PROVISION_TEXT_STATUS.AMENDMENT_MARKUP_UNCERTAIN],
  [/underlining indicates new text and striking through indicates deleted text/gi, PROVISION_TEXT_STATUS.AMENDMENT_MARKUP_UNCERTAIN],
  [/\b(?:Amend|Insert|Replace|Substitute|Make|Move|Renumber)\b(?=\s+(?:the|in|after|before|a|an|new|as)\b)/g, PROVISION_TEXT_STATUS.AMENDMENT_MARKUP_UNCERTAIN],
  [/\b(?:All (?:of )?the text is new(?: and is not underlined)?|The text is (?:all new and is )?not underlined)\b/gi, PROVISION_TEXT_STATUS.NEW_TEXT],
  [/\bDelete\b(?=\s+(?:the|in)\b)/g, PROVISION_TEXT_STATUS.DELETED],
];
const DELETED_AFTER_MARKER_RE = /^\s*\[deleted\]/i;
const STATUS_RANK = { INSTRUMENT_TEXT: 0, NEW_TEXT: 1, AMENDMENT_MARKUP_UNCERTAIN: 2, DELETED: 3 };

const collapse = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** @returns {{ sourcebook: string | null, core: string, marker: string } | null} */
export function parseProvisionReference(reference) {
  const cleaned = collapse(reference).replace(/\s+\([^)]*\)\s*$/u, '');
  const m = REFERENCE_RE.exec(cleaned);
  if (!m) return null;
  return { sourcebook: m[1] || null, core: `${m[2]}${m[3]}`, marker: m[3] };
}

/**
 * Provision markers in section text. Inside an instrument a provision is set out without its sourcebook
 * prefix ("4.8.2 R", "TP 13.1 R"); a prefixed marker ("CONC 4.2A.3R") is a cross-reference to a provision set
 * out elsewhere.
 */
export function provisionMarkersInText(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(TEXT_PROVISION_RE)) {
    out.push({
      sourcebook: m[1] || null,
      core: `${m[2].replace(/\s+/g, ' ')}${m[3]}`,
      marker: m[3],
      setOut: !m[1],
      index: m.index,
      end: m.index + m[0].length,
    });
  }
  return out;
}

export function provisionsSetOutIn(text) {
  return [...new Set(provisionMarkersInText(text).filter((p) => p.setOut).map((p) => p.core))];
}

/** @param {string} text */
function isProvisionContinuationText(text) {
  const t = String(text ?? '').trim();
  if (!t.length) return false;
  return hasDutyLanguage(t) || /^\(\d+\)/.test(t) || /^[a-z]\(\d+\)/i.test(t);
}

/**
 * Merge all evidence blocks on each page (instrument pages only) for provision indexing.
 * @param {Array<{ pageNumber?: number, extractedText?: string }>} blocks
 * @param {number} instrumentStartPage
 */
export function mergeInstrumentBlocksByPage(blocks, instrumentStartPage) {
  const byPage = new Map();
  for (const b of blocks || []) {
    if (!Number.isInteger(b?.pageNumber) || b.pageNumber < instrumentStartPage) continue;
    const prev = byPage.get(b.pageNumber) || '';
    byPage.set(b.pageNumber, prev ? `${prev}\n${b.extractedText || ''}` : String(b.extractedText ?? ''));
  }
  return byPage;
}

/**
 * Maps each provision core to every instrument page that sets it out, including numbered sub-paragraphs that
 * continue on the following page without repeating the provision reference (RI-CLS-009), and leading text on a
 * page before the first new marker when that page also introduces later provisions (e.g. CONC 7.20.1R(2)–(4) then 7.20.2G on p.95).
 * @param {Array<{ pageNumber: number, extractedText?: string, documentEvidenceId?: string }>} blocks
 * @param {number | null} instrumentStartPage
 * @returns {Map<string, { pages: Set<number>, status: Record<number, string> }>}
 */
export function buildProvisionPagesIndex(blocks, instrumentStartPage) {
  const provisionPages = new Map();
  const note = (core, page, status) => {
    if (!core) return;
    if (!provisionPages.has(core)) provisionPages.set(core, { pages: new Set(), status: {} });
    provisionPages.get(core).pages.add(page);
    if (status) provisionPages.get(core).status[page] = status;
  };
  if (!Number.isInteger(instrumentStartPage)) return provisionPages;
  const textStatus = analyseInstrumentProvisionText(blocks, instrumentStartPage);
  const statusFor = (pageNum, core) => {
    for (const b of blocks || []) {
      if (b.pageNumber !== pageNum) continue;
      const s = textStatus.get(b.documentEvidenceId)?.[core];
      if (s) return s;
    }
    return null;
  };
  const byPage = mergeInstrumentBlocksByPage(blocks, instrumentStartPage);
  let carryCore = null;
  for (const pageNum of [...byPage.keys()].sort((a, b) => a - b)) {
    const text = byPage.get(pageNum) || '';
    const setOut = provisionMarkersInText(text)
      .filter((p) => p.setOut)
      .sort((a, b) => a.index - b.index);
    if (carryCore && setOut.length) {
      const lead = text.slice(0, setOut[0].index);
      if (isProvisionContinuationText(lead)) note(carryCore, pageNum, statusFor(pageNum, carryCore));
    } else if (carryCore && !setOut.length && isProvisionContinuationText(text)) {
      note(carryCore, pageNum, statusFor(pageNum, carryCore));
    }
    for (let i = 0; i < setOut.length; i += 1) {
      const p = setOut[i];
      note(p.core, pageNum, statusFor(pageNum, p.core));
      const segStart = p.end;
      const segEnd = i + 1 < setOut.length ? setOut[i + 1].index : text.length;
      const segment = text.slice(segStart, segEnd);
      if (isProvisionContinuationText(segment)) note(p.core, pageNum, statusFor(pageNum, p.core));
    }
    if (setOut.length) carryCore = setOut[setOut.length - 1].core;
  }
  return provisionPages;
}

export function hasDutyLanguage(text) {
  return DUTY_RE.test(String(text ?? ''));
}

export function hasNonOperativeLanguage(text) {
  return NON_OPERATIVE_RE.test(String(text ?? ''));
}

export function isTransitionalTable(text) {
  return TRANSITIONAL_TABLE_RE.test(String(text ?? ''));
}

/**
 * First page of the legal instrument: an "Made rules (legal instrument)" divider immediately before an
 * instrument title page, or the first page carrying both an instrument title and the powers exercised.
 * Instruments run to the end of the document. Returns null when none is found.
 * @param {Array<{ pageNumber: number, extractedText?: string }>} blocks
 */
export function detectLegalInstrumentStartPage(blocks) {
  const pages = new Map();
  for (const b of blocks || []) {
    if (!Number.isInteger(b?.pageNumber)) continue;
    pages.set(b.pageNumber, `${pages.get(b.pageNumber) || ''}\n${b.extractedText || ''}`);
  }
  const titlePage = (n) => INSTRUMENT_TITLE_RE.test(pages.get(n) || '') && INSTRUMENT_POWERS_RE.test(pages.get(n) || '');
  for (const n of [...pages.keys()].sort((a, b) => a - b)) {
    if (INSTRUMENT_HEADING_RE.test(pages.get(n)) && (titlePage(n) || titlePage(n + 1))) return n;
    if (titlePage(n)) return n;
  }
  return null;
}

/**
 * Text status of every provision set out in the instrument, per evidence block. The instrument is read as one
 * stream in page order: an amending annex, its markup convention or "Amend the following as shown" make the
 * following text uncertain (it may be struck through); "All the text is new and is not underlined" marks
 * inserted text as live; "Delete the following" and a "[deleted]" placeholder mark deletion. A provision set out
 * more than once in a block takes its least certain status.
 * @param {Array<{ documentEvidenceId?: string, pageNumber?: number, extractedText?: string }>} blocks
 * @param {number | null} instrumentStartPage
 * @returns {Map<string, Record<string, string>>} documentEvidenceId -> { core: status }
 */
export function analyseInstrumentProvisionText(blocks, instrumentStartPage) {
  const out = new Map();
  if (!Number.isInteger(instrumentStartPage)) return out;
  const ordered = (blocks || [])
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => Number.isInteger(b?.pageNumber) && b.pageNumber >= instrumentStartPage)
    .sort((x, y) => x.b.pageNumber - y.b.pageNumber || x.i - y.i)
    .map(({ b }) => b);
  let mode = PROVISION_TEXT_STATUS.INSTRUMENT_TEXT;
  for (const block of ordered) {
    const text = String(block.extractedText || '');
    const events = AMENDMENT_EVENT_RES.flatMap(([re, status]) =>
      [...text.matchAll(re)].map((m) => ({ at: m.index + m[0].length, status })),
    ).sort((a, b) => a.at - b.at);
    const statusAt = (index) => {
      let s = mode;
      for (const e of events) {
        if (e.at > index) break;
        s = e.status;
      }
      return s;
    };
    const statuses = {};
    for (const p of provisionMarkersInText(text).filter((m) => m.setOut)) {
      const s = DELETED_AFTER_MARKER_RE.test(text.slice(p.end, p.end + 40)) ? PROVISION_TEXT_STATUS.DELETED : statusAt(p.index);
      if (!(p.core in statuses) || STATUS_RANK[s] > STATUS_RANK[statuses[p.core]]) statuses[p.core] = s;
    }
    if (events.length) mode = events[events.length - 1].status;
    if (block.documentEvidenceId) out.set(block.documentEvidenceId, statuses);
  }
  return out;
}

/**
 * @param {{
 *   code: string,
 *   legalStatus: string,
 *   provisionReference?: string | null,
 *   provisionFunction?: string | null,
 *   quotation?: string | null,
 *   section?: {
 *     inLegalInstrument?: boolean,
 *     transitionalProvisions?: boolean,
 *     provisionsSetOut?: string[],
 *     provisionTextStatus?: Record<string, string>,
 *   } | null,
 * }} input
 * @returns {{ route: 'NON_OBLIGATION' | 'OBLIGATION' | 'EXCEPTION', reasons: string[] }}
 */
export function evaluateProvisionEligibility({ code, legalStatus, provisionReference, provisionFunction, quotation, section, citedSections }) {
  if (NON_OPERATIVE_PROVISION_FUNCTIONS.includes(provisionFunction)) {
    if (provisionFunction === PROVISION_FUNCTIONS.TRANSITIONAL && hasDutyLanguage(quotation)) {
      return { route: 'EXCEPTION', reasons: ['transitional_mandatory_language'] };
    }
    return { route: 'NON_OBLIGATION', reasons: [] };
  }
  const reasons = [];
  const expectedFunction = legalStatus === 'evidential' ? PROVISION_FUNCTIONS.EVIDENTIAL : PROVISION_FUNCTIONS.OPERATIVE;
  if (provisionFunction !== expectedFunction) {
    reasons.push(Object.values(PROVISION_FUNCTIONS).includes(provisionFunction) ? 'provision_not_operative' : 'provision_function_required');
  }
  const ref = parseProvisionReference(provisionReference);
  if (!ref || ref.marker !== code) reasons.push('provision_reference_required');
  const sections = Array.isArray(citedSections) && citedSections.length ? citedSections : section ? [section] : [];
  const provisionSection = ref ? sections.find((s) => (s.provisionsSetOut || []).includes(ref.core)) : null;
  if (!sections.some((s) => s.inLegalInstrument === true)) {
    reasons.push('provision_not_in_instrument');
  } else if (ref && !provisionSection) {
    reasons.push('provision_not_set_out_in_section');
  } else if (ref && provisionSection) {
    const status = provisionSection.provisionTextStatus?.[ref.core];
    if (status === PROVISION_TEXT_STATUS.DELETED) reasons.push('provision_deleted');
    else if (!CONVERTIBLE_PROVISION_TEXT_STATUSES.includes(status)) reasons.push('provision_amendment_uncertain');
  }
  if (legalStatus === 'binding' && provisionFunction === PROVISION_FUNCTIONS.OPERATIVE) {
    if (!hasDutyLanguage(quotation)) reasons.push('provision_duty_language_unconfirmed');
    else if (hasNonOperativeLanguage(quotation)) reasons.push('provision_application_language_present');
  }
  return { route: reasons.length ? 'EXCEPTION' : 'OBLIGATION', reasons: [...new Set(reasons)] };
}
