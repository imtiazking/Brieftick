/**
 * Routes prompts through entity resolution, then Logic modules.
 * @module logic/logicRouter
 */

import { resolveEntities, resolvePrimaryEntity } from "./entityResolver.js";
import { logicDebug } from "./shared.js";
import { runMarketPulseLogic } from "./marketPulseLogic.js";
import { runTickerIntelligenceLogic } from "./tickerIntelligenceLogic.js";
import { runPortfolioLogic } from "./portfolioLogic.js";
import { runSectorRotationLogic } from "./sectorRotationLogic.js";
import { runRiskRegimeLogic } from "./riskRegimeLogic.js";
import { runDailyBriefLogic } from "./dailyBriefLogic.js";
import { runScenarioAnalysisLogic } from "./scenarioAnalysisLogic.js";

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
    /risk regime|market risk|today.?s market risk|risk-on|risk-off|risk on|risk off|volatility regime|show risk/.test(
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

  if (
    /what happens if|scenario|if rates|if oil|if tech|hypothetical|what if/.test(t)
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
    !entity.symbol
  )
    return "market-pulse";

  if (
    /latest news|news on|headline|why is|why are|what changed|moving today|move today|what is .* doing|explain/.test(
      t
    ) ||
    entity.entityType === "company" ||
    entity.entityType === "ticker" ||
    (entity.symbol && !/portfolio|sector rotation|risk regime|daily brief/.test(t))
  )
    return "ticker";

  if (entity.entityType === "macro") return "market-pulse";

  return "market-pulse";
}

/**
 * @param {string} prompt
 * @param {import('./types.js').LogicMode} [modeOverride]
 */
export async function routeLogicPrompt(prompt, modeOverride) {
  const entities = resolveEntities(prompt);
  const primaryEntity = resolvePrimaryEntity(prompt);
  const mode = modeOverride || detectLogicMode(prompt, primaryEntity);

  logicDebug("detected_entity", { primaryEntity, entities });
  logicDebug("selected_module", { mode, prompt: prompt.slice(0, 120) });

  const ctx = { prompt, primaryEntity, entities, mode };

  switch (mode) {
    case "ticker":
      return runTickerIntelligenceLogic(ctx);
    case "portfolio":
      return runPortfolioLogic(ctx);
    case "sector-rotation":
      return runSectorRotationLogic(ctx);
    case "risk-regime":
      return runRiskRegimeLogic(ctx);
    case "daily-brief":
      return runDailyBriefLogic(ctx);
    case "scenario":
      return runScenarioAnalysisLogic(ctx);
    case "market-pulse":
    default:
      return runMarketPulseLogic(ctx);
  }
}
