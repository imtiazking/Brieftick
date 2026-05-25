import { buildLogicResponse } from "./types.js";
import { callLogicLLM, getHeadlines, withDataLimited } from "./shared.js";

/** @param {{ prompt: string }} ctx */
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

  const newsPack = await getHeadlines(4);
  const failedSources = [...(newsPack.failedSources || [])];

  const ai = await callLogicLLM(
    "Brieftick Risk Regime Logic — institutional risk conditions. No advice.",
    `${prompt}\nRegime: ${regime}\nVIX: ${vixLabel}\nHeadlines: ${(newsPack.headlines || []).map((h) => h.headline).join("; ")}`,
    600
  );

  if (ai) return { ...ai, mode: "risk-regime" };

  const normalized = (regime || "").toLowerCase();
  let signal = "Mixed";
  if (normalized.includes("risk-on")) signal = "Risk-on";
  else if (normalized.includes("risk-off")) signal = "Risk-off";
  else if (normalized.includes("volatile")) signal = "Volatile";

  return withDataLimited(
    {
      title: "Risk Regime Logic",
      summary: `Environment maps to ${signal.toLowerCase()} with volatility around ${vixLabel}. Liquidity in large caps has held, but macro headlines remain the primary correlation shifter.`,
      cards: {
        snapshot: `${signal} regime · VIX ${vixLabel}`,
        catalyst: newsPack.headlines[0]?.headline || "Macro headline risk",
        macroContext: "Rates and policy expectations anchor risk pricing",
        sectorImpact: "Defensives vs cyclicals rotation reflects regime",
        volatility: `Volatility: ${vixLabel}`,
        aiSummary: `Risk conditions are ${signal.toLowerCase()} — monitor macro catalysts and vol expansion.`,
      },
      keyDrivers: [`Regime: ${regime}`, "Volatility and rates", newsPack.headlines[0]?.headline || "Headline flow"],
      signals: [signal, `Volatility: ${vixLabel}`, "Monitor macro"],
      confidence: newsPack.live ? 72 : 58,
      sources: ["Brieftick Risk Regime", newsPack.live ? "Finnhub" : "Logic Preview"],
      mode: "risk-regime",
      mockData: !newsPack.live,
    },
    failedSources
  );
}
