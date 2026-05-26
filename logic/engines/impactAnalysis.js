/**
 * Impact analysis — maps scenario frames to Intelligence Cards output.
 * Runs after scenarioEngine, before confidenceEngine.
 *
 * @module logic/engines/impactAnalysis
 */

import { buildLogicResponse } from "../types.js";
import {
  buildFusionPromptExtras,
  callLogicLLM,
  getPortfolioHoldings,
  withDataLimited,
} from "../shared.js";
import { getFusedQuote } from "../dataFusion.js";
import { logicDebug } from "../shared.js";

/**
 * @param {import('./scenarioEngine.js').ScenarioEngineResult} scenarioResult
 * @param {object} ctx
 * @returns {import('../types.js').LogicResponse}
 */
export async function runImpactAnalysis(scenarioResult, ctx) {
  const frame = scenarioResult.primary;
  const prompt = ctx.prompt || "";
  const fusion = ctx.fusion;
  const failedSources = [...(fusion?.failedSources || [])];
  const holdings = getPortfolioHoldings();
  const portSymbols = holdings.length
    ? holdings.map((h) => h.symbol).join(", ")
    : "no saved holdings (sample growth-tilted context)";

  const spy = fusion ? getFusedQuote(fusion, "SPY") : null;
  const vixHint = fusion?.volatility
    ? `${fusion.volatility.vixLabel} · ${fusion.volatility.regime}`
    : "volatility context limited";

  const marketCtx = `SCENARIO: ${frame.label}
HEADLINE: ${frame.headline}
LIKELIHOOD FRAMING: ${frame.likelihoodPhrase} (qualitative only — never assign exact %)
BULLISH PATH: ${frame.bullishOutcomes.join(" | ")}
BEARISH PATH: ${frame.bearishOutcomes.join(" | ")}
SECOND-ORDER: ${frame.secondOrderEffects.join(" | ")}
PRICING: ${frame.pricingInterpretation}
PORTFOLIO: ${portSymbols}
${buildFusionPromptExtras(ctx, ctx.primaryEntity?.symbol || "SPY")}
SPY: ${spy?.pctChange != null ? `${spy.pctChange >= 0 ? "+" : ""}${spy.pctChange.toFixed(2)}%` : "unavailable"}
VOL: ${vixHint}`;

  const ai = await callLogicLLM(
    `You are Brieftick Logic scenario impact analysis. Educational market intelligence only.
Rules:
- Never predict exact outcomes or assign numeric probabilities.
- Use phrases like: low probability, moderate probability, elevated likelihood, markets appear to be pricing in, investors may interpret.
- No buy/sell/hold or trade advice.
- Fill cards for: Scenario Snapshot, Market Impact, Sector Winners, Sector Risks, Volatility Outlook, Logic Summary.
- optional sectorRisks in cards or as separate bearish sector bullet list in sectorImpact if needed.`,
  `${prompt}\n\n${marketCtx}`,
  820
  );

  if (ai) {
    return {
      ...enrichScenarioCards(ai, frame, portSymbols),
      mode: "scenario",
      modeLabel: "Scenario Logic",
      scenarioId: frame.id,
      usedAI: true,
      mockData: !fusion?.live,
      sources: ai.sources?.length ? ai.sources : ["Brieftick Logic · Scenario Engine"],
    };
  }

  logicDebug("impactAnalysis", "template path");
  return buildTemplateImpact(scenarioResult, ctx, failedSources, portSymbols, spy);
}

/**
 * @param {import('../types.js').LogicResponse} ai
 * @param {import('./scenarioEngine.js').ScenarioFrame} frame
 * @param {string} portSymbols
 */
