/**
 * Fusion signal helpers — shared market state from fused quotes & sectors.
 * @module logic/engines/fusionSignals
 */

import { getFusedQuote } from "../dataFusion.js";

/**
 * @typedef {Object} FusionMarketState
 * @property {number|null} spyPct
 * @property {number|null} qqqPct
 * @property {number|null} iwmPct
 * @property {number|null} tltPct
 * @property {number|null} hygPct
 * @property {number|null} xlkPct
 * @property {number|null} xlyPct
 * @property {number|null} xlfPct
 * @property {number|null} xlePct
 * @property {string} vixLabel
 * @property {string} volRegime
 * @property {string} sentimentLabel
 * @property {boolean} techOutperforming
 * @property {boolean} cyclicalsLagging
 * @property {boolean} bondsOutperformingEquities
 * @property {boolean} smallCapLagging
 * @property {boolean} volCompressed
 * @property {boolean} equitiesFirm
 * @property {boolean} hasQuotes
 */

/**
 * @param {import('../dataFusion.js').FusionBundle} [fusion]
 * @returns {FusionMarketState}
 */
export function readFusionMarketState(fusion) {
  const q = (sym) => (fusion ? getFusedQuote(fusion, sym)?.pctChange : null);
  const spyPct = q("SPY");
  const qqqPct = q("QQQ");
  const iwmPct = q("IWM");
  const tltPct = q("TLT");
  const hygPct = q("HYG");
  const xlkPct = q("XLK");
  const xlyPct = q("XLY");
  const xlfPct = q("XLF");
  const xlePct = q("XLE");

  const vixLabel = fusion?.volatility?.vixLabel || "";
  const volRegime = fusion?.volatility?.regime || "";
  const sentimentLabel = fusion?.sentiment?.label || "";

  const techRef = xlkPct ?? qqqPct;
  const cyclicalRef = xlyPct ?? xlfPct;
  const techOutperforming =
    techRef != null && spyPct != null && techRef - spyPct > 0.15;
  const cyclicalsLagging =
    cyclicalRef != null && spyPct != null && cyclicalRef - spyPct < -0.1;
  const bondsOutperformingEquities =
    tltPct != null && spyPct != null && tltPct > spyPct + 0.2;
  const smallCapLagging = iwmPct != null && spyPct != null && iwmPct < spyPct - 0.2;
  const volCompressed = /compress|low|subdued|muted/i.test(
    `${vixLabel} ${volRegime}`
  );
  const equitiesFirm = spyPct != null && spyPct > 0;

  const hasQuotes = [spyPct, qqqPct, tltPct].some((v) => v != null);

  return {
    spyPct,
    qqqPct,
    iwmPct,
    tltPct,
    hygPct,
    xlkPct,
    xlyPct,
    xlfPct,
    xlePct,
    vixLabel,
    volRegime,
    sentimentLabel,
    techOutperforming,
    cyclicalsLagging,
    bondsOutperformingEquities,
    smallCapLagging,
    volCompressed,
    equitiesFirm,
    hasQuotes,
  };
}
