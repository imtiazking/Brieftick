/**
 * Live, touch-friendly chart interactions for Dashboard Intelligence Lab wheel modules.
 * @module preview/dashboard-intel-charts
 */

import { bindMovesNetwork } from "./dashboard-moves-network.js";
import {
  gaugeArcGeometry,
  GAUGE_VIX_MAX,
  GAUGE_VIX_MIN,
  moodZoneById,
  moodZoneFromVix,
  vixFromArcAngleRad,
  vixToRiskScorePercent,
} from "./market-mood.js";
import { getFlowIndustryDetail, renderFlowDetailContent } from "./flow-bubble-detail.js";

const PROBES = {
  volatility: {
    default: "Markets feel calm — investors are willing to hold stocks.",
  },
  flows: {
    default: {
      primary: "Technology attracts the largest share of capital today.",
      secondary: "Energy and Financials continue to participate while Defensives lag.",
    },
    technology: {
      primary: "Technology attracts the largest share of capital today.",
      secondary: "Mega-cap and AI leadership hold the centre of today's inflows.",
    },
    energy: {
      primary: "Energy takes the next-largest share of capital.",
      secondary: "Crude firmness keeps energy participating behind technology leadership.",
    },
    financials: {
      primary: "Financials continue to draw steady participation.",
      secondary: "Banks follow the growth trade without matching technology's concentration.",
    },
    industrials: {
      primary: "Industrials participate on growth days but trail the leaders.",
      secondary: "Cyclicals move with the tape without dominating flow.",
    },
    defensives: {
      primary: "Defensives lag the rest of the market.",
      secondary: "Quiet flow reflects a risk-on session favouring growth over defence.",
    },
  },
  signals: {
    default: "Technology is the dominant opportunity driver today.",
    "interest-rates": "Fed speakers and front-end yields are anchoring the rates narrative.",
    technology: "Mega-cap tech and options flow are concentrating today's opportunity.",
    "market-strength": "Breadth is weak — the average stock lags index leadership.",
    energy: "Energy follows crude and OPEC headlines — a rising secondary driver.",
  },
  correlation: {
    default: "Tap a name on the ring to explore market influence — the centre shows who is leading.",
    edge: (headline) => headline,
  },
  alerts: {
    default: "Tap a card to see what could move markets this week.",
  },
  session: {
    default: "Drag along the session — explore the tape.",
    scrub: (pct) =>
      pct < 33
        ? "Morning: tech bid builds, breadth lags."
        : pct < 66
          ? "Midday: energy joins leadership; defensives fade."
          : "Afternoon: indices hold gains; vol stays contained.",
  },
};

function setProbe(hero, text) {
  const scope = hero.closest(".rail-module--market-risk") || hero;
  const el =
    scope.querySelector("[data-mood-summary]") || hero.querySelector(".live-chart__probe");
  if (el && text) el.textContent = text;
}

