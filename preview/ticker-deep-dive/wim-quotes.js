/**
 * Live quote fetch for Ticker Deep Dive (preview-safe).
 * @module preview/ticker-deep-dive/wim-quotes
 */

const PREVIEW_FALLBACK = {
  NVDA: { price: 219.46, pctChange: 1.98, change: 4.26 },
  AMD: { price: 164.28, pctChange: -3.44, change: -5.86 },
  TSLA: { price: 246.18, pctChange: -1.42, change: -3.54 },
  AAPL: { price: 219.84, pctChange: 0.22, change: 0.48 },
  META: { price: 568.42, pctChange: -0.84, change: -4.82 },
  SPY: { price: 512.84, pctChange: 0.34, change: 1.74 },
  XOM: { price: 118.62, pctChange: 1.18, change: 1.38 },
};

/**
 * @param {string} sym
 * @returns {Promise<{ price: number, pctChange: number, change: number, provider?: string } | null>}
 */
export async function fetchLiveQuote(sym) {
  const key = String(sym || "").toUpperCase();
  try {
    const res = await fetch(
      `/api/proxy?provider=finnhub&endpoint=quote&symbol=${encodeURIComponent(key)}`
    );
    if (res.ok) {
      const data = await res.json();
      const price = Number(data?.c ?? data?.price);
      const prev = Number(data?.pc ?? data?.previousClose);
      if (price > 0) {
        const change = price - (prev || price);
        const pctChange = prev ? (change / prev) * 100 : Number(data?.dp ?? 0);
        return { price, pctChange, change, provider: "Finnhub" };
      }
    }
  } catch {
    /* preview may lack API */
  }
  const fb = PREVIEW_FALLBACK[key];
  if (fb) return { ...fb, provider: "Preview" };
  const h = key.split("").reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
  const pctChange = ((h % 700) / 100) - 3.5;
  return {
    price: 100 + (h % 400),
    pctChange,
    change: pctChange,
    provider: "Preview",
  };
}
