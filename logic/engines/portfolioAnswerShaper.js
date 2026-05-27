/**
 * Portfolio answer shaper — question-specific copy from the same book profile.
 * @module logic/engines/portfolioAnswerShaper
 */

import { logicDebug } from "../shared.js";
import { concise } from "./topicContext.js";

/**
 * @typedef {'ranked_risks'|'regime_help_hurt'|'stress_transmission'|'book_overview'} PortfolioAnswerShape
 */

/**
 * @param {import('./responsePlan.js').ResponsePlan} [plan]
 * @param {string} prompt
 * @returns {PortfolioAnswerShape}
 */
export function resolvePortfolioAnswerShape(plan, prompt) {
  const id = plan?.intentId;
  if (id === "portfolio_risk") return "ranked_risks";
  if (id === "regime_fit") return "regime_help_hurt";
  if (id === "portfolio_stress") return "stress_transmission";
  const t = (prompt || "").toLowerCase();
  if (/risks dominate|dominant risk/i.test(t)) return "ranked_risks";
  if (/regime benefit|what regime|which regime/i.test(t)) return "regime_help_hurt";
  if (/liquidity tighten|what happens if|financial conditions tighten|if .* tighten/i.test(t)) {
    return "stress_transmission";
  }
  return "book_overview";
}

/**
 * @param {import('../portfolioProfile.js').PortfolioProfile} profile
 */
function buildRankedRisks(profile) {
  /** @type {{ score: number, label: string, line: string }[]} */
  const risks = [];

  if (profile.aiWeight >= 28) {
    risks.push({
      score: profile.aiWeight,
      label: "AI / growth concentration",
      line: `AI-linked sleeve ~${profile.aiWeight.toFixed(0)}% — crowded growth beta clusters with earnings revisions.`,
    });
  }
  if (profile.topThreeWeight >= 38) {
    risks.push({
      score: profile.topThreeWeight,
      label: "Leadership concentration",
      line: `Top-three weights (${profile.topSymbols?.join(", ") || "leaders"}) ~${profile.topThreeWeight.toFixed(0)}% — single-factor gap risk.`,
    });
  }
  if (profile.sensitivity?.rates === "elevated" || profile.sensitivity?.rates === "moderate") {
    risks.push({
      score: profile.sensitivity.rates === "elevated" ? 72 : 55,
      label: "Duration / real-yield sensitivity",
      line: "Real yields and financial conditions compress duration-heavy growth multiples first.",
    });
  }
  if (profile.sensitivity?.liquidity === "elevated" || profile.cashWeight < 8) {
    risks.push({
      score: 58,
      label: "Liquidity / positioning risk",
      line: "Crowded positioning can de-gross faster than fundamentals when liquidity impulse turns.",
    });
  }
  if (profile.sensitivity?.volatility !== "low") {
    risks.push({
      score: 50,
      label: "Volatility repricing",
      line: "Vol resets hit high-beta sleeves harder than headline indices suggest.",
    });
  }

  risks.sort((a, b) => b.score - a.score);
  const top = risks.slice(0, 4);
  const direct = concise(
    top.length
      ? `Dominant risks for this book: ${top.map((r, i) => `${i + 1}) ${r.label}`).join("; ")}. ${top[0].line}`
      : "Risk is balanced across factors — no single sleeve clearly dominates.",
    360
  );

  return { risks: top, direct };
}

/**
 * @param {import('../portfolioProfile.js').PortfolioProfile} profile
 */
