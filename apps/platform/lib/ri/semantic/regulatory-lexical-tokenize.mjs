/**
 * Lexical tokenisation for regulatory BM25 (offline eval only).
 * Preserves publication refs (PS22/9), PRIN 2A, and common regulatory phrases.
 */

const REF_RE =
  /\b(PS|FG|CP|GC|DP|SUP|TR|PERG|COBS|SYSC|PRIN|MIFIDPRU)\s*(\d{1,3})\s*\/\s*(\d{1,3})\b/gi;
const PRIN_OUTCOME_RE = /\bprin\s*2a\b/gi;
const PHRASE_RE =
  /\b(consumer duty|vulnerable customers?|app fraud|authorised push payment|aml|sanctions screening|financial crime|payment corridor|risk[- ]based approach)\b/gi;

/**
 * @param {string} text
 * @returns {string[]}
 */
export function tokenizeRegulatoryText(text) {
  const raw = String(text || '').toLowerCase();
  const phrases = [];
  let normalized = raw.replace(REF_RE, (_, a, b, c) => {
    const tok = `${a}${b}/${c}`.replace(/\s+/g, '');
    phrases.push(tok);
    return ` ${tok} `;
  });
  normalized = normalized.replace(PRIN_OUTCOME_RE, ' prin2a ');
  normalized = normalized.replace(PHRASE_RE, (m) => {
    const compact = m.replace(/\s+/g, '_');
    phrases.push(compact);
    return ` ${compact} `;
  });

  const base = normalized.match(/[a-z0-9][a-z0-9_/.-]*/g) || [];
  return [...base, ...phrases].filter((t) => t.length > 1);
}
