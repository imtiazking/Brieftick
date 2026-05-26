import { buildLogicResponse } from "./types.js";
import {
  callLogicLLM,
  getHeadlines,
  withDataLimited,
  MOCK_HEADLINES,
  buildFusionPromptExtras,
} from "./shared.js";
import { getFusedQuote, fusionAttributionSources } from "./dataFusion.js";
import { buildFallbackResponse } from "./fallbackIntelligence.js";
import { isNewsStyleQuery } from "./questionIntent.js";
import { runBriefingLogic } from "./briefingLogic.js";

/** @param {{ prompt: string, fusion?: import('./dataFusion.js').FusionBundle, memory?: object }} ctx */
export async function runMarketPulseLogic(ctx) {
  const prompt = ctx.prompt || "Explain today's market pulse";
  if (isNewsStyleQuery(prompt)) {
    return runBriefingLogic(ctx);
  }
  const fusion = ctx.fusion;
  const failedSources = [...(fusion?.failedSources || [])];

  const items =
    fusion?.news?.headlines?.length
      ? fusion.news.headlines
      : (await getHeadlines(8)).headlines;
  if (!fusion?.news?.headlines?.length) {
    const pack = await getHeadlines(8);
    failedSources.push(...(pack.failedSources || []));
  }
  const headlines = items.length ? items : MOCK_HEADLINES;

  const spy = fusion ? getFusedQuote(fusion, "SPY") : null;
  const qqq = fusion ? getFusedQuote(fusion, "QQQ") : null;
  const spyPct = spy?.pctChange;
  const qqqPct = qqq?.pctChange;

  const marketCtx = `HEADLINES:\n${headlines.map((n) => `- ${n.headline}`).join("\n")}
QUOTES:\nSPY: ${spyPct != null ? `${spyPct >= 0 ? "+" : ""}${spyPct.toFixed(2)}%` : "unavailable"}
QQQ: ${qqqPct != null ? `${qqqPct >= 0 ? "+" : ""}${qqqPct.toFixed(2)}%` : "unavailable"}
${buildFusionPromptExtras(ctx, "SPY")}`;

  const ai = await callLogicLLM(
    "You are Brieftick Logic — calm institutional market pulse. No trade advice.",
    `${prompt}\n\n${marketCtx}`,
    650
  );

  if (ai) {
    return {
      ...ai,
      mode: "market-pulse",
      mockData: !fusion?.live,
      sources: fusion ? fusionAttributionSources(fusion) : ai.sources,
    };
  }

  if (spyPct == null && qqqPct == null && !headlines.length) {
    return buildFallbackResponse(ctx);
  }

  const tone =
    spyPct != null && qqqPct != null
      ? (spyPct + qqqPct) / 2 > 0.3
        ? "Risk-on tilt"
        : (spyPct + qqqPct) / 2 < -0.3
          ? "Risk-off tilt"
          : "Mixed session"
      : "Mixed session";

  return withDataLimited(
    {
      title: "Market Pulse",
      summary: `Session tone reads ${tone.toLowerCase()}. Index leadership remains selective while macro headlines anchor rate expectations and volatility.`,
      cards: {
        snapshot: `${tone} — indices ${spyPct != null ? "tracked" : "contextual"}`,
        catalyst: headlines[0]?.headline || "Macro headline flow",
        macroContext: "Policy and inflation path dominate cross-asset pricing",
        sectorImpact: "Mega-cap tech vs cyclicals defines breadth",
        volatility: tone.includes("Risk-off") ? "Defensive bid in vol" : "Volatility monitored",
        aiSummary: `Tape tone is ${tone.toLowerCase()} with investors balancing growth exposure against duration risk.`,
      },
      keyDrivers: [
        headlines[0]?.headline || "Macro headline flow",
        spyPct != null ? `SPY ${spyPct >= 0 ? "+" : ""}${spyPct.toFixed(2)}%` : "Index data limited",
        "Breadth vs mega-cap leadership",
      ],
      signals: [tone, spyPct != null && spyPct >= 0 ? "Equities firm" : "Equities soft", "Macro in focus"],
      confidence: fusion?.live && spyPct != null ? 72 : 52,
      sources: fusion
        ? fusionAttributionSources(fusion)
        : ["Brieftick Logic"],
      mode: "market-pulse",
      mockData: !fusion?.live,
    },
    failedSources
  );
}
