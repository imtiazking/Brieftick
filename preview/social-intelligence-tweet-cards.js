/**
 * Social Intelligence Feed — Magic UI Tweet Card preview (static sample data only).
 * Activate with: ?preview=social-intelligence
 * No Twitter/X API calls. Production feed logic is untouched when preview is off.
 */
(function () {
  const PREVIEW_KEY = "social-intelligence";
  const params = new URLSearchParams(window.location.search);
  const isPreview = window.__SOCIAL_INTEL_PREVIEW || params.get("preview") === PREVIEW_KEY;

  if (!isPreview) return;

  window.__SOCIAL_INTEL_PREVIEW = true;

  const SAMPLE_SIGNALS = [
    {
      id: "sig-01",
      author: "Global Macro Desk",
      handle: "Macro Commentary",
      verified: true,
      ago: "1m",
      signalType: "Central Bank",
      sentiment: "bearish",
      sentimentLabel: "Risk-Off",
      body: "Fed funds futures price 68bps of cuts by year-end. Front-end yields are repricing faster than equities.",
      marketRead: "SPY, TLT · duration bid",
      tickers: ["SPY", "TLT"],
      tags: ["macro"],
    },
    {
      id: "sig-02",
      author: "Earnings Intelligence",
      handle: "Earnings Reaction",
      verified: true,
      ago: "4m",
      signalType: "Beat / Guidance",
      sentiment: "bullish",
      sentimentLabel: "Risk-On",
      body: "NVDA guidance points to data-centre growth re-accelerating in Q3. Call skew turned heavy within 15 minutes of the print.",
      marketRead: "NVDA, SMCI · sympathy cluster",
      tickers: ["NVDA", "SMCI"],
      tags: ["tech"],
    },
    {
      id: "sig-03",
      author: "Volatility Monitor",
      handle: "Volatility Alert",
      verified: false,
      ago: "7m",
      signalType: "VIX Spike",
      sentiment: "bearish",
      sentimentLabel: "Elevated",
      body: "VIX term structure inverted for a third session. Dealer gamma turns negative below SPX 5,180.",
      marketRead: "VIX, SPX · gamma flip zone",
      tickers: ["VIX", "SPX"],
      tags: ["macro"],
    },
    {
      id: "sig-04",
      author: "Brieftick Session AI",
      handle: "Market Summary",
      verified: true,
      ago: "11m",
      signalType: "Session Brief",
      sentiment: "neutral",
      sentimentLabel: "Mixed",
      body: "Equities flat, credit spreads wider, dollar firm. Defensives outperform cyclicals for a third day.",
      marketRead: "Multi-asset · defensive rotation",
      tickers: ["XLK", "XLP"],
      tags: ["neutral"],
      isAI: true,
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
    const aiBadge = item.isAI ? '<span class="si-ai-badge">AI</span>' : "";
    const verified = item.verified
      ? '<span class="si-verified" aria-label="Verified source"></span>'
      : "";
    const tickers = (item.tickers || [])
      .slice(0, 3)
      .map(
        (t) =>
          `<span class="si-ticker si-ticker--${item.sentiment}">${escapeHtml(t)}</span>`
      )
      .join("");
    const tags = (item.tags || [])
      .slice(0, 1)
      .map((tag) => `<span class="si-tag si-tag--${tag}">${escapeHtml(tag)}</span>`)
      .join("");

    return `<article class="feed-item si-tweet-card si-tweet-card--enter" style="--si-delay:${index * 80}ms" data-si-id="${escapeHtml(item.id)}">
      <div class="si-tweet-beam" aria-hidden="true"></div>
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
    el.classList.add("si-feed-preview", "si-feed-scroll");
    el.innerHTML = `
      <div class="si-feed-note">Preview mode · static demo cards only. Production feed pulls live Finnhub headlines every 5 minutes.</div>
      ${SAMPLE_SIGNALS.map(renderCard).join("")}
    `;
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
        '<span class="si-preview-badge">Demo</span> Not live · sample data';
    }
    const panel = document.getElementById("sentimentFeed")?.closest(".panel");
    if (panel) {
      panel.style.position = "relative";
      if (!panel.querySelector(".si-preview-ribbon")) {
        const ribbon = document.createElement("div");
        ribbon.className = "si-preview-ribbon";
        ribbon.textContent = "Preview · Static demo";
        panel.appendChild(ribbon);
      }
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
    }, 12000);
  }

  function initSocialIntelligencePreview() {
    if (typeof window.route === "function") window.route("dashboard");
    updatePreviewMeta();
    renderPreviewFeed();
    simulateLiveUpdates();
    setTimeout(() => {
      document.getElementById("sentimentFeed")?.closest(".panel")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 500);
  }

  window.renderSocialIntelligencePreview = renderPreviewFeed;
  window.initSocialIntelligencePreview = initSocialIntelligencePreview;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSocialIntelligencePreview);
  } else {
    initSocialIntelligencePreview();
  }

  window.addEventListener("load", () => {
    setTimeout(initSocialIntelligencePreview, 300);
  });
})();
