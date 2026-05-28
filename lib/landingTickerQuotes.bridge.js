/**
 * Expose landing ticker helpers on window for index.html inline scripts.
 */
import {
  LANDING_MACRO_SYMBOLS,
  LANDING_MACRO_FETCH_MAP,
  LANDING_MACRO_ETF_PROXY,
  HERO_STRIP_SYMBOLS,
  mapSymbolForProvider,
  mapProviderTickerToDisplay,
  landingEquitySymbolsFromTickerData,
  patchGlobalTickerItem,
  patchHeroStripMarket,
  markStaleTickerPlaceholders,
} from "./landingTickerQuotes.js";

window.BrieftickLandingTicker = {
  LANDING_MACRO_SYMBOLS,
  LANDING_MACRO_FETCH_MAP,
  LANDING_MACRO_ETF_PROXY,
  HERO_STRIP_SYMBOLS,
  mapSymbolForProvider,
  mapProviderTickerToDisplay,
  landingEquitySymbolsFromTickerData,
  patchGlobalTickerItem,
  patchHeroStripMarket,
  markStaleTickerPlaceholders,
};
