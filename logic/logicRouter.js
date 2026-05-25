/**
 * Routes prompts through the Logic intelligence engine.
 * @module logic/logicRouter
 */

export { detectLogicMode } from "./modeDetect.js";
export { executeLogicPipeline as routeLogicPrompt } from "./logicEngine.js";
