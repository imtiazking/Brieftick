/**
 * Per-query ticker context reset — no stale symbol/sector/fallback bleed.
 * @module logic/engines/tickerQueryContext
 */

import { resetTickerVoiceSession } from "./tickerVoiceVariation.js";
import { logicDebug } from "../logicDebug.js";

/**
 * Hard-reset ticker session state before each Logic request.
 */
export function resetTickerQueryContext() {
  resetTickerVoiceSession();
  if (globalThis.__logicTickerVoicePatterns) globalThis.__logicTickerVoicePatterns.length = 0;
  if (typeof window !== "undefined") {
    window.__logicLastResolvedTicker = null;
    window.__logicLastTickerSector = null;
    window.__logicLastFallbackCopy = null;
    window.__logicPreviousResolvedEntity = null;
  }
  if (globalThis.__logicLastResolvedTicker !== undefined) {
    globalThis.__logicLastResolvedTicker = null;
  }
  logicDebug("tickerQueryContext.reset", "cleared");
}

/**
 * @param {{ symbol: string, name?: string, sectorType?: string }} entity
 */
export function rememberResolvedTicker(entity) {
  if (!entity?.symbol) return;
  const payload = {
    symbol: entity.symbol,
    name: entity.name,
    sectorType: entity.sectorType,
    at: Date.now(),
  };
  if (typeof window !== "undefined") {
    window.__logicLastResolvedTicker = payload;
  }
  globalThis.__logicLastResolvedTicker = payload;
  logicDebug("tickerQueryContext.remember", payload);
}
