/**
 * Scenario Analysis Logic — delegates to scenarioEngine + impactAnalysis pipeline.
 * @module logic/scenarioAnalysisLogic
 */

import { runScenarioEngine } from "./engines/scenarioEngine.js";
import { runImpactAnalysis } from "./engines/impactAnalysis.js";

/** @param {object} ctx */
export async function runScenarioAnalysisLogic(ctx) {
  const scenarioResult = runScenarioEngine(ctx.prompt, ctx.primaryEntity);
  return runImpactAnalysis(scenarioResult, ctx);
}
