/**
 * Logic · Concept 27 Helix environment (orbital entities + nucleus sync).
 */
const LOGIC_HELIX_SYMBOLS = ["VIX", "SPY", "NVDA", "AAPL"];

const LOGIC_HELIX_FALLBACK = {
  VIX: "-3.10%",
  SPY: "+0.48%",
  NVDA: "-1.24%",
  AAPL: "+0.82%",
};

/** Four atmospheric orbit entities max */
const LOGIC_HELIX_RINGS = [
  {
    id: "macro",
    radius: "min(50vmin, 460px)",
    dur: 300,
    rev: true,
    depth: "far",
    symbols: ["VIX", "SPY"],
  },
  {
    id: "mega",
    radius: "min(42vmin, 400px)",
    dur: 260,
    rev: false,
    depth: "near",
    symbols: ["NVDA", "AAPL"],
  },
];

let helixBuilt = false;
let helixFocusTimer = null;
let helixQuoteTimer = null;

function fillLogicRiver() {
  const el = document.getElementById("logicEnvRiver");
  if (!el) return;
  const track = document.getElementById("ticker");
  if (track?.innerHTML?.trim()) {
    const chunk = track.innerHTML;
    el.innerHTML = chunk + chunk;
    return;
  }
  const fallback =
    "BRIEFTICK · LOGIC · MACRO · EQUITIES · VOL · FLOW · BRIEFTICK · LOGIC · MACRO · EQUITIES · VOL · FLOW · ";
  el.textContent = fallback.repeat(4);
}

function quoteFromTicker(sym) {
  const items = document.querySelectorAll("#ticker .ticker-item");
  for (const item of items) {
    const label = item.querySelector(".sym")?.textContent?.trim();
    if (label !== sym) continue;
    const spans = item.querySelectorAll("span");
    const chg = spans[2]?.textContent?.trim();
    if (!chg || chg === "…") return null;
    const cls = spans[2]?.className || "";
    const up = cls.includes("up") || chg.startsWith("+");
    const dn = cls.includes("dn") || chg.startsWith("-");
    return { chg, up, dn };
  }
  return null;
}

function chgClass(chg) {
  if (!chg || chg === "—") return "flat";
  if (chg.startsWith("+")) return "up";
  if (chg.startsWith("-")) return "dn";
  return "flat";
}

function updateOrbitCtx() {
  const el = document.getElementById("logicOrbitCtx");
  if (!el) return;
  el.textContent = `ALSO IN ORBIT · ${LOGIC_HELIX_SYMBOLS.join(" · ")}`;
}

function syncNucleusFromEntity(entityEl) {
  const symEl = document.getElementById("logicNucleusSymbol");
  const chgEl = document.getElementById("logicNucleusChg");
  const nucleus = document.getElementById("logicNucleus");
  const surface = document.getElementById("logicResultSurface");
  if (!symEl || !surface || surface.classList.contains("is-ready") || surface.classList.contains("is-processing")) {
    return;
  }

  if (!entityEl) {
    symEl.textContent = "LOGIC";
    if (chgEl) {
      chgEl.textContent = "";
      chgEl.className = "logic-nucleus__chg";
      chgEl.setAttribute("aria-hidden", "true");
    }
    nucleus?.classList.remove("has-spotlight");
    return;
  }

  const sym = entityEl.dataset.sym;
  const chgNode = entityEl.querySelector(".logic-helix__chg");
  const chg = chgNode?.textContent?.trim() || LOGIC_HELIX_FALLBACK[sym] || "";
  const cls = chgNode?.classList.contains("up")
    ? "up"
    : chgNode?.classList.contains("dn")
      ? "dn"
      : chgClass(chg);

  symEl.textContent = sym;
  if (chgEl && chg) {
    chgEl.textContent = chg;
    chgEl.className = `logic-nucleus__chg ${cls}`;
    chgEl.removeAttribute("aria-hidden");
  }
  nucleus?.classList.add("has-spotlight");

  const idle = document.getElementById("logicResultIdle");
  if (idle && !surface.classList.contains("is-ready")) {
    idle.textContent = helixIdleCopy(sym);
  }
}

