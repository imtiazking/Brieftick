/**
 * Logic module detection from prompt + entity.
 * @module logic/modeDetect
 */

import { resolvePrimaryEntity } from "./entityResolver.js";
import { isGeopoliticalBriefingQuery } from "./engines/topicContext.js";

/**
 * @param {string} prompt
 * @param {import('./entityResolver.js').ResolvedEntity} [primaryEntity]
 * @returns {import('./types.js').LogicMode}
 */
export function detectLogicMode(prompt, primaryEntity) {
  const t = (prompt || "").toLowerCase().trim();
  const entity = primaryEntity || resolvePrimaryEntity(prompt);

  if (!t) return "market-pulse";

  if (
    /portfolio|holdings|concentration|diversif|exposure|my book|analyze my portfolio/.test(
      t
    ) &&
    !/news on|latest news/.test(t)
  )
    return "portfolio";

  if (
    /risk regime|market risk|today.?s market risk|current market risk|risk-on|risk-off|risk on|risk off|volatility regime|show risk/.test(
      t
    )
  )
    return "risk-regime";

  if (
    /daily brief|morning brief|give me.*brief|today.?s (market )?brief|session brief|market recap/.test(
      t
    )
  )
    return "daily-brief";

  if (isGeopoliticalBriefingQuery(prompt)) return "scenario";

  if (
    /what happens if|scenario|hypothetical|what if|peace deal|ceasefire|oil spike|crude surge|fed cut|rate cut|inflation cool|disinflation|recession|growth scare|ai spending|hyperscaler capex|geopolitical|energy shock|if rates|if oil|if tech/i.test(
      t
    )
  )
    return "scenario";

  if (
    /sector rotation|leading sector|lagging sector|rotation|ai sector|semiconductor/.test(
      t
    ) ||
    entity.entityType === "sector_theme"
  )
    return "sector-rotation";

  if (
    /market pulse|overall market|market direction|today.?s tape|explain today|market tone|explain today.?s market/.test(
      t
    ) &&
    !entity.symbol &&
    !isGeopoliticalBriefingQuery(prompt)
  )
    return "market-pulse";

  if (
    /latest news|news on|headline|why is|why are|what changed|moving today|move today|what is .* doing|explain/.test(
      t
    ) ||
    entity.entityType === "company" ||
    entity.entityType === "ticker" ||
    entity.entityType === "etf" ||
    entity.entityType === "index" ||
    (entity.symbol && !/portfolio|sector rotation|risk regime|daily brief/.test(t))
  )
    return "ticker";

  if (entity.entityType === "macro") return "market-pulse";

  return "market-pulse";
}
