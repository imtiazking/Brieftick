import { buildAgentResponse } from "./types.js";
import { callAgentLLM, getPortfolioHoldings, getQuote } from "./shared.js";

export async function runPortfolioIntelligenceAgent(prompt) {
  const holdings = getPortfolioHoldings();
  const lines =
    holdings.length > 0
      ? holdings
      : [
          { symbol: "NVDA", weight: 18 },
          { symbol: "AAPL", weight: 12 },
          { symbol: "MSFT", weight: 10 },
        ];

  const quotes = {};
  for (const h of lines.slice(0, 8)) {
    quotes[h.symbol] = await getQuote(h.symbol);
  }

  const top3 = [...lines].sort((a, b) => b.weight - a.weight).slice(0, 3);
  const top3Weight = top3.reduce((s, h) => s + (h.weight || 0), 0);

  const ctx = lines
    .map((h) => {
      const q = quotes[h.symbol];
      const ch = q ? `${q.pctChange >= 0 ? "+" : ""}${q.pctChange.toFixed(2)}%` : "—";
      return `${h.symbol} ${h.weight || "?"}% (day ${ch})`;
    })
    .join("\n");

  const ai = await callAgentLLM(
    "You analyze portfolio composition for educational context. Never recommend trades.",
    `${prompt || "Analyze my portfolio"}\nHoldings:\n${ctx}\nTop3 weight sum: ${top3Weight}%`,
    700
  );

  if (ai) return { ...ai, mode: "portfolio", mockData: !holdings.length };

  return buildAgentResponse({
    title: "Portfolio intelligence snapshot",
    summary: `Your book shows ${lines.length} positions with the largest weights in ${top3.map((h) => h.symbol).join(", ")}. Concentration in the top three names accounts for roughly ${top3Weight.toFixed(0)}% of the profile, which increases sensitivity to single-sector shocks and headline risk.`,
    keyDrivers: [
      `Top weights: ${top3.map((h) => h.symbol + " " + h.weight + "%").join(", ")}`,
      "Technology / growth exposure likely elevated",
      "Macro rate and volatility channel",
    ],
    signals: [
      top3Weight > 35 ? "Concentration elevated" : "Diversification moderate",
      "Volatility sensitivity: monitor",
    ],
    confidence: holdings.length ? 66 : 54,
    sources: holdings.length
      ? ["Local portfolio · Finnhub"]
      : ["Sample portfolio · preview"],
    mode: "portfolio",
    mockData: !holdings.length,
  });
}
