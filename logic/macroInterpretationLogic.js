/**
 * Macro Interpretation Logic — conceptual macro Q&A without headline briefing.
 * @module logic/macroInterpretationLogic
 */

import { buildLogicResponse } from "./types.js";
import { callLogicLLM, withDataLimited } from "./shared.js";
import {
  runMacroInterpretationEngine,
  buildMacroInterpretationCards,
} from "./engines/macroInterpretationEngine.js";

const BANNED_PHRASES =
  /markets may read this through|tape:\s*spy|reuters|three months in/i;

/**
 * @param {object} ctx
 */
export async function runMacroInterpretationLogic(ctx) {
  const prompt = ctx.prompt || "";
  const model = runMacroInterpretationEngine(prompt);
  const failedSources = [];

  const frame = `MACRO INTERPRETATION (use exactly — conceptual, not headline-driven):
Topic: ${model.label}
Direct answer: ${model.directAnswer}
Expectations: ${model.expectations}
Growth/earnings: ${model.growthEarnings}
Rates/liquidity: ${model.ratesLiquidity}
Positioning/narrative: ${model.positioningNarrative}
Drivers: ${model.keyDrivers.join(" | ")}`;

  const ai = await callLogicLLM(
    `You are FORGENIQ Logic macro interpretation. Explain nuanced macro concepts for investors.
Rules:
- Answer the question directly in directAnswer (2-3 sentences). No Reuters. No SPY tape.
- Never start with "Markets may read this through..."
- Explain WHY the paradox or nuance exists (e.g. lower inflation can hurt growth if demand-driven).
- Cards: catalyst=expectations, macroContext=growth/earnings, sectorImpact=positioning, volatility=rates/liquidity.
- Dense institutional tone. No buy/sell/hold.`,
    `USER QUESTION: ${prompt}\n\n${frame}`,
    720
  );

  if (ai && !BANNED_PHRASES.test(ai.directAnswer || ai.summary || "")) {
    return {
      ...scrubMacroAi(ai, model),
      mode: "macro-interpretation",
      modeLabel: "Macro Interpretation Logic",
      questionKind: "macro_interpretation",
      usedAI: true,
      mockData: false,
      macroInterpretationId: model.id,
    };
  }

  const built = buildMacroInterpretationCards(model);
  return withDataLimited(
    {
      ...buildLogicResponse(built),
      mode: "macro-interpretation",
      modeLabel: "Macro Interpretation Logic",
      questionKind: "macro_interpretation",
      macroInterpretationId: model.id,
      mockData: true,
    },
    failedSources
  );
}

/**
 * @param {import('./types.js').LogicResponse} ai
 * @param {import('./engines/macroInterpretationEngine.js').MacroInterpretation} model
 */
function scrubMacroAi(ai, model) {
  const strip = (s) =>
    String(s || "")
      .replace(BANNED_PHRASES, "")
      .replace(/\s+/g, " ")
      .trim();

  const cards = { ...(ai.cards || {}) };
  return {
    ...ai,
    title: ai.title || `Macro Interpretation · ${model.label}`,
    directAnswer: strip(ai.directAnswer) || model.directAnswer,
    summary: strip(ai.summary) || model.directAnswer,
    cards: {
      snapshot: strip(cards.snapshot) || model.directAnswer,
      catalyst: strip(cards.catalyst) || model.expectations,
      macroContext: strip(cards.macroContext) || model.growthEarnings,
      sectorImpact: strip(cards.sectorImpact) || model.positioningNarrative,
      volatility: strip(cards.volatility) || model.ratesLiquidity,
      aiSummary: strip(cards.aiSummary) || model.directAnswer,
    },
    keyDrivers: ai.keyDrivers?.length ? ai.keyDrivers : model.keyDrivers,
    sources: ["FORGENIQ Logic · Macro Interpretation"],
  };
}
