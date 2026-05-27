/**
 * Public Logic API — pipeline entry points.
 * @module logic/logicRouter
 */

export { detectLogicMode } from "./modeDetect.js";
export { detectIntent, INTENT_LABELS } from "./intentDetect.js";
export {
  executeLogicPipeline as routeLogicPrompt,
  executeLiveIntelligenceSession,
} from "./logicEngine.js";
export {
  parsePortfolioPaste,
  savePortfolioHoldings,
  loadSavedPortfolio,
} from "./portfolioParser.js";
export { importPortfolioFile } from "./engines/portfolioImportEngine.js";
export {
  getLogicWatchlist,
  addWatchlistSymbol,
  removeWatchlistSymbol,
  inferWatchlistExposure,
} from "./watchlistStore.js";
export {
  resolvePortfolioContext,
  hasExplicitPortfolio,
} from "./engines/inferredPortfolioContext.js";
