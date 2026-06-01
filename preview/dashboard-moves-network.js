/**
 * Moves Together — interactive influence ring (preview / design lab).
 * @module preview/dashboard-moves-network
 */

const VB = 400;
const CX = 200;
const CY = 200;
const R_OUTER = 158;
const R_INNER = 118;
const R_NODE = 148;
const GAP_DEG = 7;

const SEGMENT_COLORS = [
  "rgba(78, 120, 200, 0.72)",
  "rgba(100, 140, 215, 0.68)",
  "rgba(130, 155, 230, 0.65)",
  "rgba(165, 175, 245, 0.62)",
  "rgba(120, 150, 220, 0.68)",
  "rgba(90, 125, 205, 0.7)",
];

/** @type {Record<string, { sym: string, name: string }>} */
const TICKERS = {
  nvda: { sym: "NVDA", name: "NVIDIA" },
  amd: { sym: "AMD", name: "AMD" },
  tsm: { sym: "TSM", name: "TSMC" },
  soxx: { sym: "SOXX", name: "Semis ETF" },
  avgo: { sym: "AVGO", name: "Broadcom" },
  smci: { sym: "SMCI", name: "Super Micro" },
  aapl: { sym: "AAPL", name: "Apple" },
  msft: { sym: "MSFT", name: "Microsoft" },
  meta: { sym: "META", name: "Meta" },
  amzn: { sym: "AMZN", name: "Amazon" },
  tsla: { sym: "TSLA", name: "Tesla" },
  qqq: { sym: "QQQ", name: "Nasdaq" },
  spy: { sym: "SPY", name: "S&P 500" },
  iwm: { sym: "IWM", name: "Russell" },
  pltr: { sym: "PLTR", name: "Palantir" },
  snow: { sym: "SNOW", name: "Snowflake" },
  aiq: { sym: "AIQ", name: "AI ETF" },
  goog: { sym: "GOOG", name: "Alphabet" },
  nflx: { sym: "NFLX", name: "Netflix" },
  orcl: { sym: "ORCL", name: "Oracle" },
  intc: { sym: "INTC", name: "Intel" },
  coin: { sym: "COIN", name: "Coinbase" },
};

/** Company-name aliases for search (preview catalog). */
const SEARCH_ALIASES = {
  nvda: ["nvidia"],
  aapl: ["apple"],
  msft: ["microsoft"],
  meta: ["facebook"],
  amzn: ["amazon"],
  tsla: ["tesla"],
  goog: ["google", "alphabet"],
  pltr: ["palantir"],
  snow: ["snowflake"],
  spy: ["s&p", "sp500", "s and p"],
  qqq: ["nasdaq 100", "nasdaq100"],
  soxx: ["semiconductor", "semis"],
  tsm: ["tsmc", "taiwan semi"],
  avgo: ["broadcom"],
  smci: ["super micro", "supermicro"],
};

const MODAL_EXAMPLE_IDS = ["nvda", "aapl", "msft", "tsla", "pltr", "meta", "amzn", "spy", "qqq"];

/** @type {{ id: string, sym: string, name: string, haystack: string }[]} */
let SEARCH_INDEX = null;

function buildSearchIndex() {
  SEARCH_INDEX = Object.entries(TICKERS).map(([id, t]) => {
    const aliases = SEARCH_ALIASES[id] || [];
    return {
      id,
      sym: t.sym,
      name: t.name,
      haystack: [id, t.sym.toLowerCase(), t.name.toLowerCase(), ...aliases].join(" "),
    };
  });
  return SEARCH_INDEX;
}

function getSearchIndex() {
  return SEARCH_INDEX || buildSearchIndex();
}

