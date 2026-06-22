/**
 * Earnings · beginner-first (production)
 * @module lib/earnings-beginner
 */

const EARN_IMPACT_RANK = {
  NVDA: 100,
  MSFT: 98,
  AAPL: 97,
  GOOGL: 95,
  AMZN: 94,
  META: 93,
  TSLA: 92,
  AVGO: 88,
  AMD: 87,
  NFLX: 82,
  JPM: 80,
  BAC: 75,
  XOM: 74,
  WMT: 72,
  V: 70,
  MA: 70,
  UNH: 68,
  JNJ: 66,
  GS: 70,
  C: 68,
  CVX: 70,
  INTC: 58,
  IBM: 52,
  MU: 62,
};

function getImpact(sym) {
  return EARN_IMPACT_RANK[sym] ?? 30;
}

function impactTier(score) {
  if (score >= 80) {
    return {
      key: "high",
      level: "High",
      blurb: "Expected to move markets, sectors or related stocks",
    };
  }
  if (score >= 55) {
    return { key: "medium", level: "Medium", blurb: "Can move its sector and peer group" };
  }
  return { key: "low", level: "Low", blurb: "Mostly affects this stock and close peers" };
}

function sessionPlain(session) {
  return session === "bmo" ? "Before market open" : "After market close";
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const EARN_BEGINNER = {
  NVDA: {
    quickBrief:
      "NVIDIA reports after the close. Investors are focused on AI data-center sales, next-quarter guidance, and whether demand still outpaces supply. The print is a health check for the entire AI trade and often moves chip stocks and the Nasdaq.",
    surprise:
      "A weak outlook could pressure AMD, memory stocks, and tech indexes; a strong beat often lifts the whole AI basket.",
  },
  MSFT: {
    quickBrief:
      "Microsoft reports after the close. The market wants Azure cloud growth, AI spending plans, and whether Copilot revenue is scaling. Results steer how investors value megacap software and cloud peers.",
    surprise: "Soft cloud guidance can hit enterprise software peers; a beat supports the Nasdaq leadership group.",
  },
  META: {
    quickBrief:
      "Meta reports after the close. Ad revenue, user engagement, and AI investment levels are in focus. The report sets tone for social media stocks and big-tech sentiment into the rest of earnings season.",
    surprise: "Ad weakness hurts SNAP and GOOGL sympathy; strong prints reinforce digital ad recovery.",
  },
  AAPL: {
    quickBrief:
      "Apple reports after the close. Investors watch iPhone demand, China sales, and services margins. As the largest U.S. company, its guidance often influences broad market confidence.",
    surprise: "China or services misses often ripple through phone suppliers; beats support broad market confidence.",
  },
  TSLA: {
    quickBrief:
      "Tesla reports after the close. Car profit margins, delivery outlook, and any pricing commentary drive the narrative. The stock often pulls other EV names and battery suppliers with it.",
    surprise: "Price cuts or withdrawn guidance hit EV peers; beats can lift lithium and charging names.",
  },
  JPM: {
    quickBrief:
      "JPMorgan reports before the open. Investors are focused on net interest income, loan growth, and credit quality. Results provide an early read on the health of the U.S. consumer and the banking sector.",
    surprise: "Weak credit data worries all banks; strong prints lift the financial sector ETF (XLF).",
  },
  AMD: {
    quickBrief:
      "AMD reports after the close. Data-center chip revenue and AI accelerator demand are the main lines. The stock often trades as a read-through from NVIDIA's AI narrative.",
    surprise: "Misses punish chip ETFs; beats can spark sympathy rallies across semiconductors.",
  },
  GOOGL: {
    quickBrief:
      "Alphabet reports after the close. Search ad trends, YouTube monetization, and Google Cloud growth are key. Results compete with Microsoft for the AI platform leadership story.",
    surprise: "Ad softness hits META sympathy; cloud beats lift enterprise software sentiment.",
  },
  AMZN: {
    quickBrief:
      "Amazon reports after the close. AWS growth and retail margins matter most for the stock. Cloud spending commentary can move the whole enterprise software complex.",
    surprise: "AWS misses hurt cloud peers; retail strength supports consumer discretionary stocks.",
  },
};

const EARN_THEME = {
  NVDA: "AI / Semiconductors",
  AMD: "AI / Semiconductors",
  AVGO: "AI / Semiconductors",
  INTC: "AI / Semiconductors",
  MU: "AI / Semiconductors",
  MSFT: "Cloud / Software",
  GOOGL: "Cloud / Ads",
  META: "Social / Ads",
  AAPL: "Consumer tech",
  AMZN: "Retail / Cloud",
  TSLA: "EVs",
  JPM: "Banks",
  BAC: "Banks",
  C: "Banks",
  GS: "Banks",
  WFC: "Banks",
  XOM: "Energy",
  CVX: "Energy",
  SBUX: "Consumer",
  UBER: "Consumer",
  BKNG: "Travel",
  IBM: "Enterprise tech",
  NFLX: "Streaming",
};

const SECTOR_THEME = {
  Tech: "Technology",
  Financials: "Banks",
  Energy: "Energy",
  Healthcare: "Healthcare",
  Consumer: "Consumer",
};

const EARN_SPILL = {
  NVDA: { win: ["AMD", "AVGO", "MU"], lose: ["INTC", "SOXX"] },
  MSFT: { win: ["GOOGL", "AMZN", "NVDA"], lose: ["XLK", "TLT"] },
  META: { win: ["GOOGL", "SNAP"], lose: ["PARA", "WBD"] },
  AAPL: { win: ["QCOM", "AVGO"], lose: ["SPY", "XLK"] },
  TSLA: { win: ["XOM", "GM"], lose: ["RIVN", "LCID", "CHPT"] },
  JPM: { win: ["BAC", "C", "XLF"], lose: ["KRE", "TLT"] },
  AMD: { win: ["NVDA", "MU"], lose: ["INTC", "SOXX"] },
  GOOGL: { win: ["META", "MSFT"], lose: ["SNAP", "XLC"] },
  AMZN: { win: ["MSFT", "SHOP"], lose: ["WMT", "TGT"] },
};

const EARN_META = {
  NVDA: {
    name: "NVIDIA",
    sector: "Tech",
    related: ["AMD", "AVGO", "MU", "SOXX"],
    watch: ["Data-center sales", "Next-quarter demand", "Supply and China"],
  },
  MSFT: {
    name: "Microsoft",
    sector: "Tech",
    related: ["GOOGL", "AMZN", "NVDA", "QQQ"],
    watch: ["Azure cloud growth", "AI product revenue vs costs", "Office and enterprise demand"],
  },
  META: {
    name: "Meta Platforms",
    sector: "Tech",
    related: ["GOOGL", "SNAP", "QQQ"],
    watch: ["Ad pricing and user engagement", "Reels monetization", "AI spending plans"],
  },
  AAPL: {
    name: "Apple",
    sector: "Tech",
    related: ["QCOM", "AVGO", "SPY"],
    watch: ["iPhone sales trend", "China revenue", "Services growth and margins"],
  },
  TSLA: {
    name: "Tesla",
    sector: "Consumer",
    related: ["F", "GM", "RIVN"],
    watch: ["Car profit margins", "Delivery outlook", "Updates on new models and autonomy"],
  },
  JPM: {
    name: "JPMorgan Chase",
    sector: "Financials",
    related: ["BAC", "C", "XLF"],
    watch: ["Loan growth", "Credit quality", "Investment banking"],
  },
};

function sessionWhenPhrase(session) {
  return session === "bmo" ? "before the open" : "after the close";
}

function buildQuickBrief(event) {
  const beg = EARN_BEGINNER[event.sym];
  if (beg?.quickBrief) return beg.quickBrief;
  const name = event.name || event.sym;
  return `${name} reports ${sessionWhenPhrase(event.session)}. ${event.whyImportant} ${event.wallStreet}`;
}

function quickBriefSentence(event) {
  const full = buildQuickBrief(event);
  const first = full.split(/(?<=[.!?])\s+/)[0];
  return first || full;
}

function calendarTheme(event) {
  return EARN_THEME[event.sym] || SECTOR_THEME[event.sector] || event.sector || "Earnings";
}

function watchLabels(event) {
  return (event.watch || []).map((w) => {
    const short = w.split(/[—–-]/)[0].trim();
    if (short.length > 42) return short.slice(0, 40) + "…";
    return short.replace(/^Whether /i, "").replace(/^What management says about /i, "");
  });
}

function spillFor(sym, related) {
  const s = EARN_SPILL[sym];
  if (s) return s;
  return { win: (related || []).slice(0, 3), lose: (related || []).slice(-2) };
}

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const weekDates = [11, 12, 13, 14, 15, 16, 17];
const weekEarnings = {
  0: [
    ["JPM", "bmo"],
    ["BAC", "bmo"],
    ["C", "bmo"],
  ],
  1: [
    ["MSFT", "amc"],
    ["GOOGL", "amc"],
    ["AMD", "amc"],
    ["SBUX", "amc"],
  ],
  2: [
    ["TSLA", "amc"],
    ["UBER", "amc"],
    ["IBM", "amc"],
  ],
  3: [
    ["NVDA", "amc"],
    ["META", "amc"],
    ["AAPL", "amc"],
    ["AMZN", "amc"],
    ["INTC", "amc"],
  ],
  4: [
    ["XOM", "bmo"],
    ["CVX", "bmo"],
  ],
  5: [],
  6: [],
};

let earnUsesLiveData = false;

const earnState = { filter: "all", search: "", events: [], selectedId: null, source: "demo" };

function dataBadgeLabel() {
  return earnUsesLiveData ? "Live calendar" : "Illustrative";
}

function dataDisclosureText() {
  return earnUsesLiveData
    ? "Calendar dates and symbols from Finnhub. Narrative context is editorial and separate from Finnhub calendar data."
    : "Earnings calendar loading — live dates and symbols from Finnhub when available.";
}

function initDataTrust() {
  const badge = document.getElementById("earnDataBadge");
  const disclosure = document.getElementById("earnDataDisclosure");
  if (badge) badge.textContent = dataBadgeLabel();
  if (disclosure) disclosure.textContent = dataDisclosureText();
}

function earnMeta(sym) {
  const base = EARN_META[sym] || {};
  const beg = EARN_BEGINNER[sym] || {};
  return {
    name: base.name || sym,
    sector: base.sector || "Other",
    related: base.related || ["SPY", "QQQ"],
    watch: base.watch || ["Revenue vs what analysts expected", "Profit margins", "Guidance for next quarter"],
    whatTheyDo: beg.whatTheyDo || `A publicly traded company (${sym}) reporting quarterly results.`,
    whyImportant:
      beg.whyImportant || "Earnings show whether the business is beating or missing what Wall Street expected.",
    wallStreet: beg.wallStreet || "Investors compare actual results to analyst estimates for revenue and profit.",
    surprise:
      beg.surprise || "A big beat or miss often moves the stock sharply and can drag related companies with it.",
  };
}

function earnExpectedMove(event) {
  const raw = parseFloat(String(event.iv || "").replace("%", ""));
  if (!Number.isNaN(raw)) return `±${(raw * 0.18).toFixed(1)}%`;
  const impact = event.impact ?? getImpact(event.sym);
  return `±${Math.max(2.2, Math.min(8.8, impact / 13)).toFixed(1)}%`;
}

function earnEventId(event) {
  return `${event.sym}:${event.dateKey || event.day || ""}:${event.session || ""}`;
}

function makeEarnEvent(opts) {
  const sym = opts.sym;
  const meta = earnMeta(sym);
  const impact = getImpact(sym);
  return {
    sym,
    name: opts.name || meta.name,
    session: opts.session || "amc",
    day: opts.day || "This week",
    dayIndex: opts.dayIndex ?? null,
    dateKey: opts.dateKey || "",
    epsExp: opts.epsExp || "—",
    revExp: opts.revExp || "—",
    iv: opts.iv || `${Math.max(18, Math.min(48, impact * 0.45)).toFixed(1)}%`,
    sector: opts.sector || meta.sector,
    impact,
    source: opts.source || "demo",
    related: meta.related,
    watch: meta.watch,
    whatTheyDo: meta.whatTheyDo,
    whyImportant: meta.whyImportant,
    wallStreet: meta.wallStreet,
    surprise: meta.surprise,
    theme: calendarTheme({ sym, sector: meta.sector || opts.sector }),
  };
}

function hydrateDemoEarnings() {
  const events = [];
  weekDays.forEach((label, dayIndex) => {
    (weekEarnings[dayIndex] || []).forEach(([sym, session]) => {
      events.push(
        makeEarnEvent({
          sym,
          session,
          day: `${label} ${weekDates[dayIndex]}`,
          dayIndex,
          epsExp: "—",
          revExp: "—",
        })
      );
    });
  });
  earnState.events = events;
  const nvda = events.find((e) => e.sym === "NVDA");
  earnState.selectedId = nvda ? earnEventId(nvda) : earnEventId(events[0] || {});
  earnState.source = "demo";
}

function visibleEarnEvents() {
  const q = earnState.search.trim().toUpperCase();
  return earnState.events.filter((e) => {
    if (q && !(e.sym.includes(q) || e.name.toUpperCase().includes(q))) return false;
    const f = earnState.filter;
    if (f === "all") return true;
    if (f === "mega") return e.impact >= 70;
    if (f === "bigmove") return parseFloat(e.iv) >= 34 || e.impact >= 80;
    if (f === "Tech") return e.sector === "Tech";
    if (f === "Financials") return e.sector === "Financials";
    if (f === "Energy") return e.sector === "Energy";
    if (f === "Healthcare") return e.sector === "Healthcare";
    return true;
  });
}

function whyItMattersLine(event) {
  const beg = EARN_BEGINNER[event.sym];
  if (beg?.whyImportant) return beg.whyImportant;
  if (event.impact >= 80) return "Large enough to move the whole market narrative.";
  if (event.impact >= 55) return "Important for its sector and supply chain.";
  return "Worth watching if you own the stock or its competitors.";
}

function investorCareLine(event) {
  const full = buildQuickBrief(event);
  const parts = full.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const second = parts[1];
    if (/investor|focused|watch|want|guidance|demand|market/i.test(second)) return second;
  }
  const focus = parts.find((s) => /investor|Wall Street|focused|watching/i.test(s));
  return focus || parts[1] || whyItMattersLine(event);
}

