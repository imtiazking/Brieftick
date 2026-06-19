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
import {
  concise,
  filterHeadlinesForPrompt,
} from "./topicContext.js";
import { getHeadlines } from "../shared.js";

/**
 * @param {import('./scenarioEngine.js').ScenarioEngineResult} scenarioResult
 * @param {object} ctx
 * @returns {import('../types.js').LogicResponse}
 */
export async function runImpactAnalysis(scenarioResult, ctx) {
  if (scenarioResult.queryKind === "briefing") {
    return runGeopoliticalBriefing(scenarioResult, ctx);
  }

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
    `You are FORGENIQ Logic scenario impact analysis. Educational market intelligence only.
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
      sources: ai.sources?.length ? ai.sources : ["FORGENIQ Logic · Scenario Engine"],
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
    sources: ["FORGENIQ Logic · Scenario Engine"],
    mode: "scenario",
    modeLabel: "Scenario Logic",
    mockData: true,
  });

  return withDataLimited({ ...partial, scenarioId: frame.id }, failedSources);
}

/**
 * Current-events briefing — concise, topic-filtered (e.g. Iran conflict).
 * @param {import('./scenarioEngine.js').ScenarioEngineResult} scenarioResult
 * @param {object} ctx
 */
async function runGeopoliticalBriefing(scenarioResult, ctx) {
  const frame = scenarioResult.primary;
  const prompt = ctx.prompt || "";
  const fusion = ctx.fusion;
  const failedSources = [...(fusion?.failedSources || [])];

  let headlines =
    fusion?.relatedHeadlines?.length
      ? fusion.relatedHeadlines
      : fusion?.news?.headlines || [];
  if (!headlines.length) {
    const pack = await getHeadlines(12);
    headlines = pack.headlines;
    failedSources.push(...(pack.failedSources || []));
  }
  const relevant = filterHeadlinesForPrompt(headlines, prompt);
  const top = (relevant.length ? relevant : headlines).slice(0, 4);
  const topicLabel =
    scenarioResult.topics?.includes("iran")
      ? "Iran / Middle East conflict"
      : scenarioResult.topics?.[0]?.replace("_", " ") || "Geopolitical conflict";

  const spy = fusion ? getFusedQuote(fusion, "SPY") : null;
  const oil = fusion ? getFusedQuote(fusion, "XLE") : null;
  const tape =
    spy?.pctChange != null
      ? `SPY ${spy.pctChange >= 0 ? "+" : ""}${spy.pctChange.toFixed(2)}%`
      : null;
  const energy =
    oil?.pctChange != null
      ? `Energy (XLE) ${oil.pctChange >= 0 ? "+" : ""}${oil.pctChange.toFixed(2)}%`
      : null;

  const headlineBullets = top
    .map((n) => `- ${n.headline}${n.source ? ` (${n.source})` : ""}`)
    .join("\n");

  const briefingCtx = `USER QUESTION: ${prompt}
TOPIC: ${topicLabel}
RELEVANT HEADLINES (use these — do not invent):
${headlineBullets || "- No topic-filtered headlines; use general conflict framing only"}
TAPE: ${[tape, energy].filter(Boolean).join(" · ") || "limited"}
FRAMING: ${frame.pricingInterpretation}`;

  const ai = await callLogicLLM(
    `You are FORGENIQ Logic — geopolitical market briefing. Answer the user's question directly in the first card.
Rules:
- MAX 2 short sentences per card field. No filler like "indices tracked" or "volatility monitored".
- Lead with what the conflict headline means for markets NOW.
- Use only provided headlines; cite the story theme, not generic market pulse boilerplate.
- No buy/sell/hold. No exact probabilities.
- Use: markets appear to be pricing in, investors may interpret, elevated likelihood.
JSON cards: snapshot (direct answer), catalyst (key headline driver), macroContext (rates/oil/dollar), sectorImpact (winners), volatility (vol outlook), aiSummary (2 sentences max).`,
    briefingCtx,
    720
  );

  if (ai) {
    const tightened = tightenBriefingResponse(ai, top, topicLabel, tape);
    return {
      ...tightened,
      mode: "scenario",
      modeLabel: "Geopolitical Briefing",
      scenarioId: frame.id,
      usedAI: true,
      mockData: !fusion?.live,
      sources: ai.sources?.length ? ai.sources : ["FORGENIQ Logic · Geopolitical Briefing"],
    };
  }

  return buildBriefingTemplate(scenarioResult, ctx, top, failedSources, tape, energy);
}

/**
 * @param {import('../types.js').LogicResponse} ai
 * @param {object[]} topHeadlines
 * @param {string} topicLabel
 * @param {string|null} tape
 */
function tightenBriefingResponse(ai, topHeadlines, topicLabel, tape) {
  const lead = topHeadlines[0]?.headline;
  const cards = { ...(ai.cards || {}) };
  const snapshot =
    cards.snapshot ||
    (lead
      ? concise(
          `On ${topicLabel}: ${lead} Investors may interpret this through oil, defense, and risk-premium channels.`,
          220
        )
      : concise(ai.summary, 220));

  return {
    ...ai,
    title: ai.title?.includes("Iran") ? ai.title : `Geopolitical Briefing · ${topicLabel}`,
    summary: concise(ai.summary, 280),
    cards: {
      snapshot: concise(snapshot, 220),
      catalyst: concise(cards.catalyst || lead || "Headline-driven geopolitical risk", 200),
      macroContext: concise(
        cards.macroContext || "Oil, rates, and the dollar may co-move with escalation or de-escalation headlines.",
        200
      ),
      sectorImpact: concise(
        cards.sectorImpact || "Energy and defense may outperform on escalation; airlines and EM may lag.",
        200
      ),
      volatility: concise(
        cards.volatility ||
          (tape
            ? `Volatility may stay bid around headlines; tape: ${tape}.`
            : "Volatility may rise on surprise geopolitical headlines."),
        200
      ),
      aiSummary: concise(cards.aiSummary || ai.summary, 240),
    },
    optionalCards: {
      ...(ai.optionalCards || {}),
      sectorRisks: concise(
        ai.optionalCards?.sectorRisks ||
          "Travel, regional banks with EM exposure, and rate-sensitive growth may face headline risk.",
        200
      ),
    },
  };
}

/**
 * @param {import('./scenarioEngine.js').ScenarioEngineResult} scenarioResult
 * @param {object} ctx
 * @param {object[]} topHeadlines
 * @param {string[]} failedSources
 * @param {string|null} tape
 * @param {string|null} energy
 */
function buildBriefingTemplate(
  scenarioResult,
  ctx,
  topHeadlines,
  failedSources,
  tape,
  energy
) {
  const frame = scenarioResult.primary;
  const lead = topHeadlines[0]?.headline || "Geopolitical headlines are driving cross-asset moves";
  const second = topHeadlines[1]?.headline;

  const snapshot = concise(
    `${lead} Markets appear to be pricing in headline risk rather than a single clear outcome.${tape ? ` Tape: ${tape}.` : ""}`,
    240
  );

  return withDataLimited(
    {
      title: "Geopolitical Briefing · Iran / Middle East",
      summary: concise(
        `${lead} Investors may interpret escalation through oil, defense, and volatility channels — not a uniform equity move.`,
        280
      ),
      cards: {
        snapshot,
        catalyst: concise(lead, 200),
        macroContext: concise(
          `Oil and rates may react first; ${energy || "energy complex in focus"}. Dollar may firm on risk-off moves.`,
          200
        ),
        sectorImpact: concise(
          "Energy and defense may lead on escalation headlines; megacap tech may still anchor indices.",
          200
        ),
        volatility: concise(
          `Elevated likelihood of headline-driven vol spikes; ${tape || "monitor index and oil vol"}.`,
          200
        ),
        aiSummary: concise(
          second
            ? `Also in focus: ${second} Overall, a conflict briefing — not generic market pulse.`
            : frame.pricingInterpretation,
          240
        ),
      },
      optionalCards: {
        sectorRisks: concise(frame.bearishOutcomes.slice(0, 2).join(" "), 200),
      },
      keyDrivers: topHeadlines.slice(0, 3).map((n) => n.headline),
      signals: ["Headline-driven", "Oil / defense channel", tape || "Tape mixed"],
      confidence: topHeadlines.length >= 2 ? 64 : 52,
      sources: ["FORGENIQ Logic · Geopolitical Briefing"],
      mode: "scenario",
      modeLabel: "Geopolitical Briefing",
      scenarioId: frame.id,
      mockData: true,
    },
    failedSources
  );
}
