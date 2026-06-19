import { buildAgentResponse } from "./types.js";
import { callAgentLLM, getWatchlist } from "./shared.js";

export async function runDailyBriefAgent(prompt) {
  const api = window.BriefTickAPI;

  if (api?.aiMorningBrief) {
    try {
      const text = await api.aiMorningBrief();
      if (text) {
        return buildAgentResponse({
          title: "Daily market brief",
          summary: text.slice(0, 600),
          keyDrivers: ["Index tone", "Macro calendar", "Headline risk"],
          signals: ["Session recap", "Watch macro prints"],
          confidence: 76,
          sources: ["Finnhub", "Anthropic · FORGENIQ"],
          mode: "daily-brief",
          usedAI: true,
        });
      }
    } catch (_) {}
  }

  const watch = getWatchlist();
  const ai = await callAgentLLM(
    "Write a concise daily market brief. Institutional tone. No recommendations.",
    `${prompt || "Give me today's market brief"}\nWatchlist: ${watch.join(", ") || "none saved"}`,
    800
  );

  if (ai) return { ...ai, mode: "daily-brief" };

  return buildAgentResponse({
    title: "Daily market brief",
    summary:
      "Overnight tone carried into the open with indices holding prior ranges while investors focus on macro data and mega-cap earnings narratives. The session reward has been selective leadership rather than broad risk extension.",
    keyDrivers: [
      "Macro calendar and rate expectations",
      "Mega-cap earnings narrative",
      watch.length ? `Watchlist focus: ${watch.slice(0, 4).join(", ")}` : "No saved watchlist",
    ],
    signals: ["Selective leadership", "Volatility monitored", "Headline-sensitive tape"],
    confidence: 60,
    sources: ["FORGENIQ preview"],
    mode: "daily-brief",
    mockData: true,
  });
}