function watchChipLabels(event) {
  return watchLabels(event)
    .map((w) => {
      const trimmed = w.replace(/\s+and\s+/i, " · ");
      if (trimmed.length <= 24) return trimmed;
      const words = trimmed.split(/\s+/);
      if (words.length <= 4) return trimmed;
      return words.slice(0, 3).join(" ") + "…";
    })
    .slice(0, 4);
}

function intelChipsHtml(items, extraClass = "") {
  if (!items?.length) {
    return '<span class="intel-chip intel-chip--muted">—</span>';
  }
  const cls = extraClass ? ` intel-chip--${extraClass}` : "";
  return items.map((i) => `<span class="intel-chip${cls}">${esc(i)}</span>`).join("");
}

function getSelectedEvent() {
  const visible = visibleEarnEvents();
  if (!visible.length) return null;
  return visible.find((e) => earnEventId(e) === earnState.selectedId) || visible[0];
}

function orderedVisibleEvents() {
  return visibleEarnEvents()
    .slice()
    .sort(
      (a, b) =>
        (a.dayIndex ?? 99) - (b.dayIndex ?? 99) || b.impact - a.impact || a.sym.localeCompare(b.sym)
    );
}

let earnKbdFocusId = null;

function renderReportCount() {
  const el = document.getElementById("earnReportCount");
  if (!el) return;
  const n = earnState.events.length;
  el.textContent = `${n} report${n === 1 ? "" : "s"} this week`;
}