function searchStocks(query, limit = 8) {
  const index = getSearchIndex();
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) {
    return MODAL_EXAMPLE_IDS.map((id) => index.find((r) => r.id === id)).filter(Boolean).slice(0, limit);
  }

  const scored = index
    .map((row) => {
      const sym = row.sym.toLowerCase();
      const name = row.name.toLowerCase();
      let score = 0;
      if (sym === q || row.id === q) score = 100;
      else if (sym.startsWith(q)) score = 80;
      else if (name.startsWith(q)) score = 70;
      else if (row.haystack.includes(q)) score = 50;
      else if (q.length >= 3 && row.haystack.split(" ").some((w) => w.startsWith(q))) score = 40;
      return { row, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.row.sym.localeCompare(b.row.sym));

  return scored.slice(0, limit).map((x) => x.row);
}

/**
 * Who moves with whom when each name is the leader (preview intelligence).
 * @type {Record<string, { ring: string[], narrative: string, peerNote: Record<string, string> }>}
 */
const INFLUENCE_MAP = {
  nvda: {
    ring: ["amd", "tsm", "soxx", "avgo", "qqq", "smci"],
    narrative: "NVIDIA is leading the AI complex — chips, semis, and growth indices are reacting.",
    peerNote: {
      amd: "AMD often follows when NVIDIA sets the tone for AI chips.",
      tsm: "TSMC tracks demand flowing through the AI supply chain.",
      soxx: "The semiconductor basket moves with chip leadership.",
      avgo: "Broadcom is swept up in the same semiconductor wave.",
      qqq: "Nasdaq feels the pull when mega-cap AI leads.",
      smci: "AI infrastructure names join when NVIDIA runs.",
    },
  },
  aapl: {
    ring: ["msft", "meta", "amzn", "qqq", "nvda", "spy"],
    narrative: "Apple is currently influencing large-cap technology sentiment.",
    peerNote: {
      msft: "Microsoft moves with the platform and cloud peer group.",
      meta: "Meta tags along when mega-cap consumer tech leads.",
      amzn: "Amazon shares the same risk-on growth bucket.",
      qqq: "Nasdaq drifts with the largest index constituents.",
      nvda: "NVIDIA still echoes when Apple steers tech tone.",
      spy: "The broad market nudges when Apple is in focus.",
    },
  },
  msft: {
    ring: ["aapl", "meta", "amzn", "qqq", "nvda", "spy"],
    narrative: "Microsoft is steering cloud and platform sentiment across mega-cap tech.",
    peerNote: {
      aapl: "Apple and Microsoft often rhyme on macro tech days.",
      meta: "Meta rises with the same advertising and AI capex story.",
      amzn: "Amazon cloud and retail tech move in tandem.",
      qqq: "Nasdaq follows its largest weights.",
      nvda: "AI leadership still bleeds into the platform trade.",
      spy: "The index leans when Microsoft leads.",
    },
  },
  tsla: {
    ring: ["qqq", "nvda", "amd", "spy", "iwm", "smci"],
    narrative: "Tesla is pulling high-beta growth and EV-adjacent risk appetite.",
    peerNote: {
      qqq: "Nasdaq volatility rises when Tesla is in motion.",
      nvda: "AI and auto-tech sentiment can overlap on risk days.",
      amd: "Chips can tag along on growth-led sessions.",
      spy: "The index feels Tesla's weight on risk-on days.",
      iwm: "Small caps react to the same risk switch.",
      smci: "High-beta infra names join the move.",
    },
  },
  spy: {
    ring: ["qqq", "iwm", "aapl", "msft", "nvda", "soxx"],
    narrative: "The S&P 500 is setting the tone — breadth and mega-caps are following.",
    peerNote: {
      qqq: "Nasdaq aligns when the index leads.",
      iwm: "Russell shows whether breadth confirms.",
      aapl: "Apple moves with index risk appetite.",
      msft: "Microsoft tracks index leadership.",
      nvda: "NVIDIA still amplifies when the tape is risk-on.",
      soxx: "Semis confirm when growth leads the index.",
    },
  },
  pltr: {
    ring: ["msft", "snow", "aiq", "qqq", "nvda", "amd"],
    narrative: "Palantir is currently influencing AI software sentiment.",
    peerNote: {
      msft: "Microsoft cloud and platform names rhyme with AI software leadership.",
      snow: "Snowflake tracks the same data and AI infrastructure narrative.",
      aiq: "The AI ETF confirms sector-wide follow-through.",
      qqq: "Nasdaq growth lifts when AI software leads.",
      nvda: "Chip leadership still echoes in the AI stack.",
      amd: "Semis can tag along on AI risk-on days.",
    },
  },
};

const DEFAULT_RING_POOL = ["qqq", "spy", "msft", "aapl", "nvda", "meta", "amzn", "amd"];

const SESSION_DEFAULT_LEADER = "nvda";
const SESSION_LEADER_KEY = "brieftick.movesTogether.leader";
const SESSION_WATCH_KEY = "brieftick.movesTogether.watch";

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ensureInfluenceProfile(leaderId) {
  if (INFLUENCE_MAP[leaderId]) return INFLUENCE_MAP[leaderId];
  const t = TICKERS[leaderId];
  if (!t) return INFLUENCE_MAP[SESSION_DEFAULT_LEADER];

  const ring = DEFAULT_RING_POOL.filter((id) => id !== leaderId && TICKERS[id]).slice(0, 6);
  const profile = {
    ring,
    narrative: `${t.name} is currently influencing sentiment across related names on your radar.`,
    peerNote: Object.fromEntries(
      ring.map((pid) => [
        pid,
        `${TICKERS[pid]?.sym || pid.toUpperCase()} often moves when ${t.sym} leads.`,
      ])
    ),
  };
  INFLUENCE_MAP[leaderId] = profile;
  return profile;
}

function getLeaderConfig(leaderId) {
  return ensureInfluenceProfile(leaderId);
}

function getRingPeerIds(leaderId) {
  const cfg = getLeaderConfig(leaderId);
  return cfg.ring.filter((id) => id !== leaderId && TICKERS[id]).slice(0, 6);
}

function polar(deg, r = R_NODE) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function segmentPath(index, count) {
  const segDeg = 360 / count - GAP_DEG;
  const start = index * (segDeg + GAP_DEG) + GAP_DEG / 2;
  const end = start + segDeg;
  const toRad = (d) => ((d - 90) * Math.PI) / 180;
  const large = segDeg > 180 ? 1 : 0;

  const o1 = { x: CX + R_OUTER * Math.cos(toRad(start)), y: CY + R_OUTER * Math.sin(toRad(start)) };
  const o2 = { x: CX + R_OUTER * Math.cos(toRad(end)), y: CY + R_OUTER * Math.sin(toRad(end)) };
  const i2 = { x: CX + R_INNER * Math.cos(toRad(end)), y: CY + R_INNER * Math.sin(toRad(end)) };
  const i1 = { x: CX + R_INNER * Math.cos(toRad(start)), y: CY + R_INNER * Math.sin(toRad(start)) };

  return { d: `M ${o1.x} ${o1.y} A ${R_OUTER} ${R_OUTER} 0 ${large} 1 ${o2.x} ${o2.y} L ${i2.x} ${i2.y} A ${R_INNER} ${R_INNER} 0 ${large} 0 ${i1.x} ${i1.y} Z`, mid: start + segDeg / 2 };
}

function buildRingModel(leaderId) {
  const peers = getRingPeerIds(leaderId);
  const count = peers.length;
  const segDeg = 360 / count - GAP_DEG;

  const nodes = peers.map((id, i) => ({
    id,
    sym: TICKERS[id].sym,
    name: TICKERS[id].name,
    angle: i * (segDeg + GAP_DEG) + GAP_DEG / 2 + segDeg / 2,
    note: getLeaderConfig(leaderId).peerNote[id] || `${TICKERS[id].sym} is reacting.`,
  }));

  return { leaderId, leader: TICKERS[leaderId] || TICKERS[SESSION_DEFAULT_LEADER], peers: nodes, narrative: getLeaderConfig(leaderId).narrative, count };
}

function renderDialSvg(model) {
  const { peers, count } = model;

  const segments = peers
    .map((node, i) => {
      const { d } = segmentPath(i, count);
      const color = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
      return `<path
        class="moves-ring__segment"
        data-segment="${node.id}"
        d="${d}"
        fill="${color}"
        style="--seg-i:${i}"
      />`;
    })
    .join("");

  const glows = peers
    .map((node, i) => {
      const { d } = segmentPath(i, count);
      return `<path class="moves-ring__segment-glow" data-segment="${node.id}" d="${d}" style="--seg-i:${i}" />`;
    })
    .join("");

  return `<svg class="moves-ring__svg" viewBox="0 0 ${VB} ${VB}" aria-hidden="true">
    <defs>
      <radialGradient id="movesRingCore" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.14)"/>
        <stop offset="50%" stop-color="rgba(120,150,220,0.06)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
      </radialGradient>
      <filter id="movesRingBloom" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="4" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="movesSoftGlow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="8" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <g class="moves-ring__dial">
      <circle class="moves-ring__perimeter" cx="${CX}" cy="${CY}" r="172" fill="none"/>
      <circle class="moves-ring__flow-track" cx="${CX}" cy="${CY}" r="${(R_OUTER + R_INNER) / 2}" fill="none" pathLength="100"/>
      <circle class="moves-ring__flow-glow" cx="${CX}" cy="${CY}" r="${(R_OUTER + R_INNER) / 2}" fill="none" pathLength="100"/>
      ${glows}
      ${segments}
    </g>
    <circle class="moves-ring__core-halo" cx="${CX}" cy="${CY}" r="56" fill="url(#movesRingCore)"/>
    <circle class="moves-ring__core-pulse" cx="${CX}" cy="${CY}" r="40" fill="none"/>
  </svg>`;
}

function renderNodesHtml(model, focusId) {
  return model.peers
    .map((node) => {
      const p = polar(node.angle);
      const active = node.id === focusId ? " is-active" : "";
      return `<button
        type="button"
        class="moves-ring__node${active}"
        data-node="${node.id}"
        data-sym="${escapeHtml(node.sym)}"
        style="left:${(p.x / VB) * 100}%;top:${(p.y / VB) * 100}%"
        aria-label="Set ${escapeHtml(node.sym)} as market leader"
      >
        <span class="moves-ring__node-halo" aria-hidden="true"></span>
        <span class="moves-ring__node-sym">${escapeHtml(node.sym)}</span>
      </button>`;
    })
    .join("");
}

function renderExampleChips() {
  return MODAL_EXAMPLE_IDS.map((id) => {
    const t = TICKERS[id];
    if (!t) return "";
    return `<button type="button" class="moves-stock-modal__chip" data-pick="${id}">${escapeHtml(t.sym)}</button>`;
  }).join("");
}

function renderAddStockModal() {
  return `<div class="moves-stock-modal" data-modal="add-stock" hidden aria-hidden="true">
    <div class="moves-stock-modal__backdrop" data-action="close-add-stock" tabindex="-1"></div>
    <div class="moves-stock-modal__panel" role="dialog" aria-modal="true" aria-labelledby="moves-add-stock-title">
      <header class="moves-stock-modal__head">
        <h2 class="moves-stock-modal__title" id="moves-add-stock-title">Add Stock</h2>
        <button type="button" class="moves-stock-modal__close" data-action="close-add-stock" aria-label="Close dialog">×</button>
      </header>
      <label class="moves-stock-modal__search-wrap">
        <span class="visually-hidden">Search ticker or company name</span>
        <input
          type="search"
          class="moves-stock-modal__input"
          autocomplete="off"
          spellcheck="false"
          placeholder="e.g. AAPL, TSLA, NVDA"
        />
      </label>
      <p class="moves-stock-modal__error" role="alert" hidden></p>
      <button type="button" class="moves-stock-modal__submit">Add to Moves Together</button>
      <ul class="moves-stock-modal__list" role="listbox" aria-label="Search results"></ul>
      <p class="moves-stock-modal__examples-label">Examples</p>
      <div class="moves-stock-modal__examples">${renderExampleChips()}</div>
    </div>
  </div>`;
}

export function renderMovesNetworkHero() {
  const model = buildRingModel(SESSION_DEFAULT_LEADER);
  return `<div class="live-chart moves-ring-hero" data-leader="${SESSION_DEFAULT_LEADER}" aria-label="Moves Together — market influence explorer">
    <button type="button" class="moves-ring__add-stock" data-action="open-add-stock" aria-haspopup="dialog">
      <span class="moves-ring__add-stock-icon" aria-hidden="true">+</span>
      <span class="moves-ring__add-stock-label">Add Stock</span>
    </button>
    ${renderAddStockModal()}
    <div class="moves-ring__env" aria-hidden="true">
      <span class="moves-ring__vignette"></span>
      <span class="moves-ring__bloom"></span>
    </div>

    <div class="moves-ring__stage">
      <div class="moves-ring__spin">
        <div class="moves-ring__dial-mount">${renderDialSvg(model)}</div>
        <div class="moves-ring__nodes-mount">${renderNodesHtml(model, model.peers[0]?.id)}</div>
      </div>
      <button type="button" class="moves-ring__core" data-action="reset-leader" aria-label="Reset to session leader">
        <span class="moves-ring__core-kicker">Market leader</span>
        <span class="moves-ring__core-sym">${escapeHtml(model.leader.sym)}</span>
      </button>
    </div>

    <p class="moves-ring__insight">
      <span class="moves-ring__insight-lead"></span>
      <span class="moves-ring__insight-sub"></span>
    </p>

    <div class="moves-ring__watch" data-moves-watch hidden aria-label="Your Moves Together watch group">
      <span class="moves-ring__watch-label">Your group</span>
      <div class="moves-ring__watch-chips" data-moves-watch-chips></div>
    </div>

    <p class="live-chart__hint">Tap a name on the ring to explore who it influences</p>
    <p class="live-chart__probe" aria-live="polite"></p>
  </div>`;
}

function paintNarrative(chart, model, focusId) {
  const leadEl = chart.querySelector(".moves-ring__insight-lead");
  const subEl = chart.querySelector(".moves-ring__insight-sub");
  const coreSym = chart.querySelector(".moves-ring__core-sym");
  const coreKicker = chart.querySelector(".moves-ring__core-kicker");

  if (coreSym) coreSym.textContent = model.leader.sym;
  if (coreKicker) {
    coreKicker.textContent =
      model.leaderId === SESSION_DEFAULT_LEADER ? "Today's leader" : "Selected leader";
  }
  if (leadEl) leadEl.textContent = `${model.leader.sym} is leading.`;
  if (subEl) {
    const peer = model.peers.find((p) => p.id === focusId);
    subEl.textContent = peer ? ` ${peer.note}` : ` ${model.narrative}`;
  }
}

function highlightPeer(chart, focusId) {
  chart.querySelectorAll(".moves-ring__node").forEach((n) => {
    const on = n.dataset.node === focusId;
    n.classList.toggle("is-active", on);
    n.classList.toggle("is-dim", !on);
  });
  chart.querySelectorAll(".moves-ring__segment, .moves-ring__segment-glow").forEach((el) => {
    const on = el.dataset.segment === focusId;
    el.classList.toggle("is-active", on);
    el.classList.toggle("is-dim", !on);
  });
}

/** @param {HTMLElement} chart */
function setChartModel(chart, model) {
  chart.__movesModel = model;
}

function loadWatchSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_WATCH_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.filter((id) => TICKERS[id]) : [];
  } catch {
    return [];
  }
}

