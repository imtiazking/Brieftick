/**
 * Market Reaction Map — scoped for Ticker Deep Dive (no window globals).
 * @module preview/ticker-deep-dive/wim-contagion
 */

import { getContagionPeers } from "./wim-data.js";

const COLORS = { neg: "#ff5b6e", pos: "#3ddc97", neu: "#ffb547" };

const REACTION_GROUPS = {
  semis: ["NVDA", "AMD", "AVGO", "MU", "SOXX", "TSM", "INTC", "QCOM", "SNDK", "WDC", "STX"],
  megacap: ["AAPL", "MSFT", "META", "GOOGL", "AMZN", "QQQ", "SPY"],
  autos: ["TSLA", "F", "GM", "LCID", "RIVN", "NIO", "STLA", "TM", "HMC", "XLY"],
  media: ["NFLX", "DIS", "CMCSA", "PARA", "WBD", "SPOT", "SNAP", "PINS"],
  energy: ["XLE", "XOM", "CVX", "COP", "SLB", "EOG", "USO"],
  financials: ["JPM", "BAC", "XLF"],
};

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function peerMove(pSym, seedSym, quoteCache) {
  const q = quoteCache?.[pSym];
  if (q && !Number.isNaN(q.pctChange)) return q.pctChange;
  const h = pSym.split("").reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, seedSym.charCodeAt(0));
  return (h % 700) / 100 - 3.5;
}

function reactionGroup(sym) {
  for (const [group, symbols] of Object.entries(REACTION_GROUPS)) {
    if (symbols.includes(sym)) return group;
  }
  return "market";
}

function reactionDetail(source, target, move) {
  const sourceGroup = reactionGroup(source);
  const targetGroup = reactionGroup(target);
  const sameGroup = sourceGroup === targetGroup && sourceGroup !== "market";
  const absMove = Math.abs(move);
  const strength = Math.min(98, Math.round(42 + absMove * 10 + (sameGroup ? 18 : 6)));
  const confidence = Math.min(96, Math.round(strength - 4 + (sameGroup ? 6 : 0)));
  const tone = move >= 0.4 ? "pos" : move <= -0.4 ? "neg" : "neu";
  const labels = {
    semis: "AI infrastructure / semiconductors",
    megacap: "mega-cap growth basket",
    autos: "EV and auto demand chain",
    media: "digital media / streaming complex",
    energy: "energy and crude-linked equities",
    financials: "banks and rate-sensitive financials",
    market: "broad market beta",
  };
  const label = sameGroup
    ? labels[sourceGroup]
    : `${labels[sourceGroup] || "source"} to ${labels[targetGroup] || "market"}`;
  let relation = sameGroup ? "Direct sympathy move" : "Cross-asset read-through";
  if (["QQQ", "SPY", "SOXX", "XLE", "XLY"].includes(target)) relation = "ETF basket transmission";
  if (source === "SPY" || source === "QQQ") relation = "Index-level pressure";
  const direction = tone === "pos" ? "positive" : tone === "neg" ? "negative" : "mixed";
  const copy = sameGroup
    ? `${target} sits in the same ${label} cluster as ${source}. A move in ${source} can force basket, ETF and factor traders to reprice nearby names, so the expected reaction is ${direction}.`
    : `${target} is linked to ${source} through ${label}. This is a second-order reaction: useful for context, but weaker than a direct single-stock catalyst.`;
  return { source, target, move, tone, relation, label, strength, confidence, copy };
}

function pulseMarkup(color, move) {
  const impact = Math.min(Math.abs(Number(move) || 0) / 3.5, 1);
  const maxR = (26 + impact * 7).toFixed(1);
  const startOpacity = (0.12 + impact * 0.18).toFixed(2);
  const dur = (3.2 - impact * 1.1).toFixed(2);
  return `<circle class="peer-pulse" r="23" fill="none" stroke="${color}" stroke-width="1" stroke-opacity="${startOpacity}">
    <animate attributeName="r" values="23;${maxR};23" dur="${dur}s" repeatCount="indefinite"/>
    <animate attributeName="stroke-opacity" values="${startOpacity};0;${startOpacity}" dur="${dur}s" repeatCount="indefinite"/>
  </circle>`;
}

/**
 * @param {HTMLElement} root — contains .tdd-contagion__trail, svg, .tdd-contagion__detail
 * @param {{ quoteCache?: Record<string, { pctChange: number }>, onSymbolChange?: (sym: string) => void }} [opts]
 */
