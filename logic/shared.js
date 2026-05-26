/**
 * Shared Logic utilities — context, LLM, API resilience, debug.
 * @module logic/shared
 */

import { buildLogicResponse, LIMITED_DATA_MSG, LOGIC_DISCLAIMER } from "./types.js";
import { resolvePrimaryEntity } from "./entityResolver.js";

export function logicDebug(event, data) {
  const payload = data !== undefined ? data : "";
  const on =
    window.__LOGIC_DEBUG === true ||
    window.__LOGIC_PREVIEW === true ||
    new URLSearchParams(location.search).get("logic_debug") === "1" ||
    new URLSearchParams(location.search).get("preview") === "logic" ||
    new URLSearchParams(location.search).get("preview") === "agent";
  if (on) console.log(`[Brieftick Logic] ${event}`, payload);
}

/**
 * @param {object} ctx
 * @param {string} symbol
 */
export function buildFusionPromptExtras(ctx, symbol) {
  const fusion = ctx.fusion;
  if (!fusion) return "";
  const q = fusion.quotes?.[symbol];
  const news = (fusion.relatedHeadlines?.length
    ? fusion.relatedHeadlines
    : fusion.news?.headlines || []
  )
    .slice(0, 4)
    .map((n) => n.headline)
    .join("; ");
  const quoteLine = q
    ? `Quote (${q.providers.join("+")}): ${q.pctChange >= 0 ? "+" : ""}${q.pctChange?.toFixed(2)}% agreement=${q.agreement}`
    : "Quote: unavailable";
  const sentiment = fusion.sentiment?.label || "";
  const vol = fusion.volatility
    ? `VIX/regime: ${fusion.volatility.vixLabel} · ${fusion.volatility.regime}`
    : "";
  const sector =
    fusion.sectorMoves?.length > 0
      ? `Sectors: ${fusion.sectorMoves
          .slice(0, 3)
          .map((s) => `${s.label} ${s.pct != null ? (s.pct >= 0 ? "+" : "") + s.pct.toFixed(2) + "%" : "—"}`)
          .join(", ")}`
      : "";
  return `${quoteLine}\nHeadlines: ${news || "contextual"}\n${sentiment}\n${vol}\n${sector}\nWatchlist: ${ctx.memory?.hint || "none"}\nPortfolio: ${ctx.portfolioMemory?.hint || "none"}`;
}

/**
 * @param {string} prompt
 * @param {import('./entityResolver.js').ResolvedEntity} [entity]
 */
export function resolveSymbolForPrompt(prompt, entity) {
  const primary = entity || resolvePrimaryEntity(prompt);
  if (primary?.symbol) return primary.symbol;
  return "SPY";
}

export async function getHeadlines(limit = 6) {
  const api = window.BriefTickAPI;
  const failedSources = [];
  if (!api?.keys?.finnhub) {
    failedSources.push("finnhub:missing_key");
    return { headlines: [], live: false, delayed: false, failedSources };
  }
  try {
    const headlines = await api.getMarketNews("general");
    return {
      headlines: (headlines || []).slice(0, limit),
      live: true,
      delayed: false,
      failedSources,
    };
  } catch (e) {
    failedSources.push(`finnhub:${e.message || "error"}`);
    logicDebug("api_failed", { source: "finnhub_news", error: e.message });
    return { headlines: [], live: false, delayed: true, failedSources };
  }
}

export async function getQuote(symbol) {
  const api = window.BriefTickAPI;
  const failedSources = [];
  if (!api) {
    failedSources.push("quote:no_api");
    return { quote: null, failedSources };
  }
  try {
    if (typeof getFinnhubQuotes === "function") {
      const q = await getFinnhubQuotes([symbol]);
      if (q?.[symbol]?.price != null) return { quote: q[symbol], failedSources };
    }
    const quote = await api.getQuote(symbol);
    if (quote) return { quote, failedSources };
    failedSources.push(`quote:empty_${symbol}`);
  } catch (e) {
    if (/rate|429|limit/i.test(e.message || "")) {
      failedSources.push(`quote:rate_limit_${symbol}`);
    } else {
      failedSources.push(`quote:${symbol}:${e.message || "error"}`);
    }
    logicDebug("api_failed", { source: "quote", symbol, error: e.message });
  }
  return { quote: null, failedSources };
}