function enrichScenarioCards(ai, frame, portSymbols) {
  const cards = { ...(ai.cards || {}) };
  return {
    ...ai,
    cards: {
      snapshot:
        cards.snapshot ||
        `${frame.headline} — ${frame.likelihoodPhrase} in narrative terms, not a forecast.`,
      catalyst:
        cards.catalyst ||
        `${frame.bullishOutcomes[0]} Conversely, ${frame.bearishOutcomes[0]?.toLowerCase() || "risk assets may reprice."}`,
      macroContext:
        cards.macroContext ||
        frame.secondOrderEffects.slice(0, 2).join(" "),
      sectorImpact:
        cards.sectorImpact ||
        frame.bullishOutcomes.slice(1, 3).join(" "),
      volatility:
        cards.volatility ||
        `Volatility may rise or compress depending on whether investors treat this as a growth or inflation surprise; ${frame.likelihoodPhrase} of sustained vol expansion.`,
      aiSummary:
        cards.aiSummary ||
        ai.summary ||
        `${frame.pricingInterpretation} Portfolio context (${portSymbols}) may feel factor and concentration effects.`,
    },
    optionalCards: {
      ...(ai.optionalCards || {}),
      sectorRisks:
        ai.optionalCards?.sectorRisks ||
        frame.bearishOutcomes.slice(0, 3).join(" "),
      portfolioImpact:
        ai.optionalCards?.portfolioImpact ||
        `Investors may interpret exposure through ${portSymbols}; second-order effects may lag the initial move.`,
    },
    keyDrivers: ai.keyDrivers?.length
      ? ai.keyDrivers
      : [
          frame.headline,
          frame.pricingInterpretation,
          frame.secondOrderEffects[0],
        ],
    signals: ai.signals?.length
      ? ai.signals
      : [
          `Bullish path: ${frame.bullishOutcomes[0]}`,
          `Bearish path: ${frame.bearishOutcomes[0]}`,
        ],
  };
}

/**
 * @param {import('./scenarioEngine.js').ScenarioEngineResult} scenarioResult
 * @param {object} ctx
 * @param {string[]} failedSources
 * @param {string} portSymbols
 * @param {import('../dataFusion.js').FusedQuote | null} spy
 */
function buildTemplateImpact(scenarioResult, ctx, failedSources, portSymbols, spy) {
  const frame = scenarioResult.primary;
  const alt = scenarioResult.alternatives[0];

  const snapshot = `${frame.headline} This is framed as ${frame.likelihoodPhrase} — a scenario lens, not a prediction.`;
  const marketImpact = `Equities may split between ${frame.bullishOutcomes[0]?.toLowerCase()} and ${frame.bearishOutcomes[0]?.toLowerCase()}. Rates and commodities may co-move with the macro narrative.`;
  const sectorWinners = frame.bullishOutcomes.slice(0, 2).join(" ");
  const sectorRisks = frame.bearishOutcomes.slice(0, 3).join(" ");
  const volOutlook = `Volatility may rise if the scenario surprises positioning, or compress if markets appear to be pricing it in already. Current tape: ${spy?.pctChange != null ? `SPY ${spy.pctChange >= 0 ? "+" : ""}${spy.pctChange.toFixed(2)}%` : "index context limited"}.`;
  const summary = `${frame.pricingInterpretation} ${frame.secondOrderEffects[0] || ""} Portfolio (${portSymbols}) may see uneven factor exposure.`;

  const partial = buildLogicResponse({
    title: `Scenario Logic: ${frame.label}`,
    summary,
    cards: {
      snapshot,
      catalyst: marketImpact,
      macroContext: frame.secondOrderEffects.join(" "),
      sectorImpact: sectorWinners,
      volatility: volOutlook,
      aiSummary: summary,
    },
    optionalCards: {
      sectorRisks,
      portfolioImpact: `Second-order effects on portfolios: concentration in growth, energy, or duration may amplify moves. Context: ${portSymbols}.`,
    },
    keyDrivers: [
      frame.headline,
      frame.pricingInterpretation,
      alt ? `Alternative lens: ${alt.label}` : frame.secondOrderEffects[0],
    ].filter(Boolean),
    signals: [
      `Elevated likelihood path: ${frame.bearishOutcomes[0]}`,
      `Moderate probability path: ${frame.bullishOutcomes[0]}`,
    ],
    confidence: 58,
    sources: ["Brieftick Logic · Scenario Engine"],
    mode: "scenario",
    modeLabel: "Scenario Logic",
    mockData: true,
  });

  return withDataLimited({ ...partial, scenarioId: frame.id }, failedSources);
}