function saveWatchSession(ids) {
  try {
    sessionStorage.setItem(SESSION_WATCH_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    /* preview-only */
  }
}

function loadSessionLeader() {
  try {
    const saved = sessionStorage.getItem(SESSION_LEADER_KEY);
    return saved && TICKERS[saved] ? saved : null;
  } catch {
    return null;
  }
}

function persistSessionLeader(leaderId) {
  if (!TICKERS[leaderId]) return;
  try {
    sessionStorage.setItem(SESSION_LEADER_KEY, leaderId);
  } catch {
    /* preview-only */
  }
}

function addToWatchSession(leaderId) {
  if (!TICKERS[leaderId]) return;
  const next = loadWatchSession();
  if (!next.includes(leaderId)) next.push(leaderId);
  saveWatchSession(next);
}

/** @param {HTMLElement} chart */
function renderWatchGroup(chart) {
  const wrap = chart.querySelector("[data-moves-watch]");
  const chips = chart.querySelector("[data-moves-watch-chips]");
  if (!wrap || !chips) return;

  const ids = loadWatchSession();
  if (!ids.length) {
    wrap.hidden = true;
    chips.innerHTML = "";
    return;
  }

  wrap.hidden = false;
  chips.innerHTML = ids
    .map((id) => {
      const t = TICKERS[id];
      const active = chart.dataset.leader === id ? " is-active" : "";
      return `<button type="button" class="moves-ring__watch-chip${active}" data-watch-id="${id}">${escapeHtml(t.sym)}</button>`;
    })
    .join("");
}

function resolveTickerId(raw) {
  const q = String(raw || "")
    .trim()
    .toLowerCase();
  if (!q) return null;
  if (TICKERS[q]) return q;
  const match = Object.entries(TICKERS).find(([, t]) => t.sym.toLowerCase() === q);
  return match ? match[0] : null;
}

/** @param {HTMLElement} chart */
function portalMovesModal(chart) {
  const modal = chart.querySelector(".moves-stock-modal");
  if (!modal) return null;
  chart.__movesModalEl = modal;
  if (modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }
  return modal;
}

function applyLeader(chart, leaderId, hooks, focusId) {
  if (!TICKERS[leaderId]) return;
  const model = buildRingModel(leaderId);
  const focus = focusId || model.peers[0]?.id;

  chart.dataset.leader = leaderId;
  persistSessionLeader(leaderId);
  addToWatchSession(leaderId);
  renderWatchGroup(chart);
  chart.classList.add("is-reconfiguring");
  setChartModel(chart, model);

  const dialMount = chart.querySelector(".moves-ring__dial-mount");
  const nodesMount = chart.querySelector(".moves-ring__nodes-mount");
  if (dialMount) dialMount.innerHTML = renderDialSvg(model);
  if (nodesMount) nodesMount.innerHTML = renderNodesHtml(model, focus);

  paintNarrative(chart, model, focus);
  highlightPeer(chart, focus);

  requestAnimationFrame(() => chart.classList.remove("is-reconfiguring"));

  hooks?.setProbe(chart, model.narrative);
}

function selectStockFromSearch(chart, leaderId, hooks) {
  if (!TICKERS[leaderId]) return;
  ensureInfluenceProfile(leaderId);
  applyLeader(chart, leaderId, hooks);
}

function renderSearchResults(listEl, results, activeIndex) {
  if (!listEl) return;
  if (!results.length) {
    listEl.innerHTML = `<li class="moves-stock-modal__empty" role="presentation">No matches — try a ticker or company name</li>`;
    return;
  }
  listEl.innerHTML = results
    .map((row, i) => {
      const active = i === activeIndex ? " is-active" : "";
      return `<li role="presentation">
        <button type="button" class="moves-stock-modal__option${active}" role="option" data-pick="${row.id}" aria-selected="${i === activeIndex}">
          <span class="moves-stock-modal__option-sym">${escapeHtml(row.sym)}</span>
          <span class="moves-stock-modal__option-name">${escapeHtml(row.name)}</span>
        </button>
      </li>`;
    })
    .join("");
}

function openAddStockModal(chart) {
  const modal = portalMovesModal(chart) || chart.__movesModalEl;
  if (!modal) return;

  const input = modal.querySelector(".moves-stock-modal__input");
  const list = modal.querySelector(".moves-stock-modal__list");
  const error = modal.querySelector(".moves-stock-modal__error");
  if (!input || !list) return;

  if (error) {
    error.textContent = "";
    error.hidden = true;
  }

  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => modal.classList.add("is-open"));

  input.value = "";
  chart.__movesSearchActive = 0;
  renderSearchResults(list, searchStocks(""), 0);
  input.focus();
}