function bindLiveGauge(hero) {
  const wrap = hero.querySelector(".live-gauge");
  if (!wrap) return;

  const needleLine = wrap.querySelector(".live-gauge__needle-line");
  const marker = wrap.querySelector(".live-gauge__marker");
  const valueEl = wrap.querySelector(".live-gauge__value");
  const moodLabelEl = wrap.querySelector("[data-mood-label]");
  const moodZoneEl = wrap.querySelector("[data-mood-zone]");
  const zoneLegend = wrap.querySelector("[data-zone-legend]");
  const confidenceEl = wrap.querySelector("[data-mood-confidence]");
  const zoneTipEl = wrap.querySelector("[data-zone-tip]");
  const hit = wrap.querySelector(".live-gauge__hit");
  if (!needleLine || !hit) return;

  const module = hero.closest(".rail-module--market-risk");
  const plainEl = module?.querySelector("[data-mood-plain]");
  const usuallyWrap = module?.querySelector("[data-mood-usually]");
  const investorsWrap = module?.querySelector("[data-mood-investors]");
  const whyList = module?.querySelector(".market-mood-why");

  const baseVix = Number(wrap.dataset.vix) || 12.2;
  let vix = baseVix;
  let previewZoneId = null;

  const setListContent = (wrapEl, items) => {
    if (!wrapEl) return;
    const ul = wrapEl.querySelector("ul");
    if (!ul) return;
    ul.innerHTML = "";
    for (const line of items) {
      const li = document.createElement("li");
      li.textContent = line;
      ul.appendChild(li);
    }
  };

  const render = () => {
    const geom = gaugeArcGeometry(vix);
    const m = moodZoneFromVix(vix);
    const riskPct = vixToRiskScorePercent(vix);
    needleLine.setAttribute("x2", String(geom.needleX2));
    needleLine.setAttribute("y2", String(geom.needleY2));
    if (marker) {
      marker.setAttribute("cx", String(geom.markerX));
      marker.setAttribute("cy", String(geom.markerY));
      marker.setAttribute("fill", m.color);
    }
    if (valueEl) valueEl.textContent = riskPct.toFixed(1);
    if (confidenceEl) confidenceEl.textContent = m.confidence;
    if (moodLabelEl) moodLabelEl.textContent = m.label;
    if (moodZoneEl) moodZoneEl.textContent = `Current Zone: ${m.label}`;
    if (zoneLegend) {
      zoneLegend.querySelectorAll(".live-gauge__zone-key").forEach((key) => {
        key.classList.toggle("is-active", key.dataset.zoneId === m.id);
      });
    }
    if (plainEl) plainEl.textContent = m.plainEnglish;
    setListContent(usuallyWrap, m.usuallyMeans);
    setListContent(investorsWrap, m.investorsDo);
    if (whyList) {
      whyList.innerHTML = "";
      for (const line of m.why) {
        const li = document.createElement("li");
        li.textContent = line;
        whyList.appendChild(li);
      }
    }
    if (!previewZoneId) {
      setProbe(hero, m.summary || m.probe || PROBES.volatility.default);
      if (zoneTipEl) zoneTipEl.hidden = true;
    }
    wrap.style.setProperty(
      "--gauge-fill",
      `${((vix - GAUGE_VIX_MIN) / (GAUGE_VIX_MAX - GAUGE_VIX_MIN)) * 100}%`
    );
    wrap.dataset.mood = m.id;
    if (module) module.dataset.mood = m.id;
    wrap.setAttribute("aria-valuenow", String(Math.round(riskPct)));
  };

  const showZonePreview = (zoneId) => {
    const z = moodZoneById(zoneId);
    if (!z) return;
    previewZoneId = zoneId;
    wrap.classList.add("is-zone-active");
    if (zoneLegend) {
      zoneLegend.querySelectorAll(".live-gauge__zone-key").forEach((key) => {
        key.classList.toggle("is-active", key.dataset.zoneId === zoneId);
        key.classList.toggle("is-preview", key.dataset.zoneId === zoneId);
      });
    }
    if (zoneTipEl) {
      zoneTipEl.textContent = `${z.label} — ${z.zoneTip}`;
      zoneTipEl.hidden = false;
    }
  };

  const clearZonePreview = () => {
    previewZoneId = null;
    wrap.classList.remove("is-zone-active");
    if (zoneLegend) {
      zoneLegend.querySelectorAll(".live-gauge__zone-key").forEach((key) => {
        key.classList.remove("is-preview");
      });
    }
    if (zoneTipEl) zoneTipEl.hidden = true;
    render();
  };

  const pointerToVix = (clientX, clientY) => {
    const rect = hit.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const ang = Math.atan2(clientY - cy, clientX - cx);
    vix = vixFromArcAngleRad(ang);
    render();
  };

  let dragging = false;
  const onDown = (e) => {
    e.preventDefault();
    dragging = true;
    wrap.classList.add("is-active");
    pointerToVix(e.clientX, e.clientY);
  };
  const onMove = (e) => {
    if (!dragging) return;
    pointerToVix(e.clientX, e.clientY);
  };
  const onUp = () => {
    dragging = false;
    wrap.classList.remove("is-active");
    if (document.activeElement === wrap) wrap.blur();
  };

  hit.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);

  const bindZoneTarget = (el) => {
    const zoneId = el.dataset.zoneId;
    if (!zoneId) return;
    const isLegendKey = el.classList.contains("live-gauge__zone-key");

    el.addEventListener("pointerenter", () => showZonePreview(zoneId));
    el.addEventListener("pointerleave", (e) => {
      if (e.relatedTarget?.closest?.(".live-gauge__zone, .live-gauge__zone-key")) return;
      clearZonePreview();
    });
    if (isLegendKey) {
      el.addEventListener("focus", () => showZonePreview(zoneId));
      el.addEventListener("blur", () => clearZonePreview());
    }
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      previewZoneId = null;
      vix = Number(el.dataset.zoneVix) || moodZoneById(zoneId).vixAnchor;
      wrap.classList.add("is-zone-active");
      render();
      wrap.classList.add("is-pulse");
      setTimeout(() => wrap.classList.remove("is-pulse"), 400);
    });
  };

  wrap.querySelectorAll("[data-zone-id]").forEach(bindZoneTarget);

  wrap.addEventListener("keydown", (e) => {
    const step = (GAUGE_VIX_MAX - GAUGE_VIX_MIN) / 40;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      vix = Math.max(GAUGE_VIX_MIN, vix - step);
      render();
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      vix = Math.min(GAUGE_VIX_MAX, vix + step);
      render();
    }
  });

  wrap.addEventListener("pointerenter", () => wrap.classList.add("is-zone-active"));
  wrap.addEventListener("pointerleave", (e) => {
    if (e.relatedTarget?.closest?.(".live-gauge")) return;
    wrap.classList.remove("is-zone-active");
    if (!dragging) clearZonePreview();
  });

  render();
}

