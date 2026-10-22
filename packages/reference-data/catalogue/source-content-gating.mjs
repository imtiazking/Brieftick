/**
 * Central RI use-case gating from observed content classes (semantic remediation).
 */

const NEWS_ONLY = new Set(['NEWS']);
const PRESS_ONLY = new Set(['PRESS_RELEASE']);
const OBLIGATION_CLASSES = new Set([
  'RULEBOOK',
  'PRIMARY_LEGISLATION',
  'SECONDARY_LEGISLATION',
  'FRAMEWORK',
  'STANDARD',
]);

/**
 * @param {string[]} contentClasses
 * @param {string[]} riUseCases
 * @returns {{ ok: boolean, violations: string[] }}
 */
export function validateRiUseGating(contentClasses, riUseCases) {
  const classes = new Set(contentClasses || []);
  const uses = new Set(riUseCases || []);
  const violations = [];

  const onlyNews = classes.size > 0 && [...classes].every((c) => NEWS_ONLY.has(c));
  const onlyPress = classes.size > 0 && [...classes].every((c) => PRESS_ONLY.has(c));

  if (uses.has('RULE_OBLIGATION_SOURCE')) {
    const hasObligationClass = [...classes].some((c) => OBLIGATION_CLASSES.has(c));
    if (!hasObligationClass) {
      violations.push('RULE_OBLIGATION_SOURCE requires authoritative rule/legislation class');
    }
    if (onlyNews || onlyPress) {
      violations.push('NEWS/PRESS_RELEASE alone cannot support RULE_OBLIGATION_SOURCE');
    }
  }

  if (classes.has('SANCTIONS_DATA') && classes.has('SANCTIONS_POLICY')) {
    violations.push('SANCTIONS_DATA and SANCTIONS_POLICY should not be combined on one RI policy connector');
  }

  return { ok: violations.length === 0, violations };
}
