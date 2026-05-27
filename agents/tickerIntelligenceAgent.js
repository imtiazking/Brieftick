import { buildAgentResponse } from "./types.js";
import {
  callAgentLLM,
  extractPrimaryTicker,
  getHeadlines,
  getQuote,
} from "./shared.js";
import { buildTickerDeskAnswer } from "../logic/engines/tickerDeskCopy.js";

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

  const desk = buildTickerDeskAnswer({
    symbol,
    displayName: symbol,
    quote: quote || null,
    headline: newsCtx.split(";")[0] || "",
  });

  return buildAgentResponse({
    title: `Why is ${symbol} moving?`,
    summary: desk,
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