const FLOW_CLUSTER_CENTER = { x: 50, y: 50 };

function setFlowStory(map, key) {
  const story = PROBES.flows[key] || PROBES.flows.default;
  const primary = map.querySelector(".flow-bubbles-hero__story-primary");
  const secondary = map.querySelector(".flow-bubbles-hero__story-secondary");
  if (primary && story.primary) primary.textContent = story.primary;
  if (secondary && story.secondary) secondary.textContent = story.secondary;
}

function bindFlowMap(hero) {
  const map = hero.querySelector(".flow-bubbles-hero");
  if (!map) return null;

  const cluster = map.querySelector(".flow-bubbles-hero__cluster");
  const stageHit = map.querySelector(".flow-bubbles-hero__stage-hit");
  const bubbleEls = [...map.querySelectorAll(".flow-bubble[data-flow-id]")];
  if (!cluster || !bubbleEls.length) return null;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const anchors = bubbleEls.map((el) => ({
    el,
    id: el.dataset.flowId,
    x: Number(el.dataset.anchorX) || FLOW_CLUSTER_CENTER.x,
    y: Number(el.dataset.anchorY) || FLOW_CLUSTER_CENTER.y,
  }));

  let spreadTimer = null;
  let settleTimer = null;
  let focusedId = null;

  const applyMotion = (states) => {
    anchors.forEach((a, i) => {
      const s = states[i] || { ox: 0, oy: 0, scale: 1 };
      a.el.style.setProperty("--ox", `${s.ox}px`);
      a.el.style.setProperty("--oy", `${s.oy}px`);
      a.el.style.setProperty("--scale", String(s.scale));
    });
  };

  const clusterBox = () => ({
    width: cluster.clientWidth,
    height: cluster.clientHeight,
  });

  /** Keep bubble centres (incl. halo bleed + drift) inside the cluster safe area. */
  const clampStatesToCluster = (states) => {
    const box = clusterBox();
    const pad = Math.max(14, Math.min(box.width, box.height) * 0.11);
    const haloFactor = 1.06;
    const driftPad = 6;

    return states.map((state, i) => {
      const anchor = anchors[i];
      let { ox, oy, scale } = state;
      const halfW = (anchor.el.offsetWidth * scale * haloFactor) / 2 + driftPad;
      const halfH = (anchor.el.offsetHeight * scale * haloFactor) / 2 + driftPad;
      let cx = (anchor.x / 100) * box.width + ox;
      let cy = (anchor.y / 100) * box.height + oy;

      if (cx - halfW < pad) ox += pad - (cx - halfW);
      if (cx + halfW > box.width - pad) ox -= cx + halfW - (box.width - pad);
      if (cy - halfH < pad) oy += pad - (cy - halfH);
      if (cy + halfH > box.height - pad) oy -= cy + halfH - (box.height - pad);

      return { ox, oy, scale };
    });
  };

  const detailPanel = map.querySelector("[data-flow-detail]");
  const detailBody = map.querySelector("[data-flow-detail-body]");
  const detailClose = map.querySelector("[data-flow-detail-close]");
  const coarsePointer = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  let detailPinned = false;

  const showDetail = (id) => {
    const detail = getFlowIndustryDetail(id);
    if (!detailPanel || !detailBody || !detail) return;
    detailBody.innerHTML = renderFlowDetailContent(detail);
    detailPanel.hidden = false;
    detailPanel.removeAttribute("aria-hidden");
    map.classList.add("has-flow-detail");
  };

  const hideDetail = () => {
    if (!detailPanel) return;
    detailPanel.hidden = true;
    detailPanel.setAttribute("aria-hidden", "true");
    map.classList.remove("has-flow-detail", "is-detail-pinned");
    detailPinned = false;
  };

  const restState = () => anchors.map(() => ({ ox: 0, oy: 0, scale: 1 }));

  const spreadState = () => {
    const box = clusterBox();
    const amount = reducedMotion ? 0 : 7;
    const states = anchors.map((a) => {
      const dx = a.x - FLOW_CLUSTER_CENTER.x;
      const dy = a.y - FLOW_CLUSTER_CENTER.y;
      const dist = Math.hypot(dx, dy) || 1;
      return {
        ox: ((dx / dist) * amount * box.width) / 100,
        oy: ((dy / dist) * amount * box.height) / 100,
        scale: 1,
      };
    });
    return clampStatesToCluster(states);
  };

  const setFocus = (id) => {
    focusedId = id;
    cluster.classList.add("has-focus");
    bubbleEls.forEach((b) => b.classList.toggle("is-focused", b.dataset.flowId === id));
    showDetail(id);
    if (!map.classList.contains("is-spreading")) {
      applyMotion(restState());
    }
    setFlowStory(map, id);
  };

  const clearFocus = () => {
    focusedId = null;
    cluster.classList.remove("has-focus");
    bubbleEls.forEach((b) => b.classList.remove("is-focused"));
    hideDetail();
    if (!map.classList.contains("is-spreading")) {
      applyMotion(restState());
    }
    setFlowStory(map, "default");
  };

  const triggerSpread = () => {
    if (reducedMotion) return;
    if (map.classList.contains("is-spreading")) return;

    map.classList.add("is-spreading");
    applyMotion(spreadState());

    clearTimeout(spreadTimer);
    clearTimeout(settleTimer);

    spreadTimer = setTimeout(() => {
      map.classList.remove("is-spreading");
      applyMotion(restState());
    }, 720);

    settleTimer = setTimeout(() => {
      if (!focusedId) applyMotion(restState());
    }, 1650);
  };

  const onStageActivate = (e) => {
    if (e.target.closest(".flow-bubble") || e.target.closest("[data-flow-detail]")) return;
    triggerSpread();
  };

  stageHit?.addEventListener("click", onStageActivate);
  cluster.addEventListener("click", onStageActivate);

  bubbleEls.forEach((bubble) => {
    const id = bubble.dataset.flowId;
    if (!id) return;

    bubble.addEventListener("click", (e) => {
      e.stopPropagation();
      if (coarsePointer) {
        if (focusedId === id && detailPinned) {
          clearFocus();
          map.classList.remove("is-spreading");
          return;
        }
        detailPinned = true;
        map.classList.add("is-detail-pinned");
      }
      setFocus(id);
      triggerSpread();
    });

    if (!coarsePointer) {
      bubble.addEventListener("pointerenter", () => {
        if (!map.classList.contains("is-spreading")) setFocus(id);
      });
    }

    bubble.addEventListener("focus", () => setFocus(id));
  });

  detailClose?.addEventListener("click", (e) => {
    e.stopPropagation();
    clearFocus();
    map.classList.remove("is-spreading");
  });

  detailPanel?.addEventListener("click", (e) => e.stopPropagation());

  map.addEventListener("pointerleave", (e) => {
    if (coarsePointer || detailPinned) return;
    if (e.relatedTarget && map.contains(e.relatedTarget)) return;
    clearFocus();
    map.classList.remove("is-spreading");
  });

  const onResize = () => {
    applyMotion(
      map.classList.contains("is-spreading")
        ? clampStatesToCluster(spreadState())
        : restState()
    );
  };
  window.addEventListener("resize", onResize);

  if (detailPanel) detailPanel.setAttribute("aria-hidden", "true");
  applyMotion(restState());
  setFlowStory(map, "default");

  return () => {
    clearTimeout(spreadTimer);
    clearTimeout(settleTimer);
    window.removeEventListener("resize", onResize);
  };
}

