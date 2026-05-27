/**
 * Logic module detection from prompt + entity.
 * @module logic/modeDetect
 */

import { resolvePrimaryEntity } from "./entityResolver.js";
import { classifyQuestion } from "./questionIntent.js";
import { resolveUserContext } from "./engines/userContext.js";
import { applyLogicRoute, planLogicRoute } from "./engines/planLogicRoute.js";

/**
 * @param {string} prompt
 * @param {import('./entityResolver.js').ResolvedEntity} [primaryEntity]
 * @returns {import('./types.js').LogicMode}
 */
export function detectLogicMode(prompt, primaryEntity) {
  const entity = primaryEntity || resolvePrimaryEntity(prompt);
  if (!(prompt || "").trim()) return "market-pulse";
  const userContext = resolveUserContext();
  const classified = classifyQuestion(prompt, entity, { userContext });
  const route = planLogicRoute(prompt, userContext, classified);
  return applyLogicRoute(classified, route).mode;
}
