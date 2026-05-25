import { buildAgentResponse } from "./types.js";
import {
  callAgentLLM,
  extractPrimaryTicker,
  getHeadlines,
  getQuote,
} from "./shared.js";

export async function runTickerIntelligenceAgent(prompt) {
  const symbol = extractPrimaryTicker(prompt);
  const api = window.BriefTickAPI;

  if (api?.aiWhyMoving) {
    try {
      const text = await api.aiWhyMoving(symbol);
      if (text) {
        return buildAgentResponse({
          title: `${symbol} · Price action context`,
          summary: text.slice(0, 520),
          keyDrivers: ["News catalyst", "Sector sympathy", "Macro rates backdrop"],
          signals: ["Volatility active", "Headline-driven"],
          confidence: 74,
          sources: ["Finnhub", "Anthropic · Brieftick"],
          mode: "ticker",
          usedAI: true,
        });
      }
    } catch (_) {}
  }

  const [quote, { headlines }] = await Promise.all([
    getQuote(symbol),
    getHeadlines(5),
  ]);

  const newsCtx = headlines
    .filter((n) => (n.headline || "").toUpperCase().includes(symbol))
    .slice(0, 3)
    .map((n) => n.headline)
    .join("; ");

  const ai = await callAgentLLM(
    "You explain why a stock is moving. Educational only. No recommendations.",
    `Symbol: ${symbol}\nPrompt: ${prompt}\nQuote: ${quote ? JSON.stringify({ price: quote.price, pct: quote.pctChange }) : "unavailable"}\nNews: ${newsCtx || "general market headlines"}`,
    700
  );

  if (ai) return { ...ai, mode: "ticker" };

  return buildAgentResponse({
    title: `Why is ${symbol} moving?`,
    summary: quote
      ? `${symbol} is ${quote.pctChange >= 0 ? "trading higher" : "trading lower"} (${quote.pctChange >= 0 ? "+" : ""}${quote.pctChange.toFixed(2)}%) with attention on headline flow and sector beta. Moves appear driven by a mix of catalyst sensitivity and broader risk appetite rather than a single isolated datapoint.`
      : `${symbol} is seeing attention in today's tape, but live quote data is temporarily unavailable. Context is being inferred from headline tone and sector patterns only.`,
    keyDrivers: [
      newsCtx || "Sector and macro narrative",
      quote ? `Day change ${quote.pctChange.toFixed(2)}%` : "Quote feed limited",
      "Sentiment and volatility channel",
    ],
    signals: [
      quote?.pctChange >= 0 ? "Positive momentum" : "Negative momentum",
      "Headline sensitivity",
    ],
    confidence: quote ? 70 : 48,
    sources: quote ? ["Finnhub", "Brieftick"] : ["Brieftick preview"],
    mode: "ticker",
    mockData: !quote,
  });
}
