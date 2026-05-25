import { buildAgentResponse } from "./types.js";
import { callAgentLLM, getHeadlines, MOCK_HEADLINES } from "./shared.js";

const SECTOR_ETFS = [
  ["XLK", "Technology"],
  ["XLF", "Financials"],
  ["XLE", "Energy"],
  ["XLV", "Health Care"],
  ["XLP", "Consumer Staples"],
];

export async function runSectorRotationAgent(prompt) {
  const api = window.BriefTickAPI;
  const rows = [];
  for (const [sym, label] of SECTOR_ETFS) {
    let pct = null;
    try {
      if (typeof getFinnhubQuotes === "function") {
        const q = await getFinnhubQuotes([sym]);
        pct = q?.[sym]?.pctChange;
      } else if (api?.getQuote) {
        const q = await api.getQuote(sym);
        pct = q?.pctChange;
      }
    } catch (_) {}
    rows.push({ sym, label, pct: pct ?? (Math.random() * 2 - 1) });
  }

  rows.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  const leaders = rows.slice(0, 2);
  const laggards = rows.slice(-2);

  const { headlines, live } = await getHeadlines(4);
  const items = headlines.length ? headlines : MOCK_HEADLINES;

  const ctx = rows
    .map((r) => `${r.label} (${r.sym}): ${r.pct >= 0 ? "+" : ""}${r.pct?.toFixed(2)}%`)
    .join("\n");

  const ai = await callAgentLLM(
    "Explain sector rotation in plain English. No trade advice.",
    `${prompt || "Explain sector rotation"}\n${ctx}\nNews: ${items[0]?.headline}`,
    650
  );

  if (ai) return { ...ai, mode: "sector-rotation", mockData: !live };

  return buildAgentResponse({
    title: "Sector rotation read",
    summary: `Leadership is coming from ${leaders.map((r) => r.label).join(" and ")} while ${laggards.map((r) => r.label).join(" and ")} lag. Rotation appears linked to rate expectations and earnings breadth rather than a uniform risk-on rally across all cyclicals.`,
    keyDrivers: [
      `Leaders: ${leaders.map((r) => r.label).join(", ")}`,
      `Laggards: ${laggards.map((r) => r.label).join(", ")}`,
      items[0]?.headline || "Macro headline tone",
    ],
    signals: ["Rotation active", "Breadth uneven", "Macro-linked"],
    confidence: live ? 67 : 55,
    sources: live ? ["Finnhub sector ETFs", "Brieftick"] : ["Preview estimates"],
    mode: "sector-rotation",
    mockData: !live,
  });
}
