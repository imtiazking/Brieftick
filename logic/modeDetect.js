/**
 * Logic module detection from prompt + entity.
 * @module logic/modeDetect
 */

import { resolvePrimaryEntity } from "./entityResolver.js";
import { classifyQuestion } from "./questionIntent.js";

/**
 * @param {string} prompt
 * @param {import('./entityResolver.js').ResolvedEntity} [primaryEntity]
 * @returns {import('./types.js').LogicMode}
 */
export function detectLogicMode(prompt, primaryEntity) {
  const entity = primaryEntity || resolvePrimaryEntity(prompt);
  if (!(prompt || "").trim()) return "market-pulse";
  return classifyQuestion(prompt, entity).mode;
}
