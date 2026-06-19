/**
 * Shared agent utilities — context, LLM, parsing.
 * @module agents/shared
 */

import { AGENT_DISCLAIMER, buildAgentResponse } from "./types.js";

const TICKER_RE =
  /\b(NVDA|TSLA|AAPL|MSFT|GOOGL|GOOG|AMZN|META|AMD|INTC|AVGO|SMCI|SPY|QQQ|DIA|IWM|XOM|CVX|JPM|GS|NFLX|CRM|COST|LLY|JNJ|BAC|CAT|BA|RIVN|SOX)\b/i;

export function extractTickers(text) {
  const found = new Set();
  const upper = (text || "").toUpperCase();
  const m = upper.match(/\b[A-Z]{1,5}\b/g) || [];
  m.forEach((s) => {
    if (s.length >= 2 && !["AI", "US", "UK", "EU", "IF", "OR", "AND", "THE"].includes(s))
      found.add(s);
  });
  const known = upper.match(TICKER_RE);
  if (known) known.forEach((s) => found.add(s.toUpperCase()));
  return [...found].slice(0, 6);
}

export function extractPrimaryTicker(text) {
  const list = extractTickers(text);
  return list[0] || "SPY";
}

export async function getHeadlines(limit = 6) {
  const api = window.BriefTickAPI;
  if (!api?.keys?.finnhub) return { headlines: [], live: false };
  try {
    const headlines = await api.getMarketNews("general");
    return { headlines: (headlines || []).slice(0, limit), live: true };
  } catch (_) {
    return { headlines: [], live: false };
  }
}

export async function getQuote(symbol) {
  const api = window.BriefTickAPI;
  if (!api) return null;
  try {
    if (typeof getFinnhubQuotes === "function") {
      const q = await getFinnhubQuotes([symbol]);
      if (q?.[symbol]?.price) return q[symbol];
    }
    return await api.getQuote(symbol);
  } catch (_) {
    return null;
  }
}

export function getPortfolioHoldings() {
  try {
    const raw = localStorage.getItem("brieftick_portfolio_v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed?.holdings) return parsed.holdings;
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

/**
 * Ask Claude via existing FORGENIQ proxy; expect JSON object in response.
 */
export async function callAgentLLM(systemPrompt, userPrompt, maxTokens = 700) {
  const api = window.BriefTickAPI;
  if (!api?.keys?.anthropic) return null;
  const prompt = `${systemPrompt}

Return ONLY valid JSON (no markdown fences) matching:
{
  "title": string,
  "summary": string,
  "keyDrivers": string[],
  "signals": string[],
  "confidence": number,
  "sources": string[]
}

USER REQUEST:
${userPrompt}`;

  try {
    const raw = await api._claudeCall(prompt, maxTokens);
    if (!raw) return null;
    return parseAgentJson(raw);
  } catch (e) {
    console.warn("[agent] LLM failed:", e.message);
    return null;
  }
}

export function parseAgentJson(raw) {
  if (!raw) return null;
  const stripped = raw.replace(/```json|```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const obj = JSON.parse(stripped.slice(start, end + 1));
    return buildAgentResponse({
      title: obj.title || "Market intelligence",
      summary: obj.summary || stripped,
      keyDrivers: obj.keyDrivers || obj.key_drivers || [],
      signals: obj.signals || [],
      confidence: obj.confidence ?? 65,
      sources: obj.sources || ["Anthropic · FORGENIQ"],
      disclaimer: AGENT_DISCLAIMER,
      usedAI: true,
    });
  } catch (e) {
    return buildAgentResponse({
      title: "Market intelligence",
      summary: stripped.slice(0, 600),
      keyDrivers: [],
      signals: [],
      confidence: 55,
      sources: ["Anthropic · FORGENIQ"],
      usedAI: true,
    });
  }
}

export const MOCK_HEADLINES = [
  { headline: "Fed speakers lean cautious on near-term cuts", source: "Macro Wire" },
  { headline: "Mega-cap tech holds index gains as breadth narrows", source: "Market Desk" },
  { headline: "Energy complex firm on supply discipline narrative", source: "Commodities" },
];
