/**
 * Movers channel — premium list + intelligence story (preview / design lab).
 * @module preview/dashboard-movers-intel
 */

import { openTickerDeepDive } from "./ticker-deep-dive/ticker-deep-dive.js";
import { buildMoversContext } from "./ticker-deep-dive/deep-dive-context.js";

/** @type {Record<string, { lead: string, why: string }>} */
const MOVER_STORIES = {
  NVDA: {
    lead: "AI infrastructure demand continues to support semiconductor leadership.",
    why: "NVDA remains the strongest signal in the AI trade.",
  },
  AMD: {
    lead: "Chip names are giving back gains as investors rotate within semiconductors.",
    why: "AMD shows where profit-taking meets still-intact AI enthusiasm.",
  },
  XOM: {
    lead: "Firm crude underpins energy majors as the tape rewards commodity exposure.",
    why: "XOM reflects energy participation when growth and inflation narratives align.",
  },
  META: {
    lead: "Mega-cap platforms are pausing after a strong run in advertising and AI capex.",
    why: "META marks where sentiment cools without breaking the broader tech bid.",
  },
  TSLA: {
    lead: "High-beta growth is softening as the market prices delivery and margin noise.",
    why: "TSLA is the clearest read on risk appetite outside pure AI leadership.",
  },
  JPM: {
    lead: "Banks are steady as rates stabilise and credit spreads stay contained.",
    why: "JPM signals financials are participating without leading the session.",
  },
  CVX: {
    lead: "Integrated oils follow crude with quiet inflows rather than aggressive chasing.",
    why: "CVX complements the energy complex when breadth is selective.",
  },
  AAPL: {
    lead: "Apple is holding firm as a quality anchor within mega-cap technology.",
    why: "AAPL shows defensive growth still has a bid on risk-on days.",
  },
  MSFT: {
    lead: "Platform software is drifting as investors fine-tune AI monetisation timelines.",
    why: "MSFT matters because cloud and AI narratives still anchor the index.",
  },
  AVGO: {
    lead: "Semiconductor equipment and networking names are easing after recent strength.",
    why: "AVGO tracks the AI supply chain when leadership narrows.",
  },
};

const DEFAULT_STORY = MOVER_STORIES.NVDA;

/**
 * @param {string} sym
 */
export function getMoverStoryForSymbol(sym) {
  return MOVER_STORIES[String(sym || "").toUpperCase()] || DEFAULT_STORY;
}

/**
 * @param {HTMLElement} root
 */
export function bindMoversIntel(root) {
  const wrap = root.querySelector(".movers-intel");
  if (!wrap) return;

  const rows = [...wrap.querySelectorAll(".mover-row[data-mover-sym]")];
  const story = wrap.querySelector(".movers-intel__story");
  const heroSym = wrap.querySelector(".movers-intel__hero-sym");
  const heroChg = wrap.querySelector(".movers-intel__hero-chg");
  const heroSpark = wrap.querySelector(".movers-intel__hero-spark");
  const leadEl = wrap.querySelector(".movers-intel__lead");
  const whyEl = wrap.querySelector(".movers-intel__why-text");

  if (!rows.length || !story) return;

  const setActive = (row) => {
    const sym = row.dataset.moverSym || "";
    const narrative = getMoverStoryForSymbol(sym);

    rows.forEach((r) => {
      const on = r === row;
      r.classList.toggle("is-active", on);
      r.setAttribute("aria-selected", on ? "true" : "false");
      const rowLine = r.querySelector(".mover-row__spark-line");
      if (rowLine) {
        rowLine.classList.remove("is-drawn");
        if (on) requestAnimationFrame(() => rowLine.classList.add("is-drawn"));
      }
    });
    wrap.classList.add("has-focus");
    wrap.dataset.activeSym = sym;

    if (heroSym) heroSym.textContent = sym;
    if (heroChg) {
      heroChg.textContent = row.dataset.moverChg || "";
      heroChg.className = `movers-intel__hero-chg movers-intel__hero-chg--${row.dataset.moverDir || "flat"}`;
    }
    if (heroSpark) {
      const rowSpark = row.querySelector(".mover-row__spark");
      if (rowSpark) {
        heroSpark.innerHTML = rowSpark.outerHTML;
        const line = heroSpark.querySelector(".mover-row__spark-line");
        if (line) {
          line.classList.remove("is-drawn");
          requestAnimationFrame(() => line.classList.add("is-drawn"));
        }
      }
    }
    if (leadEl) leadEl.textContent = narrative.lead;
    if (whyEl) whyEl.textContent = narrative.why;

    story.classList.remove("is-visible");
    requestAnimationFrame(() => {
      story.classList.add("is-visible");
    });
  };

  rows.forEach((row) => {
    row.addEventListener("pointerenter", () => setActive(row));
    row.addEventListener("focus", () => setActive(row));
    row.addEventListener("click", () => setActive(row));
  });

  wrap.addEventListener("pointerleave", () => {
    wrap.classList.remove("has-focus");
  });

  const storyInner = wrap.querySelector(".movers-intel__story-inner");
  if (storyInner && !storyInner.querySelector(".movers-intel__deep-dive")) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "movers-intel__deep-dive";
    btn.textContent = "Ticker Deep Dive";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sym = wrap.dataset.activeSym || rows[0]?.dataset.moverSym || "NVDA";
      const row = rows.find((r) => r.dataset.moverSym === sym) || rows[0];
      const story = getMoverStoryForSymbol(sym);
      openTickerDeepDive({
        symbol: sym,
        source: "movers",
        context: buildMoversContext({
          symbol: sym,
          lead: story.lead,
          why: story.why,
          chg: row?.dataset.moverChg || "",
        }),
      });
    });
    storyInner.appendChild(btn);
  }

  rows.forEach((row) => {
    row.addEventListener("dblclick", (e) => {
      e.preventDefault();
      const sym = row.dataset.moverSym;
      if (sym) {
        const story = getMoverStoryForSymbol(sym);
        openTickerDeepDive({
          symbol: sym,
          source: "movers",
          context: buildMoversContext({
            symbol: sym,
            lead: story.lead,
            why: story.why,
            chg: row.dataset.moverChg || "",
          }),
        });
      }
    });
  });

  setActive(rows[0]);
}