function bindSignalPulse(hero) {
  const pulse = hero.querySelector(".signal-pulse-hero");
  if (!pulse) return;

  const bars = pulse.querySelectorAll(".signal-bar");
  const leadName = pulse.querySelector(".signal-pulse-hero__lead-name");

  const activate = (bar) => {
    bars.forEach((b) => b.classList.toggle("is-active", b === bar));
    const key = (bar.dataset.signal || "").toLowerCase();
    const label = bar.querySelector(".signal-bar__label")?.textContent;
    if (leadName && label) leadName.textContent = label;
    setProbe(hero, PROBES.signals[key] || PROBES.signals.default);
  };

  bars.forEach((bar) => {
    bar.addEventListener("click", () => activate(bar));
    bar.addEventListener("pointerenter", () => {
      if (!pulse.classList.contains("is-touching")) activate(bar);
    });
  });

  pulse.addEventListener("pointerdown", () => pulse.classList.add("is-touching"));
  pulse.addEventListener("pointerup", () => pulse.classList.remove("is-touching"));

  const leader = pulse.querySelector(".signal-bar.is-leader") || bars[0];
  if (leader) activate(leader);
  else setProbe(hero, PROBES.signals.default);
}

function bindMovesTogether(hero) {
  return bindMovesNetwork(hero, {
    setProbe,
    probes: PROBES,
  });
}