function ensureHeroShell() {
  const el = document.getElementById("earnDetailHero");
  if (!el) return null;
  if (el.dataset.shell === "1") return el;
  el.dataset.shell = "1";
  el.innerHTML = `
    <div class="earn-v2-detail-top earn-v2-swap-target">
      <div class="earn-v2-detail-identity">
        <h2 class="earn-v2-detail-sym" id="earnHeroSym"></h2>
        <p class="earn-v2-detail-name" id="earnHeroName"></p>
      </div>
      <div class="earn-v2-impact-badge" id="earnHeroImpact"></div>
    </div>
    <div class="earn-v2-quick-brief earn-v2-swap-target">
      <h3 class="earn-v2-quick-brief__label">Quick brief</h3>
      <p class="earn-v2-quick-brief__text" id="earnHeroBrief"></p>
    </div>
    <div class="earn-v2-metrics-row earn-v2-swap-target" role="list" aria-label="Key expectations" id="earnHeroMetrics"></div>
    <div class="earn-v2-chip-groups earn-v2-swap-target" id="earnHeroChips"></div>
    <div class="earn-v2-detail-actions">
      <button type="button" class="earn-v2-btn earn-v2-btn--gold" data-action="deep-dive" id="earnHeroDeep">Open Deep Dive</button>
      <button type="button" class="earn-v2-btn earn-v2-btn--disabled" id="earnHeroLogic" disabled>Ask Logic</button>
    </div>`;
  return el;
}

