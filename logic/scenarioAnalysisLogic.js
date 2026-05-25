import { buildLogicResponse } from "./types.js";
import { callLogicLLM, getPortfolioHoldings, withDataLimited } from "./shared.js";

function detectScenario(prompt) {
  const t = (prompt || "").toLowerCase();
  if (/oil|crude|energy|opec/.test(t)) return "oil spike";
  if (/rate|fed|yield|hike|cut/.test(t)) return "rates rise";
  if (/tech|nasdaq|ai|semiconductor/.test(t)) return "tech sell-off";
  if (/recession|slowdown/.test(t)) return "growth scare";
  return "macro shock";
}

/** @param {{ prompt: string }} ctx */
export async function runScenarioAnalysisLogic(ctx) {
  const prompt = ctx.prompt;
  const scenario = detectScenario(prompt);
  const holdings = getPortfolioHoldings();
  const portCtx = holdings.length
    ? holdings.map((h) => h.symbol).join(", ")
    : "sample growth-tilted book";
  const failedSources = [];

  const ai = await callLogicLLM(
    "Brieftick Scenario Logic — hypothetical macro impact. Educational only.",
    `Scenario: ${scenario}\nUser: ${prompt}\nPortfolio: ${portCtx}`,
    750
  );

  if (ai) return { ...ai, mode: "scenario" };

  const templates = {
    "rates rise": {
      title: "Scenario Logic: rates move higher",
      summary:
        "Higher rates pressure long-duration growth, firm the dollar, and tighten financial conditions. Rotation toward cash-generative names tends to accelerate.",
      drivers: ["Duration risk", "Dollar firming", "Financial conditions"],
      signals: ["Growth sensitivity ↑", "Defensives resilient"],
    },
    "oil spike": {
      title: "Scenario Logic: oil prices spike",
      summary:
        "Energy shock lifts inflation expectations and supports energy equities while pressuring transport and rate-sensitive consumption.",
      drivers: ["Inflation expectations", "Energy bid", "Consumption headwind"],
      signals: ["Stagflation risk discussed", "Energy outperforms"],
    },
    "tech sell-off": {
      title: "Scenario Logic: technology sells off",
      summary:
        "Tech drawdowns drag indices via mega-cap weights and widen semiconductor correlation; volatility expands across growth factors.",
      drivers: ["Mega-cap drag", "Semi sympathy", "Vol expansion"],
      signals: ["Breadth deteriorates", "Risk appetite cools"],
    },
  };

  const tpl = templates[scenario] || templates["rates rise"];

  return withDataLimited(
    {
      title: tpl.title,
      summary: `${tpl.summary} Book tilted toward ${portCtx} would feel factor and concentration effects more than a uniform move.`,
      cards: {
        snapshot: `Scenario: ${scenario}`,
        catalyst: tpl.drivers[0],
        macroContext: tpl.drivers[1] || "Cross-asset repricing",
        sectorImpact: tpl.drivers[2] || "Sector dispersion widens",
        volatility: tpl.signals[1] || "Volatility implications elevated",
        aiSummary: tpl.summary,
      },
      keyDrivers: tpl.drivers,
      signals: tpl.signals,
      confidence: 58,
      sources: ["Brieftick Scenario Logic · Preview"],
      mode: "scenario",
      mockData: true,
    },
    failedSources
  );
}