function helixIdleCopy(sym) {
  const copy = {
    VIX: "Volatility compressing into macro event window; implied vol decline signals calmer near-term risk pricing.",
    SPY: "Broad market holding selective risk-on tone; breadth mixed with megacap carrying the index.",
    NVDA: "Semiconductor leadership under pressure as growth trades reprice; AI capex narrative remains intact.",
    AAPL: "Defensive megacap bid intact; modest outperformance vs semis reflects quality rotation within tech.",
  };
  return copy[sym] || "Ask Logic at the nucleus — institutional intelligence for what moves markets.";
}

function entityMarkup(sym, angle, radius, depth, delay, ringId) {
  const live = quoteFromTicker(sym);
  const chg = live?.chg || LOGIC_HELIX_FALLBACK[sym] || "—";
  const cls = live ? (live.up ? "up" : live.dn ? "dn" : chgClass(chg)) : chgClass(chg);
  return `<div class="logic-helix__slot" style="--slot-angle:${angle}deg;--orbit-radius:${radius}">
    <div class="logic-helix__entity logic-helix__entity--${depth}" data-sym="${sym}" data-ring="${ringId}"
      style="--slot-angle:${angle}deg;--entity-delay:${delay}s" aria-hidden="true">
      <span class="logic-helix__sym">${sym}</span>
      <span class="logic-helix__chg ${cls}">${chg}</span>
    </div>
  </div>`;
}

function buildLogicHelix() {
  const root = document.getElementById("logicHelix");
  if (!root || helixBuilt) return;

  const tracks = LOGIC_HELIX_RINGS.map(
    (ring) =>
      `<div class="logic-helix__track" data-ring="${ring.id}" style="width:${ring.radius};height:${ring.radius}"></div>`
  ).join("");

  const orbits = LOGIC_HELIX_RINGS.map((ring) => {
    const n = ring.symbols.length;
    const slots = ring.symbols.map((sym, i) => {
      const angle = (i / n) * 360 + (ring.id === "macro" ? 24 : 8);
      return entityMarkup(sym, angle, ring.radius, ring.depth, i * 0.8, ring.id);
    }).join("");
    const rev = ring.rev ? " logic-helix__orbit--rev" : "";
    return `<div class="logic-helix__orbit${rev}" data-ring="${ring.id}" style="--orbit-dur:${ring.dur}s">${slots}</div>`;
  }).join("");

  root.innerHTML = `<div class="logic-helix__stage">
    <div class="logic-helix__anchor">
      ${tracks}
      <div class="logic-helix__pulse-ring"></div>
      ${orbits}
    </div>
  </div>`;

  helixBuilt = true;
  updateOrbitCtx();
  refreshHelixQuotes();
  startHelixFocus();
  watchNucleusState();
}

function refreshHelixQuotes() {
  document.querySelectorAll(".logic-helix__entity[data-sym]").forEach((el) => {
    const sym = el.dataset.sym;
    const live = quoteFromTicker(sym);
    const chgEl = el.querySelector(".logic-helix__chg");
    if (!chgEl) return;
    const chg = live?.chg || LOGIC_HELIX_FALLBACK[sym] || "—";
    chgEl.textContent = chg;
    chgEl.className = `logic-helix__chg ${live ? (live.up ? "up" : live.dn ? "dn" : chgClass(chg)) : chgClass(chg)}`;
  });

  const spotlight = document.querySelector(".logic-helix__entity.is-spotlight");
  if (spotlight) syncNucleusFromEntity(spotlight);
}