function buildRegimeFit(profile) {
  const helps = [];
  const hurts = [];

  if (profile.growthDefensiveTilt?.toLowerCase().includes("growth")) {
    helps.push("Falling real yields and abundant liquidity (risk-on growth)");
    helps.push("Strong AI capex / earnings revision cycle");
    helps.push("Compressed volatility with narrow leadership intact");
    hurts.push("Liquidity withdrawal or QT-style tightening");
    hurts.push("Volatility reset + simultaneous multiple compression");
    hurts.push("Growth scare with cyclical catch-down");
  } else {
    helps.push("Stable growth with disinflation and easing financial conditions");
    hurts.push("Reflation shock or sticky inflation re-acceleration");
  }

  if (profile.sensitivity?.rates === "elevated") {
    hurts.push("Higher real yields — duration-sensitive weights reprice first");
  }
  if (profile.aiWeight >= 30) {
    helps.push("Risk-on AI leadership and semis momentum");
    hurts.push("Capex disappointment or crowded growth unwind");
  }

  const direct = concise(
    `Regimes that help this book: ${helps.slice(0, 3).join("; ")}. Regimes that hurt: ${hurts.slice(0, 3).join("; ")}.`,
    380
  );

  return {
    direct,
    helps: helps.slice(0, 4),
    hurts: hurts.slice(0, 4),
  };
}

/**
 * @param {import('../portfolioProfile.js').PortfolioProfile} profile
 * @param {string} prompt
 */
function buildStressTransmission(profile, prompt) {
  const leaders = profile.topSymbols?.slice(0, 3).join(", ") || "mega-cap leaders";
  const ai = profile.aiWeight >= 25;

  let shock = "liquidity tightens";
  if (/volatility|vix|vol spike/i.test(prompt)) shock = "volatility spikes";
  else if (/rates|yields|real yield/i.test(prompt)) shock = "real yields rise";
  else if (/recession|hard landing/i.test(prompt)) shock = "growth scares";

  const direct = concise(
    ai
      ? `If ${shock}, the first break is usually multiple compression on crowded growth — ${leaders} gap before the index fully reflects it. Semis and AI beta de-gross together when liquidity impulse turns.`
      : `If ${shock}, concentrated weights (${leaders}) transmit the shock through correlation and vol expansion before diversification offsets the move.`,
    380
  );

  return {
    direct,
    catalyst: concise(`Shock: ${shock} → financial conditions tighten.`, 180),
    volatility: concise("Volatility repricing accelerates — gap risk rises on crowded books.", 180),
    sectorImpact: concise(
      `First hit: ${ai ? "AI / semis leadership and duration-heavy growth" : `top weights (${leaders})`}.`,
      200
    ),
    macroContext: concise(
      "Transmission: liquidity → multiples → positioning unwind → index lags factor move.",
      200
    ),
  };
}

/**
 * @param {object} ctx
 * @param {import('../portfolioProfile.js').PortfolioProfile} profile
 * @param {import('./portfolioIntelligenceEngine.js').PortfolioIntelligenceInsight} pint
 * @param {{ symbol: string, weight?: number }[]} top3
 * @param {number} top3Weight
 */
