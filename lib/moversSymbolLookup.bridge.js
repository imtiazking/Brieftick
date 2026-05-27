/**
 * Expose Movers symbol lookup on window for inline index.html scripts.
 */
import {
  lookupMoversSymbol,
  resolveMoversSymbolFromPrompt,
  resolveMoversSymbolInput,
  searchMoversDirectory,
  extractTickerCandidate,
} from "./moversSymbolLookup.js";

window.BrieftickMoversLookup = {
  lookupMoversSymbol,
  resolveMoversSymbolFromPrompt,
  resolveMoversSymbolInput,
  searchMoversDirectory,
  extractTickerCandidate,
};

window.resolveTickerInput = resolveMoversSymbolInput;
