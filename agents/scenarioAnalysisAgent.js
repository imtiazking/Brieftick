import { buildAgentResponse } from "./types.js";
import { callAgentLLM, getPortfolioHoldings } from "./shared.js";

function detectScenario(prompt) {
  const t = (prompt || "").toLowerCase();
  if (/oil|crude|energy|opec/.test(t)) return "oil spike";
  if (/rate|fed|yield|hike|cut/.test(t)) return "rates rise";
  if (/tech|nasdaq|ai|semiconductor/.test(t)) return "tech sell-off";
  if (/recession|slowdown/.test(t)) return "growth scare";
  return "macro shock";
}

export async function runScenarioAnalysisAgent(prompt) {
  const scenario = detectScenario(prompt);
  const holdings = getPortfolioHoldings();
  const portCtx = holdings.length
    ? holdings.map((h) => h.symbol).join(", ")
    : "sample growth-tilted book";

  const ai = await callAgentLLM(
    "Explain a hypothetical macro scenario impact on markets and portfolios. Educational only. No trade advice.",
    `Scenario type: ${scenario}\nUser: ${prompt}\nPortfolio symbols: ${portCtx}`,
    750
  );

  if (ai) return { ...ai, mode: "scenario" };

  const templates = {
    "rates rise": {
      title: "Scenario: rates move higher",
      summary:
        "A sharper rates move typically pressures long-duration growth multiples, supports the dollar, and can tighten financial conditions. Equities may see rotation toward cash-generative defensives while high beta names reprice faster.",
      drivers: ["Duration risk", "Dollar firming", "Financial conditions"],
      signals: ["Growth sensitivity ↑", "Defensives relatively resilient"],
    },
    "oil spike": {
      title: "Scenario: oil prices spike",
      summary:
        "An energy shock tends to lift inflation expectations, complicate disinflation trades, and support energy equities while pressuring transport and rate-sensitive consumption names.",
      drivers: ["Inflation expectations", "Energy equities bid", "Consumption headwind"],
      signals: ["Stagflation risk discussed", "Energy outperforms"],
    },
    "tech sell-off": {
      title: "Scenario: technology sells off",
      summary:
        "A concentrated tech drawdown often drags index performance through mega-cap weights, widens correlation to semiconductors, and raises volatility across growth factors.",
      drivers: ["Mega-cap index drag", "Semiconductor sympathy", "Volatility expansion"],
      signals: ["Breadth deteriorates", "Risk appetite cools"],
    },
  };

  const tpl = templates[scenario] || templates["rates rise"];

  return buildAgentResponse({
    title: tpl.title,
    summary: `${tpl.summary} For a book tilted toward ${portCtx}, sensitivity would likely show up through factor exposure and concentration rather than a single uniform move.`,
    keyDrivers: tpl.drivers,
    signals: tpl.signals,
    confidence: 58,
    sources: ["FORGENIQ scenario engine · preview"],
    mode: "scenario",
    mockData: true,
  });
}
