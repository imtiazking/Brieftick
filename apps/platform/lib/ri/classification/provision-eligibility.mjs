/**
 * Provision-level conversion eligibility (RI-CLS-005) and legal-instrument detection (RI-CLS-006).
 *
 * A publication being binding is not enough: a finding converts only when its quotation comes from a section
 * of the legal instrument that sets out the cited provision, the provision marker matches the classification
 * code, and the provision is operative. Application, permission, exemption, transitional and definition
 * provisions route to Non-Obligation Triage. public.ri_submit_ai_finding_review enforces the same rules and
 * remains authoritative; the regular expressions below are mirrored there verbatim.
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
  OPERATIVE_REQUIREMENT: 'Operative requirement (duty on the firm)',
  EVIDENTIAL_PROVISION: 'Evidential provision',
  APPLICATION: 'Application / scope',
  PERMISSION: 'Permission',
  EXEMPTION: 'Exemption',
  TRANSITIONAL: 'Transitional provision',
  DEFINITION: 'Definition',
});

export const NON_OPERATIVE_PROVISION_FUNCTIONS = Object.freeze([
  PROVISION_FUNCTIONS.APPLICATION,
  PROVISION_FUNCTIONS.PERMISSION,
  PROVISION_FUNCTIONS.EXEMPTION,
  PROVISION_FUNCTIONS.TRANSITIONAL,
  PROVISION_FUNCTIONS.DEFINITION,
]);

/** FCA Handbook provision markers. TS has no marker and cannot be grounded this way (fails closed). */
export const PROVISION_MARKERS = Object.freeze(['R', 'E', 'G', 'D', 'P', 'C', 'UK', 'EU']);

/** Reviewer-entered reference, whitespace collapsed: "CONC 4.8.2R", "CONC 4.8.2 R" or "4.8.2R". */
export const PROVISION_REFERENCE_PATTERN =
  '^(?:([A-Z]{2,6}) )?([0-9]{1,2}[A-Z]?\\.[0-9]{1,2}[A-Z]?\\.[0-9]{1,3}[A-Z]?) ?(R|E|G|D|P|C|UK|EU)$';
export const DUTY_LANGUAGE_PATTERN = '\\m(must|shall|is required to|are required to|is to|are to)\\M';
export const NON_OPERATIVE_LANGUAGE_PATTERN =
  '\\m(applies to|apply to|applies only|does not apply|do not apply|is exempt|are exempt|exemption|transitional|need not|is not required to|are not required to|disapplied|disapplies)\\M';

const REFERENCE_RE = new RegExp(PROVISION_REFERENCE_PATTERN);
const toJsWordBoundaries = (p) => p.replace(/\\m|\\M/g, '\\b');
const DUTY_RE = new RegExp(toJsWordBoundaries(DUTY_LANGUAGE_PATTERN), 'i');
const NON_OPERATIVE_RE = new RegExp(toJsWordBoundaries(NON_OPERATIVE_LANGUAGE_PATTERN), 'i');
const TEXT_PROVISION_RE =
  /(?<![A-Za-z0-9.])(?:([A-Z]{2,6})\s+)?(\d{1,2}[A-Z]?\.\d{1,2}[A-Z]?\.\d{1,3}[A-Z]?)\s*(R|E|G|D|P|C|UK|EU)(?![A-Za-z])/g;
const TRANSITIONAL_TABLE_RE = /\bTP\s*\d+(?:\.\d+)?\s*Transitional provisions?\b/i;
const INSTRUMENT_HEADING_RE = /Made rules\s*\(legal instrument\)/i;
const INSTRUMENT_TITLE_RE = /\bINSTRUMENT\s+20\d{2}\b/;
const INSTRUMENT_POWERS_RE = /Powers exercised|makes this instrument in the exercise/i;

const collapse = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** @returns {{ sourcebook: string | null, core: string, marker: string } | null} */
export function parseProvisionReference(reference) {
  const m = REFERENCE_RE.exec(collapse(reference));
  if (!m) return null;
  return { sourcebook: m[1] || null, core: `${m[2]}${m[3]}`, marker: m[3] };
}

/**
 * Provision markers in section text. Inside an instrument a provision is set out without its sourcebook
 * prefix ("4.8.2 R"); a prefixed marker ("CONC 4.2A.3R") is a cross-reference to a provision set out elsewhere.
 */
export function provisionMarkersInText(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(TEXT_PROVISION_RE)) {
    out.push({ sourcebook: m[1] || null, core: `${m[2]}${m[3]}`, marker: m[3], setOut: !m[1] });
  }
  return out;
}

export function provisionsSetOutIn(text) {
  return [...new Set(provisionMarkersInText(text).filter((p) => p.setOut).map((p) => p.core))];
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
 * @param {{
 *   code: string,
 *   legalStatus: string,
 *   provisionReference?: string | null,
 *   provisionFunction?: string | null,
 *   quotation?: string | null,
 *   section?: { inLegalInstrument?: boolean, transitionalProvisions?: boolean, provisionsSetOut?: string[] } | null,
 * }} input
 * @returns {{ route: 'NON_OBLIGATION' | 'OBLIGATION' | 'EXCEPTION', reasons: string[] }}
 */
export function evaluateProvisionEligibility({ code, legalStatus, provisionReference, provisionFunction, quotation, section }) {
  if (NON_OPERATIVE_PROVISION_FUNCTIONS.includes(provisionFunction)) return { route: 'NON_OBLIGATION', reasons: [] };
  const reasons = [];
  const expectedFunction = legalStatus === 'evidential' ? PROVISION_FUNCTIONS.EVIDENTIAL : PROVISION_FUNCTIONS.OPERATIVE;
  if (provisionFunction !== expectedFunction) {
    reasons.push(Object.values(PROVISION_FUNCTIONS).includes(provisionFunction) ? 'provision_not_operative' : 'provision_function_required');
  }
  const ref = parseProvisionReference(provisionReference);
  if (!ref || ref.marker !== code) reasons.push('provision_reference_required');
  if (!section || section.inLegalInstrument !== true || section.transitionalProvisions === true) {
    reasons.push('provision_not_in_instrument');
  } else if (ref && !(section.provisionsSetOut || []).includes(ref.core)) {
    reasons.push('provision_not_set_out_in_section');
  }
  if (legalStatus === 'binding' && provisionFunction === PROVISION_FUNCTIONS.OPERATIVE) {
    if (!hasDutyLanguage(quotation) || hasNonOperativeLanguage(quotation)) reasons.push('provision_not_operative');
  }
  return { route: reasons.length ? 'EXCEPTION' : 'OBLIGATION', reasons: [...new Set(reasons)] };
}