function renderHeroEmpty() {
  const el = document.getElementById("earnDetailHero");
  if (!el) return;
  el.dataset.shell = "";
  el.innerHTML =
    '<p style="color:var(--earn-dim);margin:0">No earnings match your search. Try another filter.</p>';
}

function fillHeroContent(selected) {
  const tier = impactTier(selected.impact);
  const { win, lose } = spillFor(selected.sym, selected.related);
  const watch = watchChipLabels(selected);
  const surprise = EARN_BEGINNER[selected.sym]?.surprise || selected.surprise;

  const symEl = document.getElementById("earnHeroSym");
  const nameEl = document.getElementById("earnHeroName");
  const impactEl = document.getElementById("earnHeroImpact");
  const briefEl = document.getElementById("earnHeroBrief");
  const metricsEl = document.getElementById("earnHeroMetrics");
  const chipsEl = document.getElementById("earnHeroChips");
  const deepBtn = document.getElementById("earnHeroDeep");
  const logicBtn = document.getElementById("earnHeroLogic");

  if (!symEl) return;

  symEl.textContent = selected.sym;
  nameEl.textContent = `${selected.name} · ${selected.day} · ${sessionPlain(selected.session)}`;
  impactEl.className = `earn-v2-impact-badge is-${tier.key}`;
  impactEl.innerHTML = `<span class="level"><strong>${esc(tier.level)} impact</strong></span><span class="blurb">${esc(tier.blurb)}</span>`;
  briefEl.textContent = buildQuickBrief(selected);
  metricsEl.innerHTML = `
      <div class="earn-v2-metric" role="listitem">
        <span class="earn-v2-metric__lbl">EPS expectation</span>
        <span class="earn-v2-metric__val">${esc(selected.epsExp)}</span>
      </div>
      <div class="earn-v2-metric" role="listitem">
        <span class="earn-v2-metric__lbl">Revenue expectation</span>
        <span class="earn-v2-metric__val">${esc(selected.revExp)}</span>
      </div>
      <div class="earn-v2-metric" role="listitem">
        <span class="earn-v2-metric__lbl">Expected move</span>
        <span class="earn-v2-metric__val">${esc(earnExpectedMove(selected))}</span>
      </div>
      <div class="earn-v2-metric" role="listitem">
        <span class="earn-v2-metric__lbl">Expected volatility</span>
        <span class="earn-v2-metric__val">${esc(selected.iv)}</span>
      </div>`;
  chipsEl.innerHTML = `
    <div class="earn-v2-chip-row">
      <span class="earn-v2-chip-row__label">Watch</span>
      <div class="earn-v2-chip-row__chips">${intelChipsHtml(watch)}</div>
    </div>
    <div class="earn-v2-chip-row">
      <span class="earn-v2-chip-row__label is-win">Potential winners</span>
      <div class="earn-v2-chip-row__chips">${intelChipsHtml(win, "win")}</div>
    </div>
    <div class="earn-v2-chip-row">
      <span class="earn-v2-chip-row__label is-lose">Potential losers</span>
      <div class="earn-v2-chip-row__chips">${intelChipsHtml(lose, "lose")}</div>
    </div>
    <p class="earn-v2-surprise-line"><span>Surprise</span>${esc(surprise)}</p>`;
  if (deepBtn) {
    deepBtn.dataset.sym = selected.sym;
  }
  if (logicBtn) {
    logicBtn.disabled = true;
    logicBtn.removeAttribute("data-action");
  }
  renderAnalysisPanel();
}

