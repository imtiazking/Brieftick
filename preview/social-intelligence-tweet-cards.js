/**
 * Social Intelligence Feed — Magic UI Tweet Card preview (static sample data only).
 * Activate with: ?preview=social-intelligence&tab=dashboard
 * No Twitter/X API calls. Production feed logic is untouched when preview is off.
 */
(function () {
  const PREVIEW_KEY = "social-intelligence";
  const params = new URLSearchParams(window.location.search);
  const isPreview = params.get("preview") === PREVIEW_KEY;

  if (!isPreview) return;

  window.__SOCIAL_INTEL_PREVIEW = true;

  const SAMPLE_SIGNALS = [
    {
      id: "sig-01",
      author: "Global Macro Desk",
      handle: "Institutional · Macro Commentary",
      verified: true,
      ago: "1m",
      category: "Macro",
      signalType: "Central Bank",
      sentiment: "bearish",
      sentimentLabel: "Risk-Off",
      body: "Fed funds futures now price 68bps of cuts by December. Front-end yields are repricing faster than equities, suggesting the bond market is leading the risk-off rotation.",
      marketRead: "SPY, TLT · duration bid accelerating",
      tickers: ["SPY", "TLT", "DXY"],
      tags: ["macro", "rates"],
    },
    {
      id: "sig-02",
      author: "Earnings Intelligence",
      handle: "Live Signal · Earnings Reaction",
      verified: true,
      ago: "4m",
      category: "Earnings",
      signalType: "Beat / Guidance",
      sentiment: "bullish",
      sentimentLabel: "Risk-On",
      body: "NVDA guidance implies data-centre revenue growth re-accelerating into Q3. Options skew flipped call-heavy within 15 minutes of the print, a pattern that historically precedes sympathy moves in SMCI and AVGO.",
      marketRead: "NVDA, SMCI · sympathy cluster forming",
      tickers: ["NVDA", "SMCI", "AVGO"],
      tags: ["tech", "bullish"],
    },
    {
      id: "sig-03",
      author: "Volatility Monitor",
      handle: "Live Alert · Volatility Regime",
      verified: false,
      ago: "7m",
      category: "Volatility",
      signalType: "VIX Spike",
      sentiment: "bearish",
      sentimentLabel: "Elevated",
      body: "VIX term structure inverted for the third session. 1-week/1-month spread at -2.4 vol points. Dealer gamma estimates turning negative below SPX 5,180, raising tail-risk of accelerated moves.",
      marketRead: "VIX, SPX · gamma flip zone",
      tickers: ["VIX", "SPX"],
      tags: ["macro", "bearish"],
    },
    {
      id: "sig-04",
      author: "Brieftick Session AI",
      handle: "Auto-Generated · Market Summary",
      verified: true,
      ago: "11m",
      category: "AI Summary",
      signalType: "Session Brief",
      sentiment: "neutral",
      sentimentLabel: "Mixed",
      body: "Cross-asset read: equities flat, credit spreads +3bps, dollar firm. Rotation pattern favours defensives over cyclicals for a third day. Breadth improving but leadership narrow, dominated by mega-cap tech.",
      marketRead: "Multi-asset · defensive rotation intact",
      tickers: ["XLK", "XLP", "HYG"],
      tags: ["neutral", "macro"],
      isAI: true,
    },
    {
      id: "sig-05",
      author: "Why Is It Moving",
      handle: "Attribution Engine · Live",
      verified: true,
      ago: "14m",
      category: "Price Action",
      signalType: "WIM Signal",
      sentiment: "bullish",
      sentimentLabel: "Momentum",
      body: "TSLA +4.2% attributed primarily to delivery beat (+3.1pp contribution) and margin guidance revision (+0.8pp). Residual move (+0.3pp) aligns with EV sector beta. No single headline catalyst beyond the print.",
      marketRead: "TSLA, RIVN · sector beta spillover",
      tickers: ["TSLA", "RIVN"],
      tags: ["tech", "bullish"],
      isAI: true,
    },
    {
      id: "sig-06",
      author: "Sell-Side Flow Desk",
      handle: "Institutional Sentiment · Analyst Reactions",
      verified: true,
      ago: "18m",
      category: "Sentiment",
      signalType: "Analyst Revision",
      sentiment: "bullish",
      sentimentLabel: "Constructive",
      body: "Three bulge-bracket upgrades in semiconductors within 90 minutes. Consensus EPS revisions for the SOX index now tracking +2.4% for FY25, the largest upward revision cluster in six weeks.",
      marketRead: "SOX, AMD, INTC · revision momentum",
      tickers: ["SOX", "AMD", "INTC"],
      tags: ["tech", "bullish"],
    },
  ];

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function initials(name) {
    return (name || "BT")
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  }

  function renderCard(item, index) {
    const aiBadge = item.isAI
      ? '<span class="si-ai-badge">AI</span>'
      : "";
    const verified = item.verified
      ? '<span class="si-verified" aria-label="Verified source"></span>'
      : "";
    const tickers = (item.tickers || [])
      .slice(0, 4)
      .map(
        (t) =>
          `<span class="si-ticker si-ticker--${item.sentiment}">${escapeHtml(t)}</span>`
      )
      .join("");
    const tags = (item.tags || [])
      .slice(0, 2)
      .map((tag) => `<span class="si-tag si-tag--${tag}">${escapeHtml(tag)}</span>`)
      .join("");

    return `<article class="feed-item si-tweet-card si-tweet-card--enter" style="--si-delay:${index * 80}ms" data-si-id="${escapeHtml(item.id)}">
      <div class="si-tweet-beam" aria-hidden="true"></div>
      <div class="si-tweet-glow" aria-hidden="true"></div>
      <header class="si-tweet-head">
        <div class="si-tweet-avatar" aria-hidden="true">${escapeHtml(initials(item.author))}</div>
        <div class="si-tweet-identity">
          <div class="si-tweet-author">${escapeHtml(item.author)}${verified}${aiBadge}</div>
          <div class="si-tweet-handle">${escapeHtml(item.handle)}</div>
        </div>
        <div class="si-tweet-meta-right">
          <span class="si-live-pulse" aria-hidden="true"></span>
          <time class="si-tweet-time">${escapeHtml(item.ago)}</time>
        </div>
      </header>
      <p class="si-tweet-body">${escapeHtml(item.body)}</p>
      <div class="si-tweet-signals">
        <span class="si-signal-type">${escapeHtml(item.signalType)}</span>
        <span class="si-sentiment si-sentiment--${item.sentiment}">${escapeHtml(item.sentimentLabel)}</span>
        ${tags}
      </div>
      <div class="si-tweet-impact">
        <span class="si-impact-label">Market read</span>
        <span class="si-impact-val">${escapeHtml(item.marketRead)}</span>
      </div>
      ${tickers ? `<div class="si-ticker-row">${tickers}</div>` : ""}
    </article>`;
  }

  function renderPreviewFeed() {
    const el = document.getElementById("sentimentFeed");
    if (!el) return;
    el.classList.add("si-feed-preview");
    el.innerHTML = SAMPLE_SIGNALS.map(renderCard).join("");
    requestAnimationFrame(() => {
      el.querySelectorAll(".si-tweet-card--enter").forEach((card) => {
        card.classList.add("si-tweet-card--visible");
      });
    });
  }

  function updatePreviewMeta() {
    const meta = document.getElementById("sentimentMeta");
    if (meta) {
      meta.innerHTML =
        '<span class="si-preview-badge">Preview</span> Live Signal Feed · Static demo';
    }
    const panel = document.getElementById("sentimentFeed")?.closest(".panel");
    if (panel && !panel.querySelector(".si-preview-ribbon")) {
      const ribbon = document.createElement("div");
      ribbon.className = "si-preview-ribbon";
      ribbon.textContent = "Social Intelligence · Preview Mode";
      panel.appendChild(ribbon);
    }
  }

  function simulateLiveUpdates() {
    const el = document.getElementById("sentimentFeed");
    if (!el) return;
    setInterval(() => {
      const cards = el.querySelectorAll(".si-tweet-card");
      if (!cards.length) return;
      const card = cards[Math.floor(Math.random() * cards.length)];
      card.classList.remove("si-tweet-card--pulse");
      void card.offsetWidth;
      card.classList.add("si-tweet-card--pulse");
      const timeEl = card.querySelector(".si-tweet-time");
      if (timeEl) {
        const mins = parseInt(timeEl.textContent, 10) || 1;
        if (mins < 59) timeEl.textContent = `${mins + 1}m`;
      }
    }, 12000);
  }

  function initSocialIntelligencePreview() {
    updatePreviewMeta();
    renderPreviewFeed();
    simulateLiveUpdates();
  }

  window.renderSocialIntelligencePreview = renderPreviewFeed;
  window.initSocialIntelligencePreview = initSocialIntelligencePreview;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSocialIntelligencePreview);
  } else {
    initSocialIntelligencePreview();
  }
})();