function bindAlertsStack(hero) {
  const stack = hero.querySelector(".alerts-stack-hero");
  if (!stack) return;

  const items = stack.querySelectorAll(".alert-visual");

  const collapseExpand = (card) => {
    const toggle = card.querySelector(".alert-visual__toggle");
    const panel = card.querySelector(".alert-visual__expand");
    if (!toggle || !panel) return;
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "Learn more";
    panel.hidden = true;
  };

  const activate = (item) => {
    items.forEach((a) => {
      const on = a === item;
      a.classList.toggle("is-active", on);
      if (!on) collapseExpand(a);
    });
    const head = item.querySelector(".alert-visual__head");
    const why = item.querySelector(".alert-visual__why");
    if (head && why) {
      const whyText = why.textContent.replace(/^\s*Why it matters:\s*/i, "").trim();
      setProbe(hero, `${head.textContent} — ${whyText}`);
    } else {
      setProbe(hero, PROBES.alerts.default);
    }
  };

  items.forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".alert-visual__toggle")) return;
      activate(item);
    });
    item.addEventListener("keydown", (e) => {
      if (e.target.closest(".alert-visual__toggle")) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate(item);
      }
    });
  });

  stack.querySelectorAll(".alert-visual__toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = btn.closest(".alert-visual");
      const panel = card?.querySelector(".alert-visual__expand");
      if (!card || !panel) return;
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", open ? "false" : "true");
      panel.hidden = open;
      btn.textContent = open ? "Learn more" : "Hide";
      if (!open) activate(card);
    });
  });

  if (items[0]) activate(items[0]);
  else setProbe(hero, PROBES.alerts.default);
}