export function shapePortfolioAnswer(ctx, profile, pint, top3, top3Weight) {
  const plan = ctx.responsePlan;
  const prompt = ctx.prompt || "";
  const shape = resolvePortfolioAnswerShape(plan, prompt);

  const inferred = ctx.isInferredPortfolio || ctx.portfolioContext?.isInferred;
  const contextLabel =
    ctx.portfolioContextLabel ||
    ctx.portfolioContext?.contextLabel ||
    (inferred ? "Watchlist-derived exposure" : "");

  let title =
    inferred && contextLabel
      ? `Portfolio Logic · ${contextLabel}`
      : plan?.label || "Portfolio Logic";
  let directAnswer = "";
  let summary = "";
  /** @type {Record<string, string>} */
  const cards = {};
  /** @type {string[]} */
  const signals = [];
  /** @type {string[]} */
  const keyDrivers = [];

  if (shape === "ranked_risks") {
    title = inferred ? `Portfolio Risk · ${contextLabel || "Inferred profile"}` : "Portfolio Risk";
    const ranked = buildRankedRisks(profile);
    directAnswer = ranked.direct;
    summary = concise(
      ranked.risks.map((r) => r.line).join(" "),
      320
    );
    cards.snapshot = directAnswer;
    cards.catalyst = ranked.risks[1]?.line || "";
    cards.macroContext = ranked.risks.find((r) => /duration|yield/i.test(r.label))?.line || "";
    cards.sectorImpact = ranked.risks.find((r) => /AI|concentration/i.test(r.label))?.line || "";
    cards.volatility = ranked.risks.find((r) => /vol/i.test(r.label))?.line || "";
    cards.aiSummary = summary;
    signals.push(`PRIMARY RISK: ${ranked.risks[0]?.label || "Concentration"}`);
    if (ranked.risks[1]) signals.push(`SECONDARY RISK: ${ranked.risks[1].label}`);
    keyDrivers.push(...ranked.risks.slice(0, 3).map((r) => r.label));
  } else if (shape === "regime_help_hurt") {
    title = "Portfolio Regime Fit";
    const regime = buildRegimeFit(profile);
    directAnswer = regime.direct;
    summary = concise(`${regime.helps.join(" · ")} | Hurt: ${regime.hurts.join(" · ")}`, 320);
    cards.snapshot = directAnswer;
    cards.macroContext = concise(`Helps: ${regime.helps.join("; ")}.`, 220);
    cards.volatility = concise(`Hurts: ${regime.hurts.join("; ")}.`, 220);
    cards.sectorImpact = concise(
      `Book tilt: ${profile.growthDefensiveTilt} · AI ~${profile.aiWeight?.toFixed(0) || "—"}%.`,
      200
    );
    cards.catalyst = concise(
      `Current read: ${profile.concentrationLabel || "concentrated"} growth book — regime sensitivity is factor-driven.`,
      200
    );
    cards.aiSummary = summary;
    signals.push(`REGIME — HELPS: ${regime.helps[0] || "Risk-on liquidity"}`);
    signals.push(`REGIME — HURTS: ${regime.hurts[0] || "Tightening liquidity"}`);
    keyDrivers.push(...regime.helps.slice(0, 2), ...regime.hurts.slice(0, 1));
  } else if (shape === "stress_transmission") {
    title = "Portfolio Stress Path";
    const stress = buildStressTransmission(profile, prompt);
    directAnswer = stress.direct;
    summary = concise(
      `${stress.catalyst} ${stress.sectorImpact}`,
      300
    );
    cards.snapshot = directAnswer;
    cards.catalyst = stress.catalyst;
    cards.macroContext = stress.macroContext;
    cards.sectorImpact = stress.sectorImpact;
    cards.volatility = stress.volatility;
    cards.aiSummary = summary;
    signals.push(`TRANSMISSION: ${stress.catalyst}`);
    signals.push(`FIRST HIT: ${stress.sectorImpact.replace(/^First hit:\s*/i, "")}`);
    keyDrivers.push("Liquidity impulse", "Multiples", "Positioning unwind");
  } else {
    directAnswer = pint.headline;
    summary = concise(
      pint.personalizedNotes?.[0] || pint.warnings?.[0] || directAnswer,
      300
    );
    cards.snapshot = directAnswer;
    cards.catalyst = pint.exposures[0]?.note || "";
    cards.macroContext =
      pint.exposures.find((e) => /rates/i.test(e.theme))?.note ||
      `Rates sensitivity: ${profile.sensitivity?.rates || "moderate"}`;
    cards.sectorImpact =
      pint.exposures.find((e) => /AI/i.test(e.theme))?.note ||
      `AI-weighted exposure ~${profile.aiWeight || "—"}%`;
    cards.volatility =
      pint.exposures.find((e) => /vol/i.test(e.theme))?.note ||
      (top3Weight > 35 ? "Concentration elevates vol sensitivity" : "");
    cards.aiSummary = summary;
    keyDrivers.push(
      `Top weights: ${top3.map((h) => `${h.symbol} ${h.weight}%`).join(", ")}`,
      profile.growthDefensiveTilt || "Growth tilt"
    );
    signals.push(...(pint.warnings || []).slice(0, 2));
  }

  logicDebug("portfolioAnswerShaper", { shape, title });

  return {
    shape,
    title,
    directAnswer,
    summary,
    cards,
    signals: signals.slice(0, 5),
    keyDrivers: keyDrivers.filter(Boolean).slice(0, 5),
    llmFocus: plan?.primaryQuestion || prompt,
    useShapedAnswer: shape !== "book_overview",
  };
}
