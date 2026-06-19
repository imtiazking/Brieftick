import { buildLogicResponse } from "./types.js";
import { callLogicLLM, getHeadlines, withDataLimited, buildFusionPromptExtras } from "./shared.js";
import { fusionAttributionSources } from "./dataFusion.js";
import { buildFallbackResponse } from "./fallbackIntelligence.js";

/** @param {{ prompt: string, fusion?: import('./dataFusion.js').FusionBundle }} ctx */
export async function runRiskRegimeLogic(ctx) {
  const prompt = ctx.prompt || "Show risk regime";
  let vixLabel = "Elevated";
  let regime = "Mixed";
  try {
    if (typeof liveRefreshVix === "function") await liveRefreshVix();
    const vixEl = document.getElementById("vixValue");
    const regimeEl = document.getElementById("riskRegimeLabel");
    if (regimeEl?.textContent) regime = regimeEl.textContent.trim();
    if (vixEl?.textContent) vixLabel = vixEl.textContent;
  } catch (_) {}

  const headlines =
    ctx.fusion?.news?.headlines?.length
      ? ctx.fusion.news.headlines
      : (await getHeadlines(4)).headlines;
  const failedSources = [...(ctx.fusion?.failedSources || [])];

  const normalized = (regime || "").toLowerCase();
  let signal = "Mixed";
  if (normalized.includes("risk-on")) signal = "Risk-on";
  else if (normalized.includes("risk-off")) signal = "Risk-off";
  else if (normalized.includes("volatile")) signal = "Volatile";

  const ai = await callLogicLLM(
    "FORGENIQ Risk Regime Logic — institutional risk conditions. No advice.",
    `${prompt}\nRegime: ${regime}\nVIX: ${vixLabel}\nHeadlines: ${headlines.map((h) => h.headline).join("; ")}\n${buildFusionPromptExtras(ctx, "SPY")}`,
    600
  );

  if (ai) {
    return {
      ...ai,
      mode: "risk-regime",
      sources: ctx.fusion ? fusionAttributionSources(ctx.fusion) : ai.sources,
      optionalCards: { riskSignal: `${signal} · ${vixLabel}` },
    };
  }

  return withDataLimited(
    {
      title: "Risk Regime Logic",
      summary: `Environment maps to ${signal.toLowerCase()} with volatility around ${vixLabel}. Liquidity in large caps has held, but macro headlines remain the primary correlation shifter.`,
      cards: {
        snapshot: `${signal} regime · VIX ${vixLabel}`,
        catalyst: headlines[0]?.headline || "Macro headline risk",
        macroContext: "Rates and policy expectations anchor risk pricing",
        sectorImpact: "Defensives vs cyclicals rotation reflects regime",
        volatility: `Volatility: ${vixLabel}`,
        aiSummary: `Risk conditions are ${signal.toLowerCase()} — monitor macro catalysts and vol expansion.`,
      },
      keyDrivers: [`Regime: ${regime}`, "Volatility and rates", headlines[0]?.headline || "Headline flow"],
      signals: [signal, `Volatility: ${vixLabel}`, "Monitor macro"],
      confidence: ctx.fusion?.live ? 72 : 58,
      sources: ctx.fusion
        ? fusionAttributionSources(ctx.fusion)
        : ["Macro Feed", "FORGENIQ Logic"],
      mode: "risk-regime",
      mockData: !ctx.fusion?.live,
      optionalCards: { riskSignal: `${signal} regime · vol ${vixLabel}` },
    },
    failedSources
  );
}