export function getPortfolioHoldings() {
  try {
    const raw = localStorage.getItem("brieftick_portfolio_v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed?.holdings) return parsed.holdings;
    if (parsed?.profile?.holdings) return parsed.profile.holdings;
  } catch (_) {}
  const ta = document.getElementById("portfolioInput");
  if (!ta?.value?.trim()) return [];
  return ta.value
    .trim()
    .split("\n")
    .map((line) => {
      const parts = line.trim().split(/[\s,]+/);
      return { symbol: (parts[0] || "").toUpperCase(), weight: parseFloat(parts[1]) || 0 };
    })
    .filter((h) => h.symbol);
}

export function getWatchlist() {
  try {
    const raw = localStorage.getItem("brieftick_watchlist_v1");
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

export async function callLogicLLM(systemPrompt, userPrompt, maxTokens = 700) {
  const api = window.BriefTickAPI;
  if (!api?.keys?.anthropic) {
    logicDebug("api_failed", { source: "anthropic", error: "missing_key" });
    return null;
  }
  const prompt = `${systemPrompt}

Return ONLY valid JSON (no markdown fences) matching:
{
  "title": string,
  "directAnswer": string,
  "summary": string,
  "keyDrivers": string[],
  "signals": string[],
  "confidence": number,
  "sources": string[],
  "cards": {
    "snapshot": string,
    "catalyst": string,
    "macroContext": string,
    "sectorImpact": string,
    "volatility": string,
    "aiSummary": string
  }
}

USER REQUEST:
${userPrompt}`;

  try {
    const raw = await api._claudeCall(prompt, maxTokens);
    if (!raw) return null;
    return parseLogicJson(raw);
  } catch (e) {
    logicDebug("api_failed", { source: "anthropic", error: e.message });
    return null;
  }
}

export function parseLogicJson(raw) {
  if (!raw) return null;
  const stripped = raw.replace(/```json|```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const obj = JSON.parse(stripped.slice(start, end + 1));
    return buildLogicResponse({
      title: obj.title || "Market intelligence",
      directAnswer: obj.directAnswer || obj.direct_answer,
      summary: obj.summary || stripped.slice(0, 400),
      keyDrivers: obj.keyDrivers || obj.key_drivers || [],
      signals: obj.signals || [],
      confidence: obj.confidence ?? 65,
      sources: obj.sources || ["Anthropic · Brieftick Logic"],
      cards: obj.cards,
      disclaimer: LOGIC_DISCLAIMER,
      usedAI: true,
    });
  } catch (e) {
    return buildLogicResponse({
      title: "Market intelligence",
      summary: stripped.slice(0, 500),
      keyDrivers: [],
      signals: [],
      confidence: 55,
      sources: ["Anthropic · Brieftick Logic"],
      usedAI: true,
    });
  }
}

export function withDataLimited(partial, failedSources = []) {
  const limited = failedSources.length > 0;
  const summary = limited
    ? `${LIMITED_DATA_MSG} ${partial.summary || ""}`.trim()
    : partial.summary;
  return buildLogicResponse({
    ...partial,
    summary,
    dataLimited: limited,
    failedSources,
    mockData: partial.mockData || limited,
  });
}

export const MOCK_HEADLINES = [
  { headline: "Fed speakers lean cautious on near-term cuts", source: "Macro Wire" },
  { headline: "Mega-cap tech holds index gains as breadth narrows", source: "Market Desk" },
  { headline: "Energy complex firm on supply discipline narrative", source: "Commodities" },
];
