import { buildAgentResponse } from "./types.js";
import { callAgentLLM, getHeadlines } from "./shared.js";

export async function runRiskRegimeAgent(prompt) {
  let vixLabel = "Elevated";
  let regime = "Mixed";
  try {
    if (typeof liveRefreshVix === "function") await liveRefreshVix();
    const vixEl = document.getElementById("vixValue");
    const regimeEl = document.getElementById("riskRegimeLabel");
    if (regimeEl?.textContent) regime = regimeEl.textContent.trim();
    if (vixEl?.textContent) vixLabel = vixEl.textContent;
  } catch (_) {}

  const { headlines, live } = await getHeadlines(4);
  const ai = await callAgentLLM(
    "Explain market risk regime in institutional plain English. No advice.",
    `${prompt || "Show risk regime"}\nDashboard regime: ${regime}\nVIX display: ${vixLabel}\nHeadlines: ${(headlines || []).map((h) => h.headline).join("; ")}`,
    600
  );

  if (ai) return { ...ai, mode: "risk-regime" };

  const normalized = (regime || "").toLowerCase();
  let signal = "Mixed";
  if (normalized.includes("risk-on")) signal = "Risk-on";
  else if (normalized.includes("risk-off")) signal = "Risk-off";
  else if (normalized.includes("volatile")) signal = "Volatile";

  return buildAgentResponse({
    title: "Risk regime assessment",
    summary: `Conditions currently map to a ${signal.toLowerCase()} environment with volatility context around ${vixLabel}. Liquidity has been adequate in large caps, but macro headline risk remains the primary channel that can shift correlations quickly.`,
    keyDrivers: [
      `Regime label: ${regime}`,
      "Volatility and rates channel",
      headlines[0]?.headline || "Macro headline flow",
    ],
    signals: [signal, `Volatility: ${vixLabel}`, "Monitor macro catalysts"],
    confidence: live ? 72 : 58,
    sources: ["FORGENIQ Risk Regime", live ? "Finnhub" : "preview"],
    mode: "risk-regime",
    mockData: !live,
  });
}