function bindSessionChart(hero) {
  const chart = hero.querySelector(".session-chart-hero");
  if (!chart) return;

  const path = chart.querySelector(".session-chart-hero__line");
  const dot = chart.querySelector(".session-chart-hero__dot");
  const scrub = chart.querySelector(".session-chart-hero__scrub");
  if (!path || !dot || !scrub) return;

  const len = path.getTotalLength();

  const move = (pct) => {
    const t = Math.max(0, Math.min(1, pct));
    const pt = path.getPointAtLength(t * len);
    dot.setAttribute("cx", pt.x);
    dot.setAttribute("cy", pt.y);
    setProbe(hero, PROBES.session.scrub(t * 100));
  };

  scrub.addEventListener("input", () => move(Number(scrub.value) / 100));
  path.addEventListener("click", (e) => {
    const rect = path.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    scrub.value = String(Math.round(pct * 100));
    move(pct);
  });

  let t = 0;
  let raf = 0;
  const drift = () => {
    t += 0.0025;
    if (t > 1) t = 0;
    if (!chart.classList.contains("is-scrubbing")) {
      scrub.value = String(Math.round(t * 100));
      move(t);
    }
    raf = requestAnimationFrame(drift);
  };

  scrub.addEventListener("pointerdown", () => chart.classList.add("is-scrubbing"));
  scrub.addEventListener("pointerup", () => chart.classList.remove("is-scrubbing"));
  drift();

  chart._sessionRaf = raf;
}

function bindSectorLive(hero, scope) {
  const grid = hero.querySelector(".sector-grid");
  if (!grid) return;
  grid.classList.add("sector-grid--live");
  const probe = (scope || hero).querySelector(".sector-probe");
  if (probe) probe.textContent = "Explore sector leadership on the heatmap.";
}

/** Attach motion + exploration handlers after module HTML is mounted. */
export function bindInteractiveCharts(root, moduleId) {
  const scope = root || document;
  const hero = scope.querySelector(".intel-hero");
  if (!hero) return;

  if (scope._chartTeardown) {
    scope._chartTeardown();
    scope._chartTeardown = null;
  }

  switch (moduleId) {
    case "volatility":
      bindLiveGauge(hero);
      break;
    case "flows": {
      const stopFlow = bindFlowMap(hero);
      scope._chartTeardown = () => stopFlow?.();
      break;
    }
    case "signals":
      bindSignalPulse(hero);
      break;
    case "correlation": {
      const stopMoves = bindMovesTogether(hero);
      scope._chartTeardown = () => stopMoves?.();
      break;
    }
    case "alerts":
      bindAlertsStack(hero);
      break;
    case "session":
      bindSessionChart(hero);
      scope._chartTeardown = () => {
        const chart = hero.querySelector(".session-chart-hero");
        if (chart?._sessionRaf) cancelAnimationFrame(chart._sessionRaf);
      };
      break;
    case "heatmap":
      bindSectorLive(hero, scope);
      break;
    default:
      break;
  }
}