function renderAnalysisPanel() {
  const root = document.getElementById("earnAnalysisPanel");
  if (!root) return;
  const selected = getSelectedEvent();
  if (!selected) {
    root.innerHTML =
      '<p class="earn-v2-empty">No company matches your search. Try another filter on Calendar.</p>';
    return;
  }
  const tier = impactTier(selected.impact);
  const watch = watchChipLabels(selected);
  const { win, lose } = spillFor(selected.sym, selected.related);
  const surprise = EARN_BEGINNER[selected.sym]?.surprise || selected.surprise;
  const theme = selected.theme || calendarTheme(selected);

  root.innerHTML = `
    <p class="earn-v2-analysis-kicker">${esc(selected.sym)} · ${esc(selected.name)} · ${esc(selected.day)} · ${esc(sessionPlain(selected.session))}</p>
    <p class="earn-v2-analysis-meta"><span class="earn-v2-impact-pill earn-v2-impact-pill--${tier.key}">${esc(tier.level)} market impact</span> · Expected move ${esc(earnExpectedMove(selected))} · ${esc(theme)}</p>
    <h3 class="earn-v2-analysis-heading">Quick brief</h3>
    <p class="earn-v2-analysis-body">${esc(buildQuickBrief(selected))}</p>
    <h3 class="earn-v2-analysis-heading">What to watch</h3>
    <div class="earn-v2-chip-row__chips earn-v2-analysis-chips">${intelChipsHtml(watch)}</div>
    <h3 class="earn-v2-analysis-heading">Potential market reaction</h3>
    <p class="earn-v2-analysis-body">${esc(surprise)}</p>
    <h3 class="earn-v2-analysis-heading">If the report surprises investors</h3>
    <p class="earn-v2-analysis-body is-win"><strong>Potential winners:</strong> ${esc(win.join(", "))}</p>
    <p class="earn-v2-analysis-body is-lose"><strong>Potential losers:</strong> ${esc(lose.join(", "))}</p>
    <p class="earn-v2-analysis-note">${esc(dataDisclosureText())}</p>`;
}

