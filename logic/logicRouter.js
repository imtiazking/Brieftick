/**
 * Public Logic API — pipeline entry points.
 * @module logic/logicRouter
 */

export { detectLogicMode } from "./modeDetect.js";
export { detectIntent, INTENT_LABELS } from "./intentDetect.js";
export { executeLogicPipeline as routeLogicPrompt } from "./logicEngine.js";
