/**
 * Routes natural-language prompts to specialized agents.
 * @module agents/agentRouter
 */

import { runMarketPulseAgent } from "./marketPulseAgent.js";
import { runTickerIntelligenceAgent } from "./tickerIntelligenceAgent.js";
import { runPortfolioIntelligenceAgent } from "./portfolioIntelligenceAgent.js";
import { runSectorRotationAgent } from "./sectorRotationAgent.js";
import { runRiskRegimeAgent } from "./riskRegimeAgent.js";
import { runDailyBriefAgent } from "./dailyBriefAgent.js";
import { runScenarioAnalysisAgent } from "./scenarioAnalysisAgent.js";
import { extractTickers } from "./shared.js";

/**
 * @param {string} prompt
 * @returns {import('./types.js').AgentMode}
 */
export function detectAgentMode(prompt) {
  const t = (prompt || "").toLowerCase().trim();
  if (!t) return "market-pulse";

  if (
    /portfolio|holdings|concentration|diversif|exposure|my book/.test(t) &&
    !/why is|explain \w+/.test(t)
  )
    return "portfolio";

  if (
    /risk regime|risk-on|risk-off|risk on|risk off|volatility regime|show risk/.test(t)
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

  if (/sector rotation|leading sector|lagging sector|rotation/.test(t))
    return "sector-rotation";

  if (
    /market pulse|overall market|market direction|today.?s tape|explain today|market tone|explain today.?s market/.test(
      t
    )
  )
    return "market-pulse";

  if (
    /why is|why are|what changed in|moving today|move today|what is .* doing/.test(
      t
    ) ||
    (extractTickers(t).length &&
      !/portfolio|sector rotation|risk regime|daily brief|market brief/.test(t))
  )
    return "ticker";

  return "market-pulse";
}

/**
 * @param {string} prompt
 * @param {import('./types.js').AgentMode} [modeOverride]
 */
export async function routeAgentPrompt(prompt, modeOverride) {
  const mode = modeOverride || detectAgentMode(prompt);

  switch (mode) {
    case "ticker":
      return runTickerIntelligenceAgent(prompt);
    case "portfolio":
      return runPortfolioIntelligenceAgent(prompt);
    case "sector-rotation":
      return runSectorRotationAgent(prompt);
    case "risk-regime":
      return runRiskRegimeAgent(prompt);
    case "daily-brief":
      return runDailyBriefAgent(prompt);
    case "scenario":
      return runScenarioAnalysisAgent(prompt);
    case "market-pulse":
    default:
      return runMarketPulseAgent(prompt);
  }
}