function updateDetailHero(animate) {
  const visible = visibleEarnEvents();
  if (!visible.length) {
    renderHeroEmpty();
    renderAnalysisPanel();
    return;
  }
  const selected = getSelectedEvent();
  if (!selected) return;
  earnState.selectedId = earnEventId(selected);

  const el = ensureHeroShell();
  if (!el) return;

  const runUpdate = () => {
    fillHeroContent(selected);
    el.classList.remove("is-swapping");
    el.setAttribute("aria-live", "polite");
  };

  if (animate) {
    el.classList.add("is-swapping");
    window.setTimeout(runUpdate, 110);
  } else {
    runUpdate();
  }
}

function renderDetailHero() {
  const visible = visibleEarnEvents();
  if (!visible.length) {
    renderHeroEmpty();
    return;
  }
  const selected = getSelectedEvent();
  earnState.selectedId = earnEventId(selected);
  ensureHeroShell();
  fillHeroContent(selected);
}

function syncSelectionClasses() {
  document.querySelectorAll(".earn-v2-cal-tile, .earn-v2-imp-card").forEach((node) => {
    const id = node.dataset.earnId;
    const on = id === earnState.selectedId;
    node.classList.toggle("is-active", on && node.classList.contains("earn-v2-cal-tile"));
    node.classList.toggle("is-selected", on && node.classList.contains("earn-v2-imp-card"));
    node.classList.toggle("is-kbd-focus", on && id === earnKbdFocusId);
    node.setAttribute("aria-selected", on ? "true" : "false");
  });
}

function scrollTileIntoView(id) {
  const tile = document.querySelector(`.earn-v2-cal-tile[data-earn-id="${CSS.escape(id)}"]`);
  const scroll = document.getElementById("earnCalScroll");
  if (!tile || !scroll) return;
  const tileRect = tile.getBoundingClientRect();
  const scrollRect = scroll.getBoundingClientRect();
  if (tileRect.left < scrollRect.left || tileRect.right > scrollRect.right) {
    tile.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
  }
}

function renderImportant() {
  const grid = document.getElementById("impGrid");
  if (!grid) return;
  const events = visibleEarnEvents()
    .slice()
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5);
  grid.innerHTML = events
    .map((e) => {
      const tier = impactTier(e.impact);
      const id = earnEventId(e);
      const selected = earnState.selectedId === id ? " is-selected" : "";
      return `
    <article class="earn-v2-imp-card${selected}" data-earn-id="${esc(id)}" data-sym="${esc(e.sym)}" data-date="${esc(e.dateKey || e.day)}" data-session="${esc(e.session)}">
      <div class="earn-v2-imp-sym">${esc(e.sym)}</div>
      <div class="earn-v2-imp-name">${esc(e.name)}</div>
      <p class="earn-v2-imp-meta"><strong>${esc(e.day)}</strong> · ${esc(e.theme || calendarTheme(e))}</p>
      <p class="earn-v2-imp-why">${esc(whyItMattersLine(e))}</p>
      <p class="earn-v2-imp-move">Expected move ${esc(earnExpectedMove(e))}</p>
      <span class="earn-v2-impact-pill earn-v2-impact-pill--${tier.key}">${tier.level} impact</span>
    </article>`;
    })
    .join("");
}

function formatEarnDay(dateStr) {
  const [y, m, dd] = dateStr.split("-").map(Number);
  const d = new Date(y, m - 1, dd);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d - today) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7 && diffDays > 0) {
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtRevenue(v) {
  if (v == null || Number.isNaN(v)) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

function renderCalendar() {
  const grid = document.getElementById("calGrid");
  if (!grid) return;
  const events = visibleEarnEvents();
  let days;
  if (earnState.source === "live") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const localISO = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(today.getTime() + i * 86400000);
      return {
        label: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()],
        date: date.getDate(),
        key: localISO(date),
        today: i === 0,
      };
    });
  } else {
    days = weekDays.map((label, i) => ({
      label,
      date: weekDates[i],
      key: String(i),
      today: i === 3,
    }));
  }

  grid.innerHTML = days
    .map((d, i) => {
      const earns =
        earnState.source === "live"
          ? events.filter((e) => e.dateKey === d.key)
          : events.filter((e) => e.dayIndex === i);
      return `
    <div class="earn-v2-cal-day${d.today ? " is-today" : ""}">
      <div class="earn-v2-cal-day-head">
        <span>${d.label}</span>
        <span class="num">${d.date}</span>
      </div>
      ${earns
        .map((e) => {
          const tier = impactTier(e.impact);
          const id = earnEventId(e);
          const active = earnState.selectedId === id ? " is-active" : "";
          const kbd = earnKbdFocusId === id ? " is-kbd-focus" : "";
          const sess = e.session === "bmo" ? "is-bmo" : "is-amc";
          const theme = e.theme || calendarTheme(e);
          const move = earnExpectedMove(e);
          return `
        <div class="earn-v2-cal-tile ${sess}${active}${kbd}" tabindex="0" role="button"
          aria-selected="${earnState.selectedId === id ? "true" : "false"}"
          data-earn-id="${esc(id)}" data-sym="${esc(e.sym)}" data-date="${esc(e.dateKey || e.day)}" data-session="${esc(e.session)}"
          data-tip-sym="${esc(e.sym)}"
          data-tip-time="${esc(sessionPlain(e.session))}"
          data-tip-move="${esc(move)}"
          data-tip-care="${esc(investorCareLine(e))}">
          <div class="sym">${esc(e.sym)}</div>
          <div class="when">${esc(theme)}</div>
          <span class="earn-v2-impact-pill earn-v2-impact-pill--${tier.key}">${tier.level}</span>
        </div>`;
        })
        .join("")}
    </div>`;
    })
    .join("");
}

