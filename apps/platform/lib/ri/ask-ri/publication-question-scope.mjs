/**
 * Shared publication scoping helpers for Ask RI catalogue evidence.
 */
import {
  CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION,
  extractPublicationTitlePhrases,
  questionMentionsPublicationReference,
} from './publication-pdf-question-match.mjs';

export const FAIR_VALUE_CONSUMER_FINANCE_PUBLICATION_ID = '56b0beca-d8c3-4267-a794-9079009af661';

export { extractPublicationTitlePhrases, questionMentionsPublicationReference };

/** True when the user explicitly wants PDF/FG22 supplement evidence (not negated). */
export function questionRequestsPdfSupplement(question) {
  const q = String(question || '');
  if (/\bhtml[- ]only\b/i.test(q)) return false;
  if (/\b(?:do not|without|not)\s+use\s+pdf\b/i.test(q)) return false;
  if (/\b(?:do not|without)\s+(?:use\s+)?(?:pdf|PDF)\b/i.test(q)) return false;
  if (/\bno\s+pdf\b/i.test(q)) return false;
  return (
    /\b(?:show|including|provide|use)\b[\s\S]{0,40}\bpdf\b/i.test(q) ||
    /\bpdf\s+citations?\b/i.test(q) ||
    /\bFG\s*22\b/i.test(q)
  );
}
