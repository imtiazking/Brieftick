/**
 * Market briefing — concise answers for news, geopolitical, macro, rates, commodities, supply chain.
 * @module logic/briefingLogic
 */

import { buildLogicResponse } from "./types.js";
import {
  callLogicLLM,
  getHeadlines,
  withDataLimited,
  buildFusionPromptExtras,
} from "./shared.js";
import { getFusedQuote, fusionAttributionSources } from "./dataFusion.js";
import { filterHeadlinesForPrompt, concise } from "./engines/topicContext.js";
import { formatHeadlineSupport } from "./engines/headlineContext.js";
import { composeLogicResponse } from "./engines/responseComposer.js";
import { isStrategistInterpretationQuery } from "./engines/strategistQueryGate.js";
import { runMacroInterpretationLogic } from "./macroInterpretationLogic.js";

const KIND_FRAMING = {
  geopolitical: {
    title: "Geopolitical Briefing",
    lens: "conflict, sanctions, energy routes, defense, safe havens",
    sectors: "Energy and defense may lead on escalation; airlines, EM, and travel may lag.",
    vol: "Headline risk may keep vol bid; oil and gold often react first.",
  },
  news: {
    title: "Market News Briefing",
    lens: "headline flow and cross-asset read-through",
    sectors: "Leaders and laggards follow the dominant headline theme.",
    vol: "Vol may spike on surprises, otherwise range-bound.",
  },
  macro: {
    title: "Macro Briefing",
    lens: "growth, labour, recession risk, and policy reaction function",
    sectors: "Cyclicals vs defensives rotate with growth expectations.",
    vol: "Macro surprises tend to move rates and vol together.",
  },
  rates: {
    title: "Rates & Inflation Briefing",
    lens: "Fed path, yields, real rates, and duration-sensitive equities",
    sectors: "Banks vs growth vs utilities split on curve shape.",
    vol: "Rates volatility often leads equity vol.",
  },
  commodities: {
    title: "Commodities Briefing",
    lens: "oil, energy equities, inflation pass-through, dollar",
    sectors: "Energy/materials vs transport and consumption.",
    vol: "Energy shocks can lift cross-asset vol.",
  },
  supply_chain: {
    title: "Supply Chain Briefing",
    lens: "shipping, logistics, inventories, industrial demand",
    sectors: "Industrials, transport, retail inventory names in focus.",
    vol: "Disruption headlines can gap industrial complexes.",
  },
  sector: {
    title: "Sector Briefing",
    lens: "sector ETF moves, rotation, and catalysts",
    sectors: "Relative strength vs SPY defines the story.",
    vol: "Sector vol rises when macro coupling is high.",
  },
};

/**
 * @param {object} ctx
 */
export async function runBriefingLogic(ctx) {
  const prompt = ctx.prompt || "";
  if (isStrategistInterpretationQuery(prompt)) {
    return runMacroInterpretationLogic({ ...ctx, mode: "macro-interpretation" });
  }
  const kind = ctx.questionKind || "news";
  const fusion = ctx.fusion;
  const failedSources = [...(fusion?.failedSources || [])];
  const frame = KIND_FRAMING[kind] || KIND_FRAMING.news;

  let headlines =
    fusion?.relatedHeadlines?.length
      ? fusion.relatedHeadlines
      : fusion?.news?.headlines || [];
  if (!headlines.length) {
    const pack = await getHeadlines(14);
    headlines = pack.headlines;
    failedSources.push(...(pack.failedSources || []));
  }
  const relevant = filterHeadlinesForPrompt(headlines, prompt);
  const top = (relevant.length ? relevant : headlines).slice(0, 5);
  const lead = top[0]?.headline;
  const headlineSupport = formatHeadlineSupport(top.length ? top : headlines, prompt);

  const spy = fusion ? getFusedQuote(fusion, "SPY") : null;
  const xle = fusion ? getFusedQuote(fusion, "XLE") : null;
  const tlt = fusion ? getFusedQuote(fusion, "TLT") : null;
  const tape = [
    spy?.pctChange != null ? `SPY ${spy.pctChange >= 0 ? "+" : ""}${spy.pctChange.toFixed(2)}%` : null,
    xle?.pctChange != null ? `XLE ${xle.pctChange >= 0 ? "+" : ""}${xle.pctChange.toFixed(2)}%` : null,
    tlt?.pctChange != null ? `TLT ${tlt.pctChange >= 0 ? "+" : ""}${tlt.pctChange.toFixed(2)}%` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const headlineBlock = top.map((n) => `- ${n.headline}`).join("\n") || "- No filtered headlines";

  const briefingCtx = `USER QUESTION (answer this first): ${prompt}
BRIEFING TYPE: ${kind}
LENS: ${frame.lens}
HEADLINES (support only — do not lead answer with these):
${headlineBlock}
${headlineSupport ? `SUPPORTING: ${headlineSupport}` : ""}
${ctx.mode === "causal" ? "" : `TAPE: ${tape || "limited"}`}
${ctx.mode === "causal" ? "" : buildFusionPromptExtras(ctx, "SPY")}`;

  const ai = await callLogicLLM(
    `You are Brieftick Logic. Answer the user's market question in plain English.
Rules:
- Put the direct answer in "directAnswer" (2-3 sentences max). Answer the question in sentence 1.
- Each card field max 2 short sentences. No generic filler ("indices tracked", "volatility monitored").
- Use only provided headlines for facts.
- No buy/sell/hold. No exact probabilities.
Return JSON with: title, directAnswer, summary, keyDrivers, signals, confidence, sources, cards { snapshot, catalyst, macroContext, sectorImpact, volatility, aiSummary }`,
    briefingCtx,
    750
  );

  if (ai) {
    const merged = {
      ...ai,
      directAnswer: ai.directAnswer || ai.cards?.snapshot || ai.summary,
      mode: "briefing",
      modeLabel: frame.title,
      questionKind: kind,
      usedAI: true,
      mockData: !fusion?.live,
      sources: fusion?.live ? fusionAttributionSources(fusion) : ai.sources,
    };
    return composeLogicResponse(merged, ctx);
  }

  const direct = lead
    ? concise(
        `Markets may read this through ${frame.lens}. ${headlineSupport || lead.slice(0, 100)}`,
        300
      )
    : concise(`Framing through ${frame.lens}. Mechanism-first read.`, 280);

  const partial = buildLogicResponse({
    title: frame.title,
    directAnswer: direct,
    summary: direct,
    cards: {
      snapshot: direct,
      catalyst: concise(lead || "Headline flow sets the narrative", 180),
      macroContext: concise(
        kind === "rates"
          ? "Yields and Fed expectations anchor cross-asset moves."
          : kind === "commodities"
            ? "Oil and dollar often move before broad equities."
            : "Macro backdrop filters how far headline risk travels.",
        180
      ),
      sectorImpact: concise(frame.sectors, 180),
      volatility: concise(tape ? `${frame.vol} (${tape})` : frame.vol, 180),
      aiSummary: direct,
    },
    keyDrivers: top.slice(0, 3).map((n) => n.headline),
    signals: ["Topic-filtered headlines", tape || "Tape limited"],
    confidence: top.length >= 2 ? 62 : 48,
    sources: ["Brieftick Logic · Briefing"],
    mode: "briefing",
    modeLabel: frame.title,
    mockData: !fusion?.live,
  });

  return composeLogicResponse(
    withDataLimited({ ...partial, questionKind: kind }, failedSources),
    ctx
  );
}
