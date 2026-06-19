import { buildAgentResponse } from "./types.js";
import { callAgentLLM, getHeadlines, getQuote, MOCK_HEADLINES } from "./shared.js";

export async function runMarketPulseAgent(prompt) {
  const { headlines, live } = await getHeadlines(8);
  const items = headlines.length ? headlines : MOCK_HEADLINES;
  const [spy, qqq] = await Promise.all([getQuote("SPY"), getQuote("QQQ")]);

  const ctx = `HEADLINES:\n${items.map((n) => `- ${n.headline}`).join("\n")}
QUOTES:\nSPY: ${spy ? `${spy.pctChange >= 0 ? "+" : ""}${spy.pctChange?.toFixed(2)}%` : "unavailable"}
QQQ: ${qqq ? `${qqq.pctChange >= 0 ? "+" : ""}${qqq.pctChange?.toFixed(2)}%` : "unavailable"}`;

  const ai = await callAgentLLM(
    "You are a calm institutional market strategist for FORGENIQ. Explain overall market direction. No buy/sell/hold. Plain English.",
    `${prompt || "Explain today's market pulse"}\n\n${ctx}`,
    650
  );

  if (ai) return { ...ai, mode: "market-pulse", mockData: !live };

  const tone =
    spy && qqq
      ? (spy.pctChange + qqq.pctChange) / 2 > 0.3
        ? "Risk-on tilt"
        : (spy.pctChange + qqq.pctChange) / 2 < -0.3
          ? "Risk-off tilt"
          : "Mixed session"
      : "Mixed session";

  return buildAgentResponse({
    title: "Market Pulse",
    summary: `Session tone reads ${tone.toLowerCase()}. Index leadership is concentrated while macro headlines keep rate expectations in focus. Cross-asset behaviour suggests investors are balancing growth exposure against duration and volatility risk.`,
    keyDrivers: [
      items[0]?.headline || "Macro headline flow",
      spy ? `SPY ${spy.pctChange >= 0 ? "+" : ""}${spy.pctChange.toFixed(2)}%` : "Index data limited",
      "Breadth vs mega-cap leadership",
    ],
    signals: [tone, spy?.pctChange >= 0 ? "Equities firm" : "Equities soft", "Macro data in focus"],
    confidence: live ? 68 : 52,
    sources: live ? ["Finnhub", "FORGENIQ"] : ["FORGENIQ preview sample"],
    mode: "market-pulse",
    mockData: !live,
  });
}