function renderEarningsUI() {
  const visible = visibleEarnEvents();
  if (visible.length && !visible.some((e) => earnEventId(e) === earnState.selectedId)) {
    earnState.selectedId = earnEventId(visible[0]);
    earnKbdFocusId = earnState.selectedId;
  }
  renderReportCount();
  renderDetailHero();
  renderImportant();
  renderCalendar();
  syncSelectionClasses();
  renderAnalysisPanel();
}

function selectEarning(sym, dateKey, session, opts = {}) {
  const event =
    earnState.events.find(
      (e) => e.sym === sym && String(e.dateKey || e.day) === String(dateKey) && e.session === session
    ) || earnState.events.find((e) => e.sym === sym);
  if (!event) return;
  earnState.selectedId = earnEventId(event);
  earnKbdFocusId = earnState.selectedId;
  if (opts.fullRender) {
    renderEarningsUI();
    return;
  }
  syncSelectionClasses();
  updateDetailHero(opts.animate !== false);
}

function setEarningsFilter(filter) {
  earnState.filter = filter || "all";
  document.querySelectorAll("[data-earn-filter]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.earnFilter === earnState.filter);
  });
  renderEarningsUI();
}

function initTabs() {
  document.querySelectorAll(".earn-v2-tab:not([hidden])").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.earnTab;
      document.querySelectorAll(".earn-v2-tab:not([hidden])").forEach((t) => {
        t.classList.toggle("is-active", t === tab);
      });
      document.querySelectorAll(".earn-v2-section:not([hidden])").forEach((s) => {
        s.classList.toggle("is-active", s.dataset.earn === target);
      });
      if (target === "ai") renderAnalysisPanel();
    });
  });
}

function initFilters() {
  const search = document.getElementById("earnSearch");
  if (search) {
    search.addEventListener("input", (e) => {
      earnState.search = e.target.value || "";
      renderEarningsUI();
    });
  }
  document.querySelectorAll("[data-earn-filter]").forEach((btn) => {
    btn.addEventListener("click", () => setEarningsFilter(btn.dataset.earnFilter));
  });
}

function openDeepDive(sym) {
  if (typeof window.openEarningWhy === "function") {
    window.openEarningWhy(sym);
    return;
  }
  if (typeof window.route === "function") {
    window.route("why");
    requestAnimationFrame(() => {
      if (typeof window.loadWim === "function") window.loadWim(sym);
    });
    return;
  }
  const s = encodeURIComponent(sym);
  window.open(`/?sym=${s}#page-why`, "_blank");
}

function initCalTooltip() {
  let tip = document.getElementById("earnCalTooltip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "earnCalTooltip";
    tip.className = "earn-v2-cal-tooltip";
    tip.setAttribute("role", "tooltip");
    tip.hidden = true;
    document.body.appendChild(tip);
  }

  const grid = document.getElementById("calGrid");
  if (!grid) return;

  function show(tile) {
    const sym = tile.dataset.tipSym;
    if (!sym) return;
    const move = tile.dataset.tipMove || "—";
    tip.innerHTML = `
      <p class="earn-v2-cal-tooltip__sym">${esc(sym)}</p>
      <p class="earn-v2-cal-tooltip__time">${esc(tile.dataset.tipTime || "—")}</p>
      <p class="earn-v2-cal-tooltip__move">Expected move ${esc(move)}</p>
      <p class="earn-v2-cal-tooltip__care">${esc(tile.dataset.tipCare || "")}</p>`;
    tip.hidden = false;
    const rect = tile.getBoundingClientRect();
    const tipW = 280;
    let left = rect.left + rect.width / 2 - tipW / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - tipW - 12));
    let top = rect.bottom + 8;
    if (top + 100 > window.innerHeight) top = rect.top - 8;
    tip.style.width = `${tipW}px`;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.style.transform = top < rect.top ? "translateY(-100%)" : "none";
  }

  function hide() {
    tip.hidden = true;
  }

  grid.addEventListener("mouseover", (e) => {
    const tile = e.target.closest(".earn-v2-cal-tile");
    if (tile) show(tile);
    else hide();
  });
  grid.addEventListener("mouseleave", hide);
}

