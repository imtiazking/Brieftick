/**
 * Social Intelligence Feed — Magic UI Tweet Card preview with live Finnhub data.
 * Activate with: ?preview=social-intelligence
 * No Twitter/X API calls.
 */
(function () {
  const PREVIEW_KEY = "social-intelligence";
  const REFRESH_MS = 5 * 60_000;
  const params = new URLSearchParams(window.location.search);
  const isPreview = window.__SOCIAL_INTEL_PREVIEW || params.get("preview") === PREVIEW_KEY;

  if (!isPreview) return;

  window.__SOCIAL_INTEL_PREVIEW = true;

  let _lastFetch = 0;
  let _refreshTimer = null;

  const FALLBACK_SIGNALS = [
    {
      id: "fallback-01",
      author: "Market Intelligence",
      handle: "Finnhub unavailable · demo card",
      verified: false,
      ago: "—",
      signalType: "Market News",
      sentiment: "neutral",
      sentimentLabel: "Neutral",
      body: "Connect Finnhub in Settings to load live headlines. This card appears when the live feed cannot be reached.",
      marketRead: "Awaiting live data",
      tickers: [],
      tags: ["neutral"],
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

  function classifyHeadline(text) {
    const t = (text || "").toLowerCase();
    if (/(fed\b|fomc|powell|ecb|central bank|rate cut|rate hike|basis point)/i.test(t)) {
      return { signalType: "Central Bank", author: "Macro Desk", handle: "Central Bank Signal" };
    }
    if (/(earnings|eps|guidance|beat|miss|quarterly results)/i.test(t)) {
      return { signalType: "Earnings", author: "Earnings Intelligence", handle: "Earnings Reaction" };
    }
    if (/(vix|volatility|vol spike|implied vol)/i.test(t)) {
      return { signalType: "Volatility", author: "Volatility Monitor", handle: "Vol Alert" };
    }
    if (/(cpi|gdp|jobs|payroll|pce|retail sales|pmi|ism|macro)/i.test(t)) {
      return { signalType: "Macro Data", author: "Macro Desk", handle: "Macro Commentary" };
    }
    if (/(sec\b|regulation|antitrust|sanctions|tariff)/i.test(t)) {
      return { signalType: "Regulatory", author: "Policy Desk", handle: "Regulatory Signal" };
    }
    return { signalType: "Market News", author: "Market Intelligence", handle: "Live Headline" };
  }

  function sentimentLabel(sentiment) {
    if (sentiment === "bullish") return "Risk-On";
    if (sentiment === "bearish") return "Risk-Off";
    return "Neutral";
  }

  function truncateText(str, max) {
    const s = String(str || "").trim();
    if (s.length <= max) return s;
    return s.slice(0, max - 3) + "...";
  }

  function mapLiveHeadline(n, index) {
    const fullText = (n.headline || "") + " " + (n.summary || "");
    const tags =
      typeof window.inferNewsTags === "function"
        ? window.inferNewsTags(fullText)
        : ["neutral"];
    const sentiment = tags.includes("bullish")
      ? "bullish"
      : tags.includes("bearish")
        ? "bearish"
        : "neutral";
    const cls = classifyHeadline(fullText);
    const ago =
      typeof window.formatNewsAgo === "function"
        ? window.formatNewsAgo(n.datetime)
        : "now";

    return {
      id: "live-" + (n.id || index),
      author: cls.author,
      handle: (n.source || "Finnhub") + " · " + cls.handle,
      verified: true,
      ago,
      signalType: cls.signalType,
      sentiment,
      sentimentLabel: sentimentLabel(sentiment),
      body: truncateText(n.summary || n.headline || "", 180),
      marketRead:
        tags.slice(0, 2).join(", ") +
        (sentiment === "bullish" ? " · constructive read" : sentiment === "bearish" ? " · cautious read" : " · mixed read"),
      tickers: [],
      tags: tags.slice(0, 2),
      isAI: false,
      headline: n.headline || "",
      headlineSummary: n.summary || "",
    };
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
      .slice(0, 2)
      .map((tag) => `<span class="si-tag si-tag--${tag}">${escapeHtml(tag)}</span>`)
      .join("");

    return `<article class="feed-item si-tweet-card si-tweet-card--enter" style="--si-delay:${index * 70}ms" data-si-id="${escapeHtml(item.id)}">
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

  function renderFeed(items, note) {
    const el = document.getElementById("sentimentFeed");
    if (!el) return;
    el.classList.add("si-feed-preview", "si-feed-scroll");
    el.innerHTML = `
      <div class="si-feed-note">${escapeHtml(note)}</div>
      ${items.map(renderCard).join("")}
    `;
    requestAnimationFrame(() => {
      el.querySelectorAll(".si-tweet-card--enter").forEach((card) => {
        card.classList.add("si-tweet-card--visible");
      });
    });
  }

  function updateMeta(status, live) {
    const meta = document.getElementById("sentimentMeta");
    if (meta) {
      meta.innerHTML = live
        ? `<span class="si-preview-badge">Live</span> ${escapeHtml(status)}`
        : `<span class="si-preview-badge">Demo</span> ${escapeHtml(status)}`;
    }
    const panel = document.getElementById("sentimentFeed")?.closest(".panel");
    if (panel) {
      panel.style.position = "relative";
      let ribbon = panel.querySelector(".si-preview-ribbon");
      if (!ribbon) {
        ribbon = document.createElement("div");
        ribbon.className = "si-preview-ribbon";
        panel.appendChild(ribbon);
      }
      ribbon.textContent = live
        ? "Social Intelligence · Live feed"
        : "Social Intelligence · Preview";
    }
  }

  function showLoading() {
    const el = document.getElementById("sentimentFeed");
    if (!el) return;
    el.classList.add("si-feed-preview");
    el.innerHTML =
      '<div class="si-feed-note">Loading live market headlines from Finnhub…</div><div style="font-size:12px;color:var(--ink-faint);padding:8px 0">Pulling Signal Intelligence Feed…</div>';
    updateMeta("Loading live data…", true);
  }

  async function waitForFinnhub(maxMs) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      if (window.BriefTickAPI?.keys?.finnhub) return true;
      if (window.BriefTickAPI && window.BriefTickAPI.keys && !window.BriefTickAPI.keys.finnhub) {
        return false;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return !!window.BriefTickAPI?.keys?.finnhub;
  }

  async function liveRefreshSocialIntelligencePreview(force) {
    const now = Date.now();
    if (!force && now - _lastFetch < REFRESH_MS) return;
    _lastFetch = now;

    if (typeof window.route === "function") window.route("dashboard");
    showLoading();

    const hasFinnhub = await waitForFinnhub(10000);
    if (!hasFinnhub || !window.BriefTickAPI?.getMarketNews) {
      renderFeed(
        FALLBACK_SIGNALS,
        "Finnhub not connected · showing demo card. Add your Finnhub key in Settings for live headlines."
      );
      updateMeta("Finnhub unavailable", false);
      return;
    }

    let headlines;
    try {
      headlines = await window.BriefTickAPI.getMarketNews("general");
    } catch (e) {
      console.warn("[social-intelligence preview] Finnhub fetch failed:", e.message);
      renderFeed(
        FALLBACK_SIGNALS,
        "Live fetch failed · showing demo card. Check Finnhub key and retry."
      );
      updateMeta("Fetch failed", false);
      return;
    }

    if (!headlines || !headlines.length) {
      renderFeed(FALLBACK_SIGNALS, "No live headlines returned · showing demo card.");
      updateMeta("No headlines", false);
      return;
    }

    const items = headlines.slice(0, 6).map(mapLiveHeadline);
    renderFeed(
      items,
      "Live Signal Feed · Finnhub market headlines · refreshes every 5 minutes"
    );
    updateMeta(
      "Finnhub · " +
        new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      true
    );

    if (window.BriefTickAPI.keys.anthropic) {
      const toEnrich = items.slice(0, 3);
      let enriched = false;
      for (let i = 0; i < toEnrich.length; i++) {
        const item = toEnrich[i];
        try {
          const ai = await window.BriefTickAPI.aiNewsInterpret(
            item.headline,
            item.headlineSummary
          );
          if (ai) {
            const sent =
              ai.sentiment === "bullish"
                ? "bullish"
                : ai.sentiment === "bearish"
                  ? "bearish"
                  : "neutral";
            items[i] = {
              ...item,
              sentiment: sent,
              sentimentLabel: sentimentLabel(sent),
              body: truncateText(ai.summary || item.body, 180),
              tickers: (ai.tickers || []).slice(0, 3),
              marketRead:
                (ai.tickers || []).slice(0, 3).join(", ") ||
                item.marketRead.replace("mixed read", "AI read"),
              tags: [...new Set([(ai.sectors || [])[0]?.toLowerCase?.(), sent])]
                .filter(Boolean)
                .slice(0, 2),
              isAI: true,
            };
            enriched = true;
          }
        } catch (_) {
          /* keep heuristic card */
        }
      }
      if (enriched) {
        renderFeed(
          items,
          "Live Signal Feed · Finnhub + AI enrichment · refreshes every 5 minutes"
        );
        updateMeta(
          "AI · " +
            new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
          true
        );
      }
    }
  }

  function initSocialIntelligencePreview() {
    if (_refreshTimer) return;
    liveRefreshSocialIntelligencePreview(true);
    _refreshTimer = setInterval(
      () => liveRefreshSocialIntelligencePreview(false),
      REFRESH_MS
    );
  }

  window.liveRefreshSocialIntelligencePreview = liveRefreshSocialIntelligencePreview;
  window.renderSocialIntelligencePreview = () =>
    liveRefreshSocialIntelligencePreview(true);
  window.initSocialIntelligencePreview = initSocialIntelligencePreview;

  window.addEventListener("load", () => {
    setTimeout(initSocialIntelligencePreview, 800);
  });
})();
