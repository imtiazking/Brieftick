/**
 * Strategist query gate — macro interpretation vs news/briefing routing.
 * @module logic/engines/strategistQueryGate
 */

const EXPLICIT_NEWS =
  /latest\s+(on|about|regarding)|what.?'?s the latest|update on|news on|headline|headline today|breaking news|what happened|what.?'?s happening|happening in|situation in|status of|current news|any news|tell me about|breaking/i;

const STRATEGIST_SIGNAL =
  /consensus trade|consensus.*(overcrowd|crowded|one-sided)|overcrowd|crowded trade|crowded positioning|one-sided trade|de-?gross|unwind risk|markets? ignoring|market ignoring|risks? (are )?markets ignoring|underpric|underpriced|underpricing|overlooked by markets|not pricing|hidden fragil|fragilit|complacent|asymmetric|what breaks first|breaks first|what matters most|care about most|cross.?asset diverg|breadth deterior|volatility compression|concentration risk|positioning imbalance|factor crowding|what trade looks|which trade looks|macro structure|market structure|liquidity tighten|financial conditions tighten/i;

const ANALYTICAL_WHAT =
  /^what\s+(consensus|trade|positioning|fragil|risk|regime|happens|would|breaks|matters|hidden|conditions)/i;

/**
 * True only when user clearly wants headlines / updates.
 * @param {string} prompt
 */
export function isExplicitNewsQuery(prompt) {
  const t = (prompt || "").toLowerCase();
  return EXPLICIT_NEWS.test(t) || (/latest|update|news|today/i.test(t) && t.length < 120);
}

/**
 * Positioning / fragility / consensus / regime-style questions — NOT news.
 * @param {string} prompt
 */
export function isStrategistInterpretationQuery(prompt) {
  const t = (prompt || "").toLowerCase().trim();
  if (!t || t.length < 12) return false;
  if (isExplicitNewsQuery(prompt)) return false;
  if (/^why\s+(is|are)\s+(spy|qqq|the market|stocks)\s+moving/i.test(t)) return false;

  if (STRATEGIST_SIGNAL.test(t)) return true;
  if (ANALYTICAL_WHAT.test(t) && !/latest|headline|news on|update on/i.test(t)) return true;

  if (
    /^what\s+.+\?$/i.test(t) &&
    /(overcrowd|ignoring|underpric|fragil|consensus|positioning|crowded|breaks first|regime|liquidity)/i.test(t)
  ) {
    return true;
  }

  return false;
}