function isCalendarTabActive() {
  const section = document.getElementById("earnCalTab");
  return section?.classList.contains("is-active");
}

function moveEarningSelection(delta) {
  const list = orderedVisibleEvents();
  if (!list.length) return;
  const ids = list.map(earnEventId);
  let idx = ids.indexOf(earnKbdFocusId || earnState.selectedId);
  if (idx < 0) idx = 0;
  idx = Math.max(0, Math.min(ids.length - 1, idx + delta));
  const ev = list[idx];
  earnKbdFocusId = earnEventId(ev);
  selectEarning(ev.sym, ev.dateKey || ev.day, ev.session, { animate: true });
  scrollTileIntoView(earnKbdFocusId);
}

function initKeyboard() {
  document.addEventListener("keydown", (e) => {
    if (!isCalendarTabActive()) return;
    if (e.target.matches("input, textarea, select")) return;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      moveEarningSelection(1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      moveEarningSelection(-1);
    } else if (e.key === "Enter") {
      const tile = document.querySelector(
        `.earn-v2-cal-tile[data-earn-id="${CSS.escape(earnKbdFocusId || earnState.selectedId || "")}"]`
      );
      if (tile && e.target.closest(".earn-v2-cal-tile") === tile) {
        e.preventDefault();
        selectEarning(tile.dataset.sym, tile.dataset.date, tile.dataset.session, { animate: true });
      }
    }
  });
}

function initClicks() {
  document.getElementById("earnCalTab")?.addEventListener("click", (e) => {
    const card = e.target.closest(".earn-v2-imp-card, .earn-v2-cal-tile");
    if (!card) return;
    selectEarning(card.dataset.sym, card.dataset.date, card.dataset.session, { animate: true });
  });

  document.getElementById("earnDetailHero")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const sym = btn.dataset.sym;
    if (btn.dataset.action === "deep-dive") openDeepDive(sym);
  });
}

function normalizeLiveEarning(e) {
  const sym = e.symbol;
  const meta = earnMeta(sym);
  const session = e.hour === "bmo" ? "bmo" : "amc";
  const day = formatEarnDay(e.date);
  return makeEarnEvent({
    sym,
    name: e.name || meta.name,
    session,
    day,
    dateKey: e.date,
    epsExp: e.epsEstimate != null ? `$${Number(e.epsEstimate).toFixed(2)}` : "—",
    revExp: fmtRevenue(e.revenueEstimate),
    iv: null,
    sector: meta.sector,
    source: "live",
    quarter: e.quarter ? `Q${e.quarter}` : "",
    year: e.year || "",
  });
}

function setLiveEarningsCalendar(rawCal) {
  const events = (rawCal || [])
    .filter((e) => e?.symbol && e?.date)
    .map(normalizeLiveEarning)
    .sort((a, b) => b.impact - a.impact);
  if (!events.length) return false;
  earnState.events = events;
  earnState.source = "live";
  earnState.selectedId = earnEventId(events[0]);
  earnUsesLiveData = true;
  initDataTrust();
  renderEarningsUI();
  return true;
}

export async function liveRefreshEarnings() {
  const api = window.BriefTickAPI;
  if (!api?.keys?.finnhub || typeof api.getEarningsCalendar !== "function") return false;
  try {
    const cal = await api.getEarningsCalendar();
    if (!cal?.length) return false;
    return setLiveEarningsCalendar(cal);
  } catch (e) {
    console.warn("[earnings] live refresh failed:", e);
    return false;
  }
}

let earningsMounted = false;

function initEarningsPage() {
  if (!document.getElementById("page-earnings")?.querySelector("#earnCalTab")) return;
  hydrateDemoEarnings();
  earnKbdFocusId = earnState.selectedId;
  initDataTrust();
  initTabs();
  initFilters();
  initClicks();
  initKeyboard();
  initCalTooltip();
  renderEarningsUI();
}

export function mountEarningsPage() {
  if (!earningsMounted) {
    earningsMounted = true;
    initEarningsPage();
  } else {
    renderEarningsUI();
  }
  liveRefreshEarnings().catch(() => {});
}

window.mountEarningsPage = mountEarningsPage;
window.liveRefreshEarnings = liveRefreshEarnings;
window.getImpact = getImpact;
window.openEarningWhy = openDeepDive;
