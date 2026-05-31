/**
 * Live, touch-friendly chart interactions for Dashboard Intelligence Lab wheel modules.
 * @module preview/dashboard-intel-charts
 */

import { bindMovesNetwork } from "./dashboard-moves-network.js";

const PROBES = {
  volatility: {
    default: "Volatility is calm — constructive for equities.",
    low: "Low vol · investors are comfortable holding risk.",
    mid: "Normal range · event risk priced, not panic.",
    high: "Elevated · hedging demand is picking up.",
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
    default: "Tap the priority stack — one story at a time.",
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
  const el = hero.querySelector(".live-chart__probe");
  if (el && text) el.textContent = text;
}

function bindLiveGauge(hero) {
  const wrap = hero.querySelector(".live-gauge");
  if (!wrap) return;

  const needle = wrap.querySelector(".live-gauge__needle");
  const valueEl = wrap.querySelector(".live-gauge__value");
  const stateEl = wrap.querySelector(".live-gauge__state");
  const hit = wrap.querySelector(".live-gauge__hit");
  if (!needle || !hit) return;

  const baseVix = Number(wrap.dataset.vix) || 14.2;
  let vix = baseVix;

  const vixToAngle = (v) => {
    const t = Math.max(10, Math.min(32, v));
    return -72 + ((t - 10) / 22) * 144;
  };

  const angleToVix = (deg) => {
    const t = (deg + 72) / 144;
    return 10 + t * 22;
  };

  const mood = (v) => {
    if (v < 13) return { state: "Low · Complacent", probe: PROBES.volatility.low };
    if (v < 18) return { state: "Normal · Constructive", probe: PROBES.volatility.mid };
    return { state: "Elevated · Cautious", probe: PROBES.volatility.high };
  };

  const render = () => {
    const deg = vixToAngle(vix);
    needle.setAttribute("transform", `rotate(${deg} 100 100)`);
    if (valueEl) valueEl.textContent = vix.toFixed(1);
    const m = mood(vix);
    if (stateEl) stateEl.textContent = m.state;
    setProbe(hero, m.probe);
    wrap.style.setProperty("--gauge-fill", `${((vix - 10) / 22) * 100}%`);
  };

  const pointerToVix = (clientX, clientY) => {
    const rect = hit.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.bottom - 4;
    const ang = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
    const clamped = Math.max(-72, Math.min(72, ang));
    vix = angleToVix(clamped);
    render();
  };

  let dragging = false;
  const onDown = (e) => {
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
  };

  hit.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);

  wrap.querySelectorAll("[data-zone]").forEach((zone) => {
    zone.addEventListener("click", () => {
      vix = Number(zone.dataset.zone);
      render();
      wrap.classList.add("is-pulse");
      setTimeout(() => wrap.classList.remove("is-pulse"), 400);
    });
  });

  render();
}

const FLOW_CLUSTER_CENTER = { x: 50, y: 52 };

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

  const restState = () => anchors.map(() => ({ ox: 0, oy: 0, scale: 1 }));

  const spreadState = () => {
    const rect = cluster.getBoundingClientRect();
    const amount = reducedMotion ? 0 : 13;
    return anchors.map((a) => {
      const dx = a.x - FLOW_CLUSTER_CENTER.x;
      const dy = a.y - FLOW_CLUSTER_CENTER.y;
      const dist = Math.hypot(dx, dy) || 1;
      return {
        ox: ((dx / dist) * amount * rect.width) / 100,
        oy: ((dy / dist) * amount * rect.height) / 100,
        scale: 1,
      };
    });
  };

  const focusState = (focusId) => {
    const focus = anchors.find((a) => a.id === focusId);
    if (!focus || reducedMotion) return restState();
    const fr = focus.el.getBoundingClientRect();
    const fcx = fr.left + fr.width / 2;
    const fcy = fr.top + fr.height / 2;
    return anchors.map((a) => {
      if (a.id === focusId) return { ox: 0, oy: 0, scale: 1.08 };
      const r = a.el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - fcx;
      const dy = r.top + r.height / 2 - fcy;
      const dist = Math.hypot(dx, dy) || 1;
      const push = Math.min(18, 6 + 110 / dist);
      return { ox: (dx / dist) * push, oy: (dy / dist) * push, scale: 0.94 };
    });
  };

  const setFocus = (id) => {
    focusedId = id;
    cluster.classList.add("has-focus");
    bubbleEls.forEach((b) => b.classList.toggle("is-focused", b.dataset.flowId === id));
    applyMotion(focusState(id));
    setFlowStory(map, id);
  };

  const clearFocus = () => {
    focusedId = null;
    cluster.classList.remove("has-focus");
    bubbleEls.forEach((b) => b.classList.remove("is-focused"));
    applyMotion(restState());
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
      applyMotion(focusedId ? focusState(focusedId) : restState());
    }, 720);

    settleTimer = setTimeout(() => {
      if (!focusedId) applyMotion(restState());
    }, 1650);
  };

  const onStageActivate = () => triggerSpread();

  stageHit?.addEventListener("click", onStageActivate);
  cluster.addEventListener("click", onStageActivate);

  bubbleEls.forEach((bubble) => {
    bubble.addEventListener("click", (e) => {
      e.stopPropagation();
      setFocus(bubble.dataset.flowId);
      triggerSpread();
    });
    bubble.addEventListener("pointerenter", () => {
      if (!map.classList.contains("is-spreading")) setFocus(bubble.dataset.flowId);
    });
    bubble.addEventListener("focus", () => setFocus(bubble.dataset.flowId));
  });

  map.addEventListener("pointerleave", () => {
    clearFocus();
    map.classList.remove("is-spreading");
  });

  applyMotion(restState());
  setFlowStory(map, "default");

  return () => {
    clearTimeout(spreadTimer);
    clearTimeout(settleTimer);
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
  bindMovesNetwork(hero, {
    setProbe,
    probes: PROBES,
  });
}

function bindAlertsStack(hero) {
  const stack = hero.querySelector(".alerts-stack-hero");
  if (!stack) return;

  const items = stack.querySelectorAll(".alert-visual");
  const activate = (item) => {
    items.forEach((a) => a.classList.toggle("is-active", a === item));
    const head = item.querySelector(".alert-visual__head");
    setProbe(hero, head ? head.textContent : PROBES.alerts.default);
  };

  items.forEach((item) => item.addEventListener("click", () => activate(item)));
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
    case "correlation":
      bindMovesTogether(hero);
      break;
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
