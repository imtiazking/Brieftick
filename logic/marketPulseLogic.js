import { buildLogicResponse } from "./types.js";
import {
  callLogicLLM,
  getHeadlines,
  getQuote,
  withDataLimited,
  MOCK_HEADLINES,
} from "./shared.js";

/** @param {{ prompt: string }} ctx */
export async function runMarketPulseLogic(ctx) {
  const prompt = ctx.prompt || "Explain today's market pulse";
  const failedSources = [];
  const newsPack = await getHeadlines(8);
  failedSources.push(...(newsPack.failedSources || []));
  const items = newsPack.headlines.length ? newsPack.headlines : MOCK_HEADLINES;

  const [spyR, qqqR] = await Promise.all([getQuote("SPY"), getQuote("QQQ")]);
  failedSources.push(...spyR.failedSources, ...qqqR.failedSources);
  const spy = spyR.quote;
  const qqq = qqqR.quote;

  const marketCtx = `HEADLINES:\n${items.map((n) => `- ${n.headline}`).join("\n")}
QUOTES:\nSPY: ${spy ? `${spy.pctChange >= 0 ? "+" : ""}${spy.pctChange?.toFixed(2)}%` : "unavailable"}
QQQ: ${qqq ? `${qqq.pctChange >= 0 ? "+" : ""}${qqq.pctChange?.toFixed(2)}%` : "unavailable"}`;

  const ai = await callLogicLLM(
    "You are Brieftick Logic — calm institutional market pulse. No trade advice.",
    `${prompt}\n\n${marketCtx}`,
    650
  );

  if (ai) return { ...ai, mode: "market-pulse", mockData: !newsPack.live };

  const tone =
    spy && qqq
      ? (spy.pctChange + qqq.pctChange) / 2 > 0.3
        ? "Risk-on tilt"
        : (spy.pctChange + qqq.pctChange) / 2 < -0.3
          ? "Risk-off tilt"
          : "Mixed session"
      : "Mixed session";

  return withDataLimited(
    {
      title: "Market Pulse",
      summary: `Session tone reads ${tone.toLowerCase()}. Index leadership remains selective while macro headlines anchor rate expectations and volatility.`,
      cards: {
        snapshot: `${tone} — indices ${spy ? "tracked live" : "contextual"}`,
        catalyst: items[0]?.headline || "Macro headline flow",
        macroContext: "Policy and inflation path dominate cross-asset pricing",
        sectorImpact: "Mega-cap tech vs cyclicals defines breadth",
        volatility: tone.includes("Risk-off") ? "Defensive bid in vol" : "Volatility monitored",
        aiSummary: `Tape tone is ${tone.toLowerCase()} with investors balancing growth exposure against duration risk.`,
      },
      keyDrivers: [
        items[0]?.headline || "Macro headline flow",
        spy ? `SPY ${spy.pctChange >= 0 ? "+" : ""}${spy.pctChange.toFixed(2)}%` : "Index data limited",
        "Breadth vs mega-cap leadership",
      ],
      signals: [tone, spy?.pctChange >= 0 ? "Equities firm" : "Equities soft", "Macro in focus"],
      confidence: newsPack.live && spy ? 70 : 52,
      sources: newsPack.live ? ["Finnhub", "Brieftick Logic"] : ["Brieftick Logic"],
      mode: "market-pulse",
      mockData: !newsPack.live,
    },
    failedSources
  );
}
