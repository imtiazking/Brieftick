import { buildLogicResponse } from "./types.js";
import { callLogicLLM, getWatchlist, withDataLimited } from "./shared.js";

/** @param {{ prompt: string }} ctx */
export async function runDailyBriefLogic(ctx) {
  const prompt = ctx.prompt || "Give me today's market brief";
  const failedSources = [];
  const api = window.BriefTickAPI;

  if (api?.aiMorningBrief) {
    try {
      const text = await api.aiMorningBrief();
      if (text) {
        return buildLogicResponse({
          title: "Daily Brief Logic",
          summary: text.slice(0, 520),
          cards: {
            snapshot: text.slice(0, 180),
            catalyst: "Overnight and pre-market headline set",
            macroContext: "Calendar and policy channel",
            sectorImpact: "Leadership narrow vs broad",
            volatility: "Session vol monitored",
            aiSummary: text.slice(0, 600),
          },
          keyDrivers: ["Index tone", "Macro calendar", "Headline risk"],
          signals: ["Session recap", "Watch macro prints"],
          confidence: 76,
          sources: ["Finnhub", "FORGENIQ Logic"],
          mode: "daily-brief",
          usedAI: true,
        });
      }
    } catch (e) {
      failedSources.push(`aiMorningBrief:${e.message || "error"}`);
    }
  }

  const watch = getWatchlist();
  const ai = await callLogicLLM(
    "FORGENIQ Daily Brief Logic — concise institutional recap. No recommendations.",
    `${prompt}\nWatchlist: ${watch.join(", ") || "none"}`,
    800
  );

  if (ai) return { ...ai, mode: "daily-brief" };

  return withDataLimited(
    {
      title: "Daily Brief Logic",
      summary:
        "Overnight tone carried into the open with indices holding ranges while investors focus on macro data and mega-cap narratives. Leadership remains selective rather than broad risk extension.",
      cards: {
        snapshot: "Selective leadership · macro headline focus",
        catalyst: "Earnings and policy headlines",
        macroContext: "Rate expectations and data calendar",
        sectorImpact: "Mega-cap vs cyclicals divergence",
        volatility: "Volatility monitored into catalysts",
        aiSummary:
          "Session recap: macro and mega-cap narratives dominate; breadth uneven.",
      },
      keyDrivers: [
        "Macro calendar",
        "Mega-cap earnings narrative",
        watch.length ? `Watchlist: ${watch.slice(0, 4).join(", ")}` : "No saved watchlist",
      ],
      signals: ["Selective leadership", "Headline-sensitive tape"],
      confidence: 60,
      sources: ["FORGENIQ Logic Preview"],
      mode: "daily-brief",
      mockData: true,
    },
    failedSources
  );
}
