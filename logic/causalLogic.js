/**
 * Causal Logic — mechanism-first answers for conceptual market questions.
 * @module logic/causalLogic
 */

import { buildLogicResponse } from "./types.js";
import { callLogicLLM, getHeadlines, withDataLimited } from "./shared.js";
import { filterHeadlinesForPrompt } from "./engines/topicContext.js";
import {
  runCausalReasoningEngine,
  buildCausalCards,
} from "./engines/causalReasoningEngine.js";
import { composeLogicResponse } from "./engines/responseComposer.js";

/**
 * @param {object} ctx
 */
export async function runCausalLogic(ctx) {
  const prompt = ctx.prompt || "";
  const fusion = ctx.fusion;
  const failedSources = [...(fusion?.failedSources || [])];
  const model = runCausalReasoningEngine(prompt);

  let headlineSupport = "";
  const headlines = fusion?.news?.headlines || [];
  if (headlines.length) {
    const top = filterHeadlinesForPrompt(headlines, prompt).slice(0, 2);
    if (top.length) headlineSupport = top.map((n) => n.headline).join(" · ");
  } else {
    const pack = await getHeadlines(6);
    const top = filterHeadlinesForPrompt(pack.headlines, prompt).slice(0, 1);
    if (top[0]) headlineSupport = top[0].headline;
    failedSources.push(...(pack.failedSources || []));
  }

  const causalFrame = `CAUSAL MODEL (use as backbone — do not replace with headlines):
Cause: ${model.cause}
First-order: ${model.firstOrderEffects.join(" | ")}
Second-order: ${model.secondOrderEffects.join(" | ")}
Sector winners: ${model.sectorWinners.join(" | ")}
Sector losers: ${model.sectorLosers.join(" | ")}
Pricing power: ${model.pricingPowerShift}
Macro transmission: ${model.macroTransmission}
Supply chain: ${model.supplyChainNote}
${headlineSupport ? `OPTIONAL headline context (support only, never lead answer): ${headlineSupport}` : ""}`;

  const ai = await callLogicLLM(
    `You are Brieftick Logic causal reasoning engine. Educational market intelligence only.
Rules:
- Answer the user's question with CAUSAL MECHANISM first. Never lead with a Reuters headline or index tape.
- directAnswer: 2-3 sentences naming sector winners AND losers and pricing power shift.
- Do NOT mention SPY, QQQ, or "tape" unless the user asked about indices.
- cards.catalyst = cause → first-order effect → second-order effect (chain, not headline).
- cards.sectorImpact = sector winners; optional sectorRisks = losers.
- No buy/sell/hold. No exact probabilities.
- Headlines are optional context only.`,
    `USER QUESTION: ${prompt}\n\n${causalFrame}`,
    780
  );

  if (ai) {
    const cleaned = scrubCausalAiResponse(ai);
    const merged = {
      ...cleaned,
      directAnswer:
        cleaned.directAnswer ||
        cleaned.cards?.snapshot ||
        buildCausalCards(model, prompt, headlineSupport).directAnswer,
      mode: "causal",
      modeLabel: "Causal Market Logic",
      questionKind: ctx.questionKind || "causal",
      usedAI: true,
      mockData: !fusion?.live,
      sources: ["Brieftick Logic · Causal Reasoning"],
    };
    return composeLogicResponse(merged, { ...ctx, mode: "causal", skipTape: true });
  }

  const built = buildCausalCards(model, prompt, headlineSupport);
  const partial = buildLogicResponse({
    ...built,
    confidence: 66,
    sources: ["Brieftick Logic · Causal Reasoning"],
    mode: "causal",
    modeLabel: "Causal Market Logic",
    mockData: !fusion?.live,
  });

  return composeLogicResponse(
    withDataLimited({ ...partial, questionKind: "causal" }, failedSources),
    { ...ctx, mode: "causal", skipTape: true }
  );
}

/**
 * @param {import('./types.js').LogicResponse} ai
 */
function scrubCausalAiResponse(ai) {
  const strip = (s) =>
    String(s || "")
      .replace(/\bTape:\s*SPY[^.]*\.?/gi, "")
      .replace(/\bSPY\s*[+-]?\d+\.?\d*%/gi, "")
      .replace(/Reuters|Bloomberg|AP News/gi, "")
      .replace(/\s+/g, " ")
      .trim();

  const cards = { ...(ai.cards || {}) };
  for (const k of Object.keys(cards)) cards[k] = strip(cards[k]);

  return {
    ...ai,
    title: strip(ai.title) || ai.title,
    directAnswer: strip(ai.directAnswer),
    summary: strip(ai.summary),
    cards,
    optionalCards: ai.optionalCards
      ? Object.fromEntries(
          Object.entries(ai.optionalCards).map(([k, v]) => [k, strip(v)])
        )
      : {},
  };
}