export function createContagionMap(root, opts = {}) {
  const trailEl = root.querySelector(".tdd-contagion__trail");
  const svg = root.querySelector(".tdd-contagion__svg");
  const detailEl = root.querySelector(".tdd-contagion__detail");
  let trail = [];
  let current = null;
  let quoteCache = opts.quoteCache || {};

  const centerColor = (move) =>
    move >= 0.4 ? COLORS.pos : move <= -0.4 ? COLORS.neg : COLORS.neu;

  function renderDetail(detail, mode = "hover") {
    if (!detailEl || !detail) return;
    if (mode === "source") {
      const peers = getContagionPeers(detail.source || current || "NVDA");
      detailEl.innerHTML = `
        <div class="reaction-detail-kicker">Current source</div>
        <div class="reaction-detail-title">${esc(detail.source)} reaction chain</div>
        <div class="reaction-detail-copy">${esc(detail.source)} is the center of this map. Nearby nodes show likely sympathy, ETF and factor read-throughs. Click any node to follow the next ripple.</div>
        <span class="reaction-chip neu">${peers.length} linked nodes</span>`;
      return;
    }
    const modeLabel = mode === "selected" ? "Selected link" : "Hover insight";
    detailEl.innerHTML = `
      <div class="reaction-detail-kicker">${modeLabel}</div>
      <div class="reaction-detail-title">${esc(detail.source)} → ${esc(detail.target)}</div>
      <div class="reaction-detail-copy">${esc(detail.copy)}</div>
      <span class="reaction-chip ${detail.tone}">${esc(detail.relation)}</span>
      <div class="reaction-detail-grid">
        <div class="reaction-metric"><div class="lbl">Impact</div><div class="val">${detail.move >= 0 ? "+" : ""}${detail.move.toFixed(2)}%</div></div>
        <div class="reaction-metric"><div class="lbl">Confidence</div><div class="val">${detail.confidence}%</div></div>
        <div class="reaction-metric"><div class="lbl">Strength</div><div class="val">${detail.strength}/100</div></div>
      </div>`;
  }

  function renderTrail() {
    if (!trailEl) return;
    if (trail.length <= 1) {
      trailEl.innerHTML = "";
      return;
    }
    const parts = [`<span class="contagion-trail-label">Trail</span>`];
    trail.forEach((s, i) => {
      const isCurrent = i === trail.length - 1;
      parts.push(
        isCurrent
          ? `<span class="contagion-trail-item current">${esc(s)}</span>`
          : `<button type="button" class="contagion-trail-item" data-trail-idx="${i}">${esc(s)}</button>`
      );
      if (!isCurrent) parts.push(`<span class="contagion-trail-sep">→</span>`);
    });
    trailEl.innerHTML = parts.join("");
  }

  function draw(sym, resetTrail = false) {
    if (!svg) return;
    const key = String(sym || "NVDA").toUpperCase();
    if (resetTrail || !current) {
      trail = [key];
    } else if (trail[trail.length - 1] !== key) {
      trail.push(key);
    }
    current = key;
    const peers = getContagionPeers(key);
    const cx = 240;
    const cy = 190;
    const R = 130;
    const centerMove = peerMove(key, key, quoteCache);
    const cc = centerColor(centerMove);

    let edges = "";
    let nodes = "";
    peers.forEach((pSym, i) => {
      const ang = -Math.PI / 2 + (i / peers.length) * Math.PI * 2;
      const x = cx + Math.cos(ang) * R;
      const y = cy + Math.sin(ang) * R;
      const move = peerMove(pSym, key, quoteCache);
      const tone = move >= 0.4 ? "pos" : move <= -0.4 ? "neg" : "neu";
      const c = COLORS[tone];
      const movePct = move.toFixed(2);
      const width = 1 + Math.min(Math.abs(move) / 3, 2);
      edges += `<line data-symbol="${esc(pSym)}" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${c}" stroke-opacity="0.35" stroke-width="${width}" stroke-dasharray="${tone === "neu" ? "3 3" : "5 2"}"/>`;
      nodes += `<g class="peer-node" data-symbol="${esc(pSym)}" data-move="${movePct}" transform="translate(${x},${y})" tabindex="0" role="button">
        ${pulseMarkup(c, move)}
        <circle r="22" fill="rgba(10,13,20,0.95)" stroke="${c}" stroke-width="1.5"/>
        <text x="0" y="-2" text-anchor="middle" fill="#e8ecf5" font-family="JetBrains Mono" font-size="10" font-weight="500" style="pointer-events:none">${esc(pSym)}</text>
        <text x="0" y="10" text-anchor="middle" fill="${c}" font-family="JetBrains Mono" font-size="9" style="pointer-events:none">${move >= 0 ? "+" : ""}${movePct}%</text>
      </g>`;
    });

    svg.innerHTML = `
      <defs>
        <radialGradient id="tddCenterG"><stop offset="0%" stop-color="${cc}" stop-opacity="0.4"/><stop offset="100%" stop-color="${cc}" stop-opacity="0"/></radialGradient>
      </defs>
      <circle cx="${cx}" cy="${cy}" r="60" fill="url(#tddCenterG)"/>
      ${edges}
      ${nodes}
      <g transform="translate(${cx},${cy})">
        <circle r="34" fill="rgba(10,13,20,0.95)" stroke="${cc}" stroke-width="2"/>
        <text x="0" y="-2" text-anchor="middle" fill="#e8ecf5" font-family="Playfair Display" font-size="14" font-weight="500">${esc(key)}</text>
        <text x="0" y="13" text-anchor="middle" fill="${cc}" font-family="JetBrains Mono" font-size="9">SOURCE</text>
      </g>`;
    svg.dataset.source = key;
    renderTrail();
    renderDetail({ source: key }, "source");
  }

  root.addEventListener("click", (e) => {
    const trailBtn = e.target.closest("[data-trail-idx]");
    if (trailBtn) {
      const idx = Number(trailBtn.dataset.trailIdx);
      trail = trail.slice(0, idx + 1);
      draw(trail[trail.length - 1], false);
      return;
    }
    const peer = e.target.closest(".peer-node[data-symbol]");
    if (peer && svg) {
      const pSym = peer.dataset.symbol;
      const move = parseFloat(peer.dataset.move || "0");
      renderDetail(reactionDetail(current, pSym, move), "selected");
      draw(pSym, false);
      opts.onSymbolChange?.(pSym);
    }
  });

  root.addEventListener(
    "pointerover",
    (e) => {
      const peer = e.target.closest?.(".peer-node[data-symbol]");
      if (!peer || !current) return;
      const move = parseFloat(peer.dataset.move || "0");
      renderDetail(reactionDetail(current, peer.dataset.symbol, move), "hover");
    },
    true
  );

  return {
    setQuoteCache(cache) {
      quoteCache = cache || {};
    },
    mount(sym) {
      draw(String(sym || "NVDA").toUpperCase(), true);
    },
    getCurrent() {
      return current;
    },
  };
}
