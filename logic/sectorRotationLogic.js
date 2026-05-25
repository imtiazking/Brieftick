import { buildLogicResponse } from "./types.js";
import {
  callLogicLLM,
  getHeadlines,
  withDataLimited,
  MOCK_HEADLINES,
  buildFusionPromptExtras,
} from "./shared.js";
import { fusionAttributionSources } from "./dataFusion.js";

const SECTOR_ETFS = [
  ["XLK", "Technology"],
  ["XLF", "Financials"],
  ["XLE", "Energy"],
  ["XLV", "Health Care"],
  ["XLP", "Consumer Staples"],
];

/** @param {{ prompt: string, primaryEntity: import('./entityResolver.js').ResolvedEntity }} ctx */
export async function runSectorRotationLogic(ctx) {
  const prompt = ctx.prompt || "Explain sector rotation";
  const failedSources = [];
  const rows = [];

  for (const [sym, label] of SECTOR_ETFS) {
    let pct = null;
    try {
      if (typeof getFinnhubQuotes === "function") {
        const q = await getFinnhubQuotes([sym]);
        pct = q?.[sym]?.pctChange;
      } else if (window.BriefTickAPI?.getQuote) {
        const q = await window.BriefTickAPI.getQuote(sym);
        pct = q?.pctChange;
      }
    } catch (e) {
      failedSources.push(`sector_etf:${sym}`);
    }
    rows.push({ sym, label, pct: pct ?? null });
  }

  rows.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  const leaders = rows.slice(0, 2);
  const laggards = rows.slice(-2);
  const newsPack = await getHeadlines(4);
  failedSources.push(...(newsPack.failedSources || []));
  const items = newsPack.headlines.length ? newsPack.headlines : MOCK_HEADLINES;

  const sectorCtx = rows
    .map((r) => `${r.label} (${r.sym}): ${r.pct >= 0 ? "+" : ""}${r.pct?.toFixed(2)}%`)
    .join("\n");

  const ai = await callLogicLLM(
    "Brieftick Sector Rotation Logic — leadership and laggards. No trade advice.",
    `${prompt}\n${sectorCtx}\nNews: ${items[0]?.headline}`,
    650
  );

  if (ai) return { ...ai, mode: "sector-rotation", mockData: !newsPack.live };

  return withDataLimited(
    {
      title: "Sector Rotation Logic",
      summary: `Leadership from ${leaders.map((r) => r.label).join(" and ")}; ${laggards.map((r) => r.label).join(" and ")} lag. Rotation links to rates and earnings breadth, not uniform risk-on.`,
      cards: {
        snapshot: `Leaders: ${leaders.map((r) => r.sym).join(", ")}`,
        catalyst: items[0]?.headline || "Macro tone",
        macroContext: "Rate path shapes cyclical vs growth rotation",
        sectorImpact: `${leaders[0]?.label} outperforming ${laggards[0]?.label}`,
        volatility: "Uneven breadth elevates rotation vol",
        aiSummary: `Money is favoring ${leaders.map((r) => r.label).join(" & ")} over ${laggards.map((r) => r.label).join(" & ")}.`,
      },
      keyDrivers: [
        `Leaders: ${leaders.map((r) => r.label).join(", ")}`,
        `Laggards: ${laggards.map((r) => r.label).join(", ")}`,
        items[0]?.headline || "Macro headline tone",
      ],
      signals: ["Rotation active", "Breadth uneven"],
      confidence: newsPack.live ? 68 : 55,
      sources: newsPack.live ? ["Finnhub sector ETFs", "Brieftick Logic"] : ["Logic Preview"],
      mode: "sector-rotation",
      mockData: !newsPack.live,
    },
    failedSources
  );
}