function closeAddStockModal(chart) {
  const modal = chart.__movesModalEl;
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  const onEnd = () => {
    modal.hidden = true;
    modal.removeEventListener("transitionend", onEnd);
  };
  modal.addEventListener("transitionend", onEnd);
  setTimeout(() => {
    if (!modal.classList.contains("is-open")) modal.hidden = true;
  }, 320);
}

function bindAddStockModal(chart, hooks) {
  if (chart.dataset.movesAddBound === "1") return;

  const modal = portalMovesModal(chart);
  const input = modal?.querySelector(".moves-stock-modal__input");
  const list = modal?.querySelector(".moves-stock-modal__list");
  const error = modal?.querySelector(".moves-stock-modal__error");
  const submit = modal?.querySelector(".moves-stock-modal__submit");
  if (!modal || !input || !list) return;

  chart.dataset.movesAddBound = "1";

  let debounce = 0;

  const showError = (message) => {
    if (!error) return;
    if (message) {
      error.textContent = message;
      error.hidden = false;
    } else {
      error.textContent = "";
      error.hidden = true;
    }
  };

  const refreshList = () => {
    const results = searchStocks(input.value);
    chart.__movesSearchResults = results;
    chart.__movesSearchActive = Math.min(chart.__movesSearchActive ?? 0, Math.max(0, results.length - 1));
    renderSearchResults(list, results, chart.__movesSearchActive);
    if (input.value.trim()) showError("");
  };

  const pick = (id) => {
    if (!id || !TICKERS[id]) return;
    showError("");
    closeAddStockModal(chart);
    selectStockFromSearch(chart, id, hooks);
  };

  const submitFromInput = () => {
    const raw = input.value.trim();
    if (!raw) {
      showError("Enter a ticker symbol to add a stock.");
      return;
    }
    const id = resolveTickerId(raw);
    if (!id) {
      showError(`"${raw.toUpperCase()}" isn't in our preview list — try AAPL, TSLA, or NVDA.`);
      return;
    }
    pick(id);
  };

  const openBtn = chart.querySelector("[data-action=open-add-stock]");
  openBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openAddStockModal(chart);
  });

  modal.querySelectorAll("[data-action=close-add-stock]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      closeAddStockModal(chart);
    });
  });

  submit?.addEventListener("click", (e) => {
    e.preventDefault();
    submitFromInput();
  });

  input.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      chart.__movesSearchActive = 0;
      refreshList();
    }, 60);
  });

  input.addEventListener("keydown", (e) => {
    const results = chart.__movesSearchResults || [];
    if (e.key === "Escape") {
      e.preventDefault();
      closeAddStockModal(chart);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      chart.__movesSearchActive = Math.min((chart.__movesSearchActive ?? 0) + 1, results.length - 1);
      renderSearchResults(list, results, chart.__movesSearchActive);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      chart.__movesSearchActive = Math.max((chart.__movesSearchActive ?? 0) - 1, 0);
      renderSearchResults(list, results, chart.__movesSearchActive);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const row = results[chart.__movesSearchActive ?? 0];
      const typed = resolveTickerId(input.value);
      if (row && (!typed || row.id === typed || row.sym.toLowerCase() === input.value.trim().toLowerCase())) {
        pick(row.id);
      } else {
        submitFromInput();
      }
    }
  });

  list.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pick]");
    if (btn?.dataset.pick) pick(btn.dataset.pick);
  });

  modal.querySelector(".moves-stock-modal__examples")?.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-pick]");
    if (chip?.dataset.pick) pick(chip.dataset.pick);
  });

  chart.__movesEscapeHandler = (e) => {
    if (e.key !== "Escape" || !modal.classList.contains("is-open")) return;
    closeAddStockModal(chart);
  };
  document.addEventListener("keydown", chart.__movesEscapeHandler);
}