function startHelixFocus() {
  stopHelixFocus();
  const env = document.querySelector("#page-logic .logic-env");
  const entities = () => document.querySelectorAll(".logic-helix__entity[data-sym]");
  if (!env || !entities().length) return;

  function shiftFocus() {
    const list = [...entities()];
    if (!list.length) return;

    const surface = document.getElementById("logicResultSurface");
    if (surface?.classList.contains("is-ready") || surface?.classList.contains("is-processing")) {
      helixFocusTimer = window.setTimeout(shiftFocus, 8000);
      return;
    }

    env.classList.add("logic-env--focus");
    list.forEach((el) => el.classList.remove("is-spotlight", "is-dim"));

    const pick = list[Math.floor(Math.random() * list.length)];
    const ringId = pick.dataset.ring;
    pick.classList.add("is-spotlight");
    list.forEach((el) => {
      if (el !== pick) el.classList.add("is-dim");
    });

    env.querySelectorAll(".logic-helix__track").forEach((t) => {
      t.classList.toggle("is-near", t.dataset.ring === ringId);
    });

    syncNucleusFromEntity(pick);

    const clearMs = 4800 + Math.random() * 2400;
    helixFocusTimer = window.setTimeout(() => {
      env.classList.remove("logic-env--focus");
      list.forEach((el) => el.classList.remove("is-spotlight", "is-dim"));
      env.querySelectorAll(".logic-helix__track").forEach((t) => t.classList.remove("is-near"));
      syncNucleusFromEntity(null);
      helixFocusTimer = window.setTimeout(shiftFocus, 5500 + Math.random() * 3500);
    }, clearMs);
  }

  helixFocusTimer = window.setTimeout(shiftFocus, 5000);
}

function stopHelixFocus() {
  if (helixFocusTimer) {
    clearTimeout(helixFocusTimer);
    helixFocusTimer = null;
  }
  const env = document.querySelector("#page-logic .logic-env");
  if (env) env.classList.remove("logic-env--focus");
  syncNucleusFromEntity(null);
}

function watchNucleusState() {
  const surface = document.getElementById("logicResultSurface");
  const nucleus = document.getElementById("logicNucleus");
  if (!surface || surface.__logicNucleusObs) return;

  const obs = new MutationObserver(() => {
    const busy = surface.classList.contains("is-ready") || surface.classList.contains("is-processing");
    nucleus?.classList.toggle("has-answer", busy);
    if (busy) {
      document.getElementById("logicNucleusSymbol")?.setAttribute("hidden", "");
      document.getElementById("logicNucleusChg")?.setAttribute("hidden", "");
    } else {
      document.getElementById("logicNucleusSymbol")?.removeAttribute("hidden");
      document.getElementById("logicNucleusChg")?.removeAttribute("hidden");
    }
  });
  obs.observe(surface, { attributes: true, attributeFilter: ["class"] });
  surface.__logicNucleusObs = obs;
}

function onLogicRoute() {
  fillLogicRiver();
  buildLogicHelix();
  refreshHelixQuotes();
}

function init() {
  fillLogicRiver();
  updateOrbitCtx();
  const track = document.getElementById("ticker");
  if (track) {
    new MutationObserver(() => {
      fillLogicRiver();
      if (helixBuilt) refreshHelixQuotes();
    }).observe(track, { childList: true, subtree: true });
  }
  window.addEventListener("load", () => {
    fillLogicRiver();
    setTimeout(() => {
      fillLogicRiver();
      if (document.getElementById("page-logic")?.classList.contains("active")) onLogicRoute();
    }, 2500);
  });

  helixQuoteTimer = window.setInterval(() => {
    if (helixBuilt && document.getElementById("page-logic")?.classList.contains("active")) {
      refreshHelixQuotes();
    }
  }, 12000);
}

const baseOnRoute = window.BrieftickSplitTheme?.onRoute;
if (window.BrieftickSplitTheme) {
  window.BrieftickSplitTheme.onRoute = function logicEnvOnRoute(name) {
    if (baseOnRoute) baseOnRoute(name);
    if (name === "logic") onLogicRoute();
    else stopHelixFocus();
  };
}

if (document.getElementById("page-logic")?.classList.contains("active")) {
  buildLogicHelix();
}

init();
