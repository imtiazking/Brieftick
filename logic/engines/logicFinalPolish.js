/**
 * Final polish — dedupe, schema alignment, dense wording, headline hygiene.
 * @module logic/engines/logicFinalPolish
 */

import { resolveCardSchema } from "../cardSchemas.js";
import { cardDeduper } from "./cardDeduper.js";
import { validateSchemaCards } from "./schemaCardValidator.js";
import { formatHeadlineSupport } from "./headlineContext.js";
import { concise } from "./topicContext.js";
import { logicDebug } from "../shared.js";

const SHARPEN_PHRASES = [
  [
    /automotive and industrial manufacturers with global bom exposure/gi,
    "Global manufacturers and auto suppliers",
  ],
  [
    /container shipping lines and freight forwarders/gi,
    "Shipping lines and freight forwarders",
  ],
  [
    /consumer discretionary with high shipping-intensity margins/gi,
    "Consumer discretionary importers",
  ],
  [
    /retailers and broadline consumer names importing finished goods/gi,
    "Retailers and consumer importers",
  ],
  [
    /logistics firms that priced disruption and scarcity/gi,
    "Logistics firms with scarcity premia",
  ],
  [
    /investors may interpret/gi,
    "Markets may read",
  ],
  [
    /markets appear to be pricing in/gi,
    "Markets price in",
  ],
  [
    /markets may read this through/gi,
    "",
  ],
  [
    /with elevated likelihood of/gi,
    "with risk of",
  ],
  [
    /in narrative terms, not a forecast/gi,
    "",
  ],
  [
    /\bthat may\b/gi,
    "may",
  ],
];

/**
 * @param {string} text
 */
export function sharpenWording(text) {
  let out = String(text || "");
  for (const [pattern, replacement] of SHARPEN_PHRASES) {
    out = out.replace(pattern, replacement);
  }
  return out
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
}

/**
 * @param {import('../types.js').LogicResponse} res
 */
function sharpenResponse(res) {
  const sharpen = (t) => concise(sharpenWording(t), 200);
  const cards = {};
  for (const [k, v] of Object.entries(res.cards || {})) {
    cards[k] = v ? sharpen(v) : "";
  }
  const optional = {};
  for (const [k, v] of Object.entries(res.optionalCards || {})) {
    optional[k] = v ? sharpen(v) : "";
  }
  return {
    ...res,
    directAnswer: res.directAnswer ? concise(sharpenWording(res.directAnswer), 340) : "",
    summary: res.summary ? concise(sharpenWording(res.summary), 320) : "",
    cards,
    optionalCards: optional,
  };
}

/**
 * @param {import('../types.js').LogicResponse} res
 * @param {object} ctx
 */
export function logicFinalPolish(res, ctx) {
  const schema = resolveCardSchema(res);
  let out = { ...res };

  if (ctx.mode === "macro-interpretation") {
    const opt = { ...(out.optionalCards || {}) };
    delete opt.relatedMovers;
    out.optionalCards = opt;
  }

  const headlines =
    ctx.fusion?.relatedHeadlines?.length
      ? ctx.fusion.relatedHeadlines
      : ctx.fusion?.news?.headlines || [];
  const support =
    ctx.mode === "macro-interpretation"
      ? ""
      : formatHeadlineSupport(headlines, ctx.prompt || "");
  if (support) {
    const noisy = out.optionalCards?.relatedMovers;
    if (!noisy || /reuters|three months|trump losing/i.test(noisy)) {
      out.optionalCards = { ...(out.optionalCards || {}), relatedMovers: support };
    }
  } else if (out.optionalCards?.relatedMovers) {
    const opt = { ...out.optionalCards };
    if (/reuters|three months|trump losing/i.test(opt.relatedMovers)) {
      delete opt.relatedMovers;
    }
    out.optionalCards = opt;
  }

  out = validateSchemaCards(out, ctx);
  out = cardDeduper(out, schema);
  out = sharpenResponse(out);

  if (!out.cards.aiSummary?.trim() && out.directAnswer) {
    out.cards.aiSummary = concise(out.directAnswer, 240);
  }

  out.finalPolishApplied = true;
  logicDebug("logicFinalPolish", { schema: schema.length });

  return out;
}