function ensureRingDelegates(chart, hooks) {
  if (chart.dataset.movesBound === "1") return;
  chart.dataset.movesBound = "1";

  chart.addEventListener("click", (e) => {
    if (e.target.closest("[data-action=open-add-stock]")) return;
    const watch = e.target.closest("[data-watch-id]");
    if (watch?.dataset.watchId) {
      applyLeader(chart, watch.dataset.watchId, hooks);
      return;
    }
    const node = e.target.closest(".moves-ring__node");
    if (node?.dataset.node) {
      applyLeader(chart, node.dataset.node, hooks);
      return;
    }
    const seg = e.target.closest(".moves-ring__segment");
    if (seg?.dataset.segment) applyLeader(chart, seg.dataset.segment, hooks);
  });

  chart.addEventListener("mouseover", (e) => {
    const node = e.target.closest(".moves-ring__node");
    if (!node?.dataset.node) return;
    const model = chart.__movesModel;
    if (!model) return;
    highlightPeer(chart, node.dataset.node);
    const peer = model.peers.find((p) => p.id === node.dataset.node);
    const subEl = chart.querySelector(".moves-ring__insight-sub");
    if (subEl && peer) subEl.textContent = ` ${peer.note}`;
  });

}

/** @param {HTMLElement} [hero] */
export function destroyMovesNetwork(hero) {
  const chart = hero?.querySelector?.(".moves-ring-hero");
  if (!chart) return;

  if (chart.__movesEscapeHandler) {
    document.removeEventListener("keydown", chart.__movesEscapeHandler);
    delete chart.__movesEscapeHandler;
  }

  const modal = chart.__movesModalEl;
  if (modal) {
    modal.classList.remove("is-open");
    modal.hidden = true;
    modal.remove();
    delete chart.__movesModalEl;
  }

  delete chart.dataset.movesAddBound;
  delete chart.dataset.movesBound;
}

/**
 * @param {HTMLElement} hero
 * @param {{ setProbe: (root: HTMLElement, text: string) => void, probes: { correlation: { default: string, edge: (h: string) => string } } }} hooks
 * @returns {() => void}
 */
export function bindMovesNetwork(hero, hooks) {
  const chart = hero.querySelector(".moves-ring-hero");
  if (!chart) return () => {};

  buildSearchIndex();
  ensureRingDelegates(chart, hooks);
  bindAddStockModal(chart, hooks);

  chart.querySelector("[data-action=reset-leader]")?.addEventListener("click", () => {
    applyLeader(chart, SESSION_DEFAULT_LEADER, hooks);
  });

  const leaderId = loadSessionLeader() || chart.dataset.leader || SESSION_DEFAULT_LEADER;
  applyLeader(chart, leaderId, hooks);

  hooks.setProbe(hero, hooks.probes.correlation.default);

  return () => destroyMovesNetwork(hero);
}
