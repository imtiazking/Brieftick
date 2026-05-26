/**
 * Schema card validation — align card body with label topic.
 * @module logic/engines/schemaCardValidator
 */

import { concise } from "./topicContext.js";
import { resolveCardSchema } from "../cardSchemas.js";
import { logicDebug } from "../shared.js";

/** @type {Record<string, { must?: RegExp, mustNot?: RegExp, fallbackKey?: string }>} */
const LABEL_RULES = {
  "Inflation Transmission": {
    must: /inflation|cpi|goods|pass-through|disinflat|price pressure|input cost/i,
    mustNot: /^volatility may rise if the shift surprises/i,
  },
  Volatility: {
    must: /vol|vix|gap|swing|term structure|risk prem/i,
    mustNot: /^goods inflation pressure eases/i,
  },
  "Volatility Outlook": {
    must: /vol|vix|headline|gap|surprise/i,
  },
  "Cost Impact": {
    must: /cost|freight|input|margin|shipping|route/i,
  },
  "Margin Effect": {
    must: /margin|profit|working capital|inventory|relief|compress/i,
  },
  "Sector Winners": {
    must: /winner|benefit|outperform|lead|retail|energy|defense|:/i,
  },
  "Sector Losers": {
    must: /loser|lose|lag|underperform|shipping|logistics|transport|:/i,
    mustNot: /^winners:/i,
  },
  "Sector Risks": {
    must: /risk|lose|lag|pressure|underperform|bearish/i,
  },
  "Oil Impact": {
    must: /oil|energy|crude|freight|inflation|defense/i,
  },
  "Risk Assets": {
    must: /equit|risk|bond|dollar|macro|rate|asset/i,
  },
  "Safe Havens": {
    must: /gold|treasury|defensive|haven|utility|staple/i,
  },
  "Price Action": {
    must: /price|session|%|move|quote|firm|soft/i,
  },
  Catalyst: {
    must: /catalyst|headline|driver|earnings|news|because|→/i,
  },
  Earnings: {
    must: /earnings|eps|guidance|revenue|profit/i,
  },
  Positioning: {
    must: /position|crowd|flow|holding|concentrat|momentum/i,
  },
  Risk: {
    must: /risk|vol|beta|drawdown|sensitiv/i,
  },
  Expectations: {
    must: /expect|rate|fed|cut|hike|pricing|narrative|inflation|disinflat/i,
  },
  "Growth & Earnings": {
    must: /growth|earnings|multiple|margin|capex|demand|gdp|recession/i,
  },
  "Positioning & Narrative": {
    must: /position|crowd|narrative|unwind|rotation|investor/i,
  },
  "Rates & Liquidity": {
    must: /rate|yield|liquidity|fed|financial condition|real yield|bond/i,
  },
};

/**
 * @param {string} label
 * @param {string} text
 */
function alignsWithLabel(label, text) {
  const rules = LABEL_RULES[label];
  if (!rules || !text?.trim()) return true;
  if (rules.must && !rules.must.test(text)) return false;
  if (rules.mustNot && rules.mustNot.test(text)) return false;
  return true;
}

/**
 * @param {string} label
 * @param {object} ctx
 * @param {import('../types.js').LogicResponse} res
 */
function fallbackForLabel(label, ctx, res) {
  const graph = ctx.graph;
  const model = ctx.causalModel;

  switch (label) {
    case "Inflation Transmission":
      return (
        graph?.secondOrder?.find((s) => /inflation|goods|cpi/i.test(s)) ||
        model?.macroTransmission ||
        "Goods inflation pressure may ease with a lag as input costs fall."
      );
    case "Volatility":
    case "Volatility Outlook":
      return "Vol may rise on surprises; otherwise dispersion widens more than index vol.";
    case "Margin Effect":
      return (
        graph?.firstOrder?.find((s) => /margin|inventory/i.test(s)) ||
        "Importer margins improve as transit friction fades."
      );
    case "Cost Impact":
      return graph?.firstOrder?.[0] || "Freight and input costs ease first.";
    case "Sector Winners":
      return model?.sectorWinners?.slice(0, 2).join("; ") || res.cards?.sectorImpact;
    case "Sector Losers":
      return model?.sectorLosers?.slice(0, 2).join("; ") || res.optionalCards?.sectorRisks;
    case "Expectations":
      return ctx.macroInterpretationModel?.expectations;
    case "Growth & Earnings":
      return ctx.macroInterpretationModel?.growthEarnings;
    case "Positioning & Narrative":
      return ctx.macroInterpretationModel?.positioningNarrative;
    case "Rates & Liquidity":
      return ctx.macroInterpretationModel?.ratesLiquidity;
    default:
      return "";
  }
}

/**
 * @param {import('../types.js').LogicResponse} res
 * @param {object} ctx
 */
export function validateSchemaCards(res, ctx) {
  const schema = resolveCardSchema(res);
  const cards = { ...(res.cards || {}) };
  const optional = { ...(res.optionalCards || {}) };
  const fixes = [];

  for (const entry of schema) {
    const { key, label } = entry;
    let text = cards[key] || (entry.optional ? optional[key] : "") || "";

    if (!alignsWithLabel(label, text)) {
      const replacement = fallbackForLabel(label, ctx, res);
      if (replacement) {
        fixes.push(`${key}→${label}`);
        text = concise(replacement, 200);
        if (entry.optional && key === "sectorRisks") {
          optional[key] = text;
        } else {
          cards[key] = text;
        }
      } else {
        cards[key] = "";
      }
    } else if (text) {
      if (entry.optional && key === "sectorRisks") optional[key] = concise(text, 200);
      else cards[key] = concise(text, 200);
    }
  }

  if (fixes.length) logicDebug("schemaCardValidator", fixes);

  return {
    ...res,
    cards,
    optionalCards: optional,
    schemaValidated: true,
  };
}
