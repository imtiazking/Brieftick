/**
 * Design lab · Today's Market Story (Discover Stocks narrative concept).
 * @module design-lab/discover-market-story/discover-market-story
 */

import { mountRelationshipStory } from "/design-lab/move-together/story/relationship-story.js";
import { buildCustomRelationshipMeta } from "/design-lab/move-together/story/custom-relationship-meta.js";
import {
  cacheResolution,
  resolveCompanyInput,
} from "/lib/company-name-resolver.js";
import { tokenizeRelationshipInput } from "/design-lab/portfolio-relationship-story/relationship-tickers.js";

const SCAN_LABELS = {
  momentum: "Big Movers",
  breakout: "Near 52-Week Highs",
  volume: "Unusual Volume",
  sector: "Today's Leaders",
};

const SIGNAL_STRENGTH_LABEL = "Signal strength";

/**
 * @param {number} score
 */
function signalStrengthLabel(score) {
  const n = Number(score);
  if (n >= 90) return "Very strong";
  if (n >= 80) return "Strong";
  if (n >= 70) return "Worth watching";
  if (n >= 60) return "Early signal";
  return "Weak";
}

/**
 * @param {number} score
 */
function signalStrengthClass(score) {
  const n = Number(score);
  if (n >= 90) return "dms-signal-val--very-strong";
  if (n >= 80) return "dms-signal-val--strong";
  if (n >= 70) return "dms-signal-val--watch";
  if (n >= 60) return "dms-signal-val--early";
  return "dms-signal-val--weak";
}

/** @type {Record<string, ThemeConfig>} */
const THEMES = {
  ai: {
    id: "ai",
    chip: "AI Infrastructure",
    title: "AI Infrastructure Leads Markets",
    story:
      "NVIDIA, AMD and Broadcom are among today's strongest names as investors continue to favour companies benefiting from AI infrastructure spending and data-centre demand.",
    keyNames: ["NVDA", "AMD", "AVGO", "MSFT"],
    nameGroups: {
      leaders: ["NVDA", "AMD", "AVGO"],
      emerging: ["SMCI", "ANET", "ARM"],
      watchlist: ["MRVL", "DELL", "VRT"],
    },
    hero: "NVDA",
    relatives: ["AMD", "AVGO", "MSFT"],
    positions: [
      { x: 72, y: 28 },
      { x: 78, y: 52 },
      { x: 68, y: 72 },
    ],
    symbolNames: {
      NVDA: "NVIDIA",
      AMD: "AMD",
      AVGO: "Broadcom",
      MSFT: "Microsoft",
      SMCI: "Super Micro",
      ANET: "Arista Networks",
      ARM: "Arm Holdings",
      MRVL: "Marvell",
      DELL: "Dell Technologies",
      VRT: "Vertiv",
    },
    stocks: [
      stock("NVDA", "NVIDIA Corporation", "Technology", 128.4, 4.82, 91, 2.4, 0.94),
      stock("AMD", "Advanced Micro Devices", "Technology", 178.2, 3.61, 84, 2.1, 0.88),
      stock("AVGO", "Broadcom Inc.", "Technology", 186.5, 2.94, 79, 1.8, 0.91),
      stock("MSFT", "Microsoft Corporation", "Technology", 428.1, 1.42, 72, 1.3, 0.86),
      stock("SMCI", "Super Micro Computer", "Technology", 892.0, 5.12, 88, 3.2, 0.82),
      stock("ANET", "Arista Networks", "Technology", 312.8, 3.44, 81, 2.2, 0.86),
      stock("ARM", "Arm Holdings", "Technology", 142.3, 2.18, 76, 1.6, 0.79),
      stock("MRVL", "Marvell Technology", "Technology", 78.4, 2.86, 74, 1.9, 0.8),
      stock("DELL", "Dell Technologies", "Technology", 128.2, 1.92, 68, 1.4, 0.77),
      stock("VRT", "Vertiv Holdings", "Technology", 98.6, 2.64, 77, 1.7, 0.82),
    ],
  },
  cloud: {
    id: "cloud",
    chip: "Cloud",
    title: "Cloud Platforms Extend Gains",
    story:
      "Microsoft, Amazon and Alphabet are holding leadership as enterprise cloud budgets stay firm and AI services get layered onto existing platforms.",
    keyNames: ["MSFT", "AMZN", "GOOGL", "ORCL"],
    nameGroups: {
      leaders: ["MSFT", "AMZN", "GOOGL"],
      emerging: ["SNOW", "CRM", "NET"],
      watchlist: ["IBM", "NOW", "ADSK"],
    },
    hero: "MSFT",
    relatives: ["GOOGL", "AMZN", "ORCL"],
    positions: [
      { x: 26, y: 30 },
      { x: 22, y: 55 },
      { x: 28, y: 74 },
    ],
    symbolNames: {
      MSFT: "Microsoft",
      GOOGL: "Alphabet",
      AMZN: "Amazon",
      ORCL: "Oracle",
      SNOW: "Snowflake",
      CRM: "Salesforce",
      NET: "Cloudflare",
      IBM: "IBM",
      NOW: "ServiceNow",
      ADSK: "Autodesk",
    },
    stocks: [
      stock("MSFT", "Microsoft Corporation", "Technology", 428.1, 1.42, 74, 1.3, 0.86),
      stock("AMZN", "Amazon.com Inc.", "Consumer", 198.6, 1.88, 71, 1.5, 0.84),
      stock("GOOGL", "Alphabet Inc.", "Technology", 176.4, 1.56, 69, 1.4, 0.83),
      stock("ORCL", "Oracle Corporation", "Technology", 132.8, 2.24, 77, 1.7, 0.81),
      stock("CRM", "Salesforce Inc.", "Technology", 298.2, 0.92, 62, 1.1, 0.72),
      stock("SNOW", "Snowflake Inc.", "Technology", 168.5, 2.68, 80, 2.0, 0.75),
      stock("NET", "Cloudflare Inc.", "Technology", 92.1, 1.98, 70, 1.5, 0.76),
      stock("IBM", "IBM Corporation", "Technology", 188.4, 0.78, 58, 0.9, 0.74),
      stock("NOW", "ServiceNow Inc.", "Technology", 892.0, 1.12, 66, 1.0, 0.79),
      stock("ADSK", "Autodesk Inc.", "Technology", 248.6, 0.86, 60, 0.85, 0.71),
    ],
  },
  cyber: {
    id: "cyber",
    chip: "Cybersecurity",
    title: "Cybersecurity Names Firm Up",
    story:
      "CrowdStrike, Palo Alto and Zscaler are attracting buyers as breach headlines and enterprise security budgets keep demand for protection software elevated.",
    keyNames: ["CRWD", "PANW", "ZS", "FTNT"],
    nameGroups: {
      leaders: ["CRWD", "PANW", "ZS"],
      emerging: ["S", "NET", "OKTA"],
      watchlist: ["FTNT", "CYBR", "GEN"],
    },
    hero: "CRWD",
    relatives: ["PANW", "ZS", "FTNT"],
    positions: [
      { x: 74, y: 26 },
      { x: 78, y: 50 },
      { x: 70, y: 70 },
    ],
    symbolNames: {
      CRWD: "CrowdStrike",
      PANW: "Palo Alto Networks",
      ZS: "Zscaler",
      FTNT: "Fortinet",
      S: "SentinelOne",
      NET: "Cloudflare",
      OKTA: "Okta",
      CYBR: "CyberArk",
      GEN: "Gen Digital",
    },
    stocks: [
      stock("CRWD", "CrowdStrike Holdings", "Technology", 312.4, 2.86, 82, 1.9, 0.87),
      stock("PANW", "Palo Alto Networks", "Technology", 348.2, 2.12, 76, 1.6, 0.85),
      stock("ZS", "Zscaler Inc.", "Technology", 198.6, 3.04, 79, 2.1, 0.8),
      stock("FTNT", "Fortinet Inc.", "Technology", 72.4, 1.64, 68, 1.2, 0.78),
      stock("S", "SentinelOne Inc.", "Technology", 24.8, 4.12, 85, 2.8, 0.71),
      stock("NET", "Cloudflare Inc.", "Technology", 92.1, 1.98, 70, 1.5, 0.76),
      stock("OKTA", "Okta Inc.", "Technology", 88.2, 2.42, 73, 1.6, 0.74),
      stock("CYBR", "CyberArk Software", "Technology", 268.4, 1.88, 67, 1.3, 0.76),
      stock("GEN", "Gen Digital Inc.", "Technology", 28.6, 1.24, 61, 1.0, 0.69),
    ],
  },
  financials: {
    id: "financials",
    chip: "Financials",
    title: "Banks Ride Rate Expectations",
    story:
      "JPMorgan, Bank of America and Goldman Sachs are moving with shifting Fed expectations as investors reposition around the path for interest rates and lending margins.",
    keyNames: ["JPM", "BAC", "GS", "MS"],
    nameGroups: {
      leaders: ["JPM", "BAC", "GS"],
      emerging: ["SCHW", "BX", "KKR"],
      watchlist: ["MS", "WFC", "C"],
    },
    hero: "JPM",
    relatives: ["BAC", "GS", "MS"],
    positions: [
      { x: 74, y: 32 },
      { x: 76, y: 54 },
      { x: 68, y: 72 },
    ],
    symbolNames: {
      JPM: "JPMorgan Chase",
      BAC: "Bank of America",
      GS: "Goldman Sachs",
      MS: "Morgan Stanley",
      SCHW: "Charles Schwab",
      BX: "Blackstone",
      KKR: "KKR",
      WFC: "Wells Fargo",
      C: "Citigroup",
    },
    stocks: [
      stock("JPM", "JPMorgan Chase & Co.", "Financials", 198.2, 1.24, 71, 1.2, 0.82),
      stock("BAC", "Bank of America Corp.", "Financials", 38.6, 1.08, 66, 1.1, 0.79),
      stock("GS", "Goldman Sachs Group", "Financials", 468.4, 1.56, 74, 1.4, 0.84),
      stock("MS", "Morgan Stanley", "Financials", 98.2, 1.32, 69, 1.0, 0.8),
      stock("SCHW", "Charles Schwab Corp.", "Financials", 72.8, 1.42, 70, 1.1, 0.78),
      stock("BX", "Blackstone Inc.", "Financials", 142.6, 1.88, 76, 1.3, 0.81),
      stock("KKR", "KKR & Co.", "Financials", 118.4, 1.62, 72, 1.2, 0.8),
      stock("WFC", "Wells Fargo & Co.", "Financials", 58.4, 0.94, 62, 0.9, 0.77),
      stock("C", "Citigroup Inc.", "Financials", 62.8, 1.18, 64, 1.0, 0.75),
    ],
  },
  energy: {
    id: "energy",
    chip: "Energy",
    title: "Energy Complex Stays Bid",
    story:
      "Exxon, Chevron and Schlumberger are benefiting from firm crude prices and disciplined capital returns as supply concerns keep the sector in focus.",
    keyNames: ["XOM", "CVX", "COP", "SLB"],
    nameGroups: {
      leaders: ["XOM", "CVX", "COP"],
      emerging: ["SLB", "EOG", "OXY"],
      watchlist: ["HAL", "MPC", "PSX"],
    },
    hero: "XOM",
    relatives: ["CVX", "COP", "SLB"],
    positions: [
      { x: 72, y: 30 },
      { x: 78, y: 52 },
      { x: 66, y: 72 },
    ],
    symbolNames: {
      XOM: "Exxon Mobil",
      CVX: "Chevron Corp.",
      COP: "ConocoPhillips",
      SLB: "Schlumberger",
      EOG: "EOG Resources",
      OXY: "Occidental",
      HAL: "Halliburton",
      MPC: "Marathon Petroleum",
      PSX: "Phillips 66",
    },
    stocks: [
      stock("XOM", "Exxon Mobil Corporation", "Energy", 118.4, 1.62, 73, 1.3, 0.85),
      stock("CVX", "Chevron Corporation", "Energy", 162.8, 1.44, 70, 1.2, 0.83),
      stock("COP", "ConocoPhillips", "Energy", 124.2, 1.88, 76, 1.5, 0.81),
      stock("SLB", "Schlumberger Limited", "Energy", 48.6, 2.24, 78, 1.7, 0.79),
      stock("EOG", "EOG Resources Inc.", "Energy", 132.4, 1.52, 68, 1.1, 0.8),
      stock("OXY", "Occidental Petroleum", "Energy", 62.1, 2.02, 75, 1.6, 0.77),
      stock("HAL", "Halliburton Company", "Energy", 38.4, 1.86, 71, 1.4, 0.76),
      stock("MPC", "Marathon Petroleum", "Energy", 168.2, 1.34, 65, 1.0, 0.78),
      stock("PSX", "Phillips 66", "Energy", 142.8, 1.18, 63, 0.95, 0.74),
    ],
  },
  healthcare: {
    id: "healthcare",
    chip: "Healthcare",
    title: "Healthcare Leaders Hold Ground",
    story:
      "Eli Lilly, UnitedHealth and Johnson & Johnson are drawing interest as obesity-treatment momentum and defensive positioning keep large-cap health names supported.",
    keyNames: ["LLY", "UNH", "JNJ", "ABBV"],
    nameGroups: {
      leaders: ["LLY", "UNH", "JNJ"],
      emerging: ["NVO", "VKTX", "REGN"],
      watchlist: ["ABBV", "MRK", "PFE"],
    },
    hero: "LLY",
    relatives: ["UNH", "JNJ", "ABBV"],
    positions: [
      { x: 74, y: 28 },
      { x: 76, y: 52 },
      { x: 68, y: 70 },
    ],
    symbolNames: {
      LLY: "Eli Lilly",
      UNH: "UnitedHealth",
      JNJ: "Johnson & Johnson",
      ABBV: "AbbVie",
      NVO: "Novo Nordisk",
      VKTX: "Viking Therapeutics",
      REGN: "Regeneron",
      MRK: "Merck",
      PFE: "Pfizer",
    },
    stocks: [
      stock("LLY", "Eli Lilly and Company", "Healthcare", 892.4, 2.42, 81, 1.6, 0.9),
      stock("UNH", "UnitedHealth Group", "Healthcare", 528.2, 0.86, 64, 0.9, 0.78),
      stock("JNJ", "Johnson & Johnson", "Healthcare", 158.6, 0.72, 58, 0.8, 0.74),
      stock("ABBV", "AbbVie Inc.", "Healthcare", 182.4, 1.12, 66, 1.0, 0.8),
      stock("NVO", "Novo Nordisk", "Healthcare", 128.6, 1.68, 74, 1.2, 0.82),
      stock("VKTX", "Viking Therapeutics", "Healthcare", 68.4, 4.82, 86, 2.6, 0.7),
      stock("REGN", "Regeneron Pharmaceuticals", "Healthcare", 1024.0, 1.24, 70, 1.1, 0.79),
      stock("MRK", "Merck & Co.", "Healthcare", 124.8, 0.94, 61, 0.85, 0.76),
      stock("PFE", "Pfizer Inc.", "Healthcare", 28.4, 0.68, 52, 0.7, 0.68),
    ],
  },
};

/**
 * @typedef {Object} MockStock
 * @property {string} sym
 * @property {string} name
 * @property {string} sector
 * @property {number} close
 * @property {number} pctChange
 * @property {number} score
 * @property {number} volRatio
 * @property {number} pos52
 */

/**
 * @typedef {Object} ThemeConfig
 * @property {string} id
 * @property {string} chip
 * @property {string} title
 * @property {string} story
 * @property {string[]} keyNames
 * @property {{ leaders: string[], emerging: string[], watchlist: string[] }} nameGroups
 * @property {string} hero
 * @property {string[]} relatives
 * @property {{ x: number, y: number }[]} positions
 * @property {Record<string, string>} symbolNames
 * @property {MockStock[]} stocks
 */

/**
 * @param {string} sym
 * @param {string} name
 * @param {string} sector
 * @param {number} close
 * @param {number} pctChange
 * @param {number} score
 * @param {number} volRatio
 * @param {number} pos52
 */
function stock(sym, name, sector, close, pctChange, score, volRatio, pos52) {
  return { sym, name, sector, close, pctChange, score, volRatio, pos52 };
}

let activeThemeId = "ai";
let activeScan = "momentum";
let highlightedSym = null;
let namesExpanded = false;
let customAddOpen = false;

/** @type {{ sym: string, name: string }[]} */
let customEntries = [];

/** @type {{ token: string, matches: { symbol: string, name: string }[] } | null} */
let pendingCustomResolve = null;

/** @type {string[]} */
let pendingCustomTokens = [];

/** @type {ReturnType<typeof mountRelationshipStory> | null} */
let relStoryApi = null;

const els = {
  story: () => document.getElementById("dmsStory"),
  themeTitle: () => document.getElementById("dmsThemeTitle"),
  storyBody: () => document.getElementById("dmsStoryBody"),
  themeChips: () => document.getElementById("dmsThemeChips"),
  keyNamesDefault: () => document.getElementById("dmsKeyNamesDefault"),
  namesToggle: () => document.getElementById("dmsNamesToggle"),
  namesExpanded: () => document.getElementById("dmsNamesExpanded"),
  namesGroups: () => document.getElementById("dmsNamesGroups"),
  grid: () => document.getElementById("dmsGrid"),
  stats: () => document.getElementById("dmsStats"),
  relPanel: () => document.getElementById("dmsRelPanel"),
  relMount: () => document.getElementById("dmsRelMount"),
  relThemeLabel: () => document.getElementById("dmsRelThemeLabel"),
};

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @param {string} sym
 * @param {string} name
 */
function mockCustomStock(sym, name) {
  const hash = sym.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const pct = ((hash % 40) / 10 + 0.4).toFixed(2);
  return stock(sym, name, "Your list", 80 + (hash % 120), Number(pct), 55 + (hash % 35), 1.1, 0.72);
}

/**
 * @param {ThemeConfig} theme
 */
function getThemeStocks(theme) {
  const bySym = new Map(theme.stocks.map((s) => [s.sym, s]));
  for (const entry of customEntries) {
    if (!bySym.has(entry.sym)) {
      bySym.set(entry.sym, mockCustomStock(entry.sym, entry.name));
    }
  }
  return [...bySym.values()];
}

function buildRelationshipEpisode(theme) {
  const relationshipMeta = buildCustomRelationshipMeta(
    theme.hero,
    theme.relatives,
    theme.symbolNames
  );
  if (theme.id === "ai") {
    relationshipMeta.theme = "AI Infrastructure";
  }

  return {
    id: `theme-${theme.id}`,
    source: "custom",
    hero: theme.hero,
    relatives: theme.relatives,
    positions: theme.positions,
    pickerLabel: theme.hero,
    symbolNames: theme.symbolNames,
    relationshipMeta,
  };
}

function sortStocks(stocks, mode) {
  const list = [...stocks];
  if (mode === "momentum") return list.sort((a, b) => b.score - a.score);
  if (mode === "breakout") return list.sort((a, b) => b.pos52 - a.pos52);
  if (mode === "volume") return list.sort((a, b) => b.volRatio - a.volRatio);
  if (mode === "sector") return list.sort((a, b) => b.pctChange - a.pctChange);
  return list;
}

function whyLine(s, mode, rank) {
  const sign = s.pctChange >= 0 ? "+" : "";
  const pct = `${sign}${s.pctChange.toFixed(2)}%`;
  const posPct = Math.round(s.pos52 * 100);
  const rankPhrase = rank <= 3 ? `<b>#${rank}</b> on this list` : "In the top half of this scan";

  if (mode === "breakout") {
    return `<b>Why it's here:</b> Ranked ${rankPhrase} — <b>near its 52-week high</b> (${posPct}% of range), ${pct} today.`;
  }
  if (mode === "volume") {
    return `<b>Why it's here:</b> Ranked ${rankPhrase} for <b>unusual volume</b> (${s.volRatio.toFixed(1)}× typical), ${pct} today.`;
  }
  if (mode === "sector") {
    return `<b>Why it's here:</b> Ranked ${rankPhrase} — <b>top gainer</b> in ${esc(s.sector)} (${pct}).`;
  }
  return `<b>Why it's here:</b> Ranked ${rankPhrase} among big movers — ${pct} today, ${s.volRatio.toFixed(1)}× volume.`;
}

function renderCards() {
  const theme = THEMES[activeThemeId];
  const grid = els.grid();
  const stats = els.stats();
  if (!grid || !theme) return;

  const pool = getThemeStocks(theme);
  let sorted = sortStocks(pool, activeScan);
  if (customEntries.length) {
    const customSyms = new Set(customEntries.map((c) => c.sym));
    const customRows = sorted.filter((s) => customSyms.has(s.sym));
    const rest = sorted.filter((s) => !customSyms.has(s.sym));
    sorted = [...customRows, ...rest];
  }
  sorted = sorted.slice(0, 6);
  const modeLabel = SCAN_LABELS[activeScan] || activeScan;

  if (stats) {
    stats.textContent = `${sorted.length} stocks · ${theme.chip} theme · Sorted by ${modeLabel} · Illustrative preview data`;
  }

  grid.innerHTML = sorted
    .map((s, i) => {
      const dir = s.pctChange >= 0 ? "up" : "dn";
      const sign = s.pctChange >= 0 ? "+" : "";
      const hl = highlightedSym === s.sym ? " is-key-highlight" : "";
      return `<article class="dms-card${hl}" data-sym="${s.sym}">
        <div class="dms-card-rank">#${i + 1}</div>
        <div class="dms-card-top">
          <div>
            <div class="dms-card-sym">${s.sym}</div>
            <div class="dms-card-name">${esc(s.name)}</div>
            <div class="dms-card-sector">${esc(s.sector)}</div>
          </div>
          <div>
            <div class="dms-card-price">$${s.close.toFixed(2)}</div>
            <div class="dms-card-pct ${dir}">${sign}${s.pctChange.toFixed(2)}%</div>
          </div>
        </div>
        <p class="dms-card-why">${whyLine(s, activeScan, i + 1)}</p>
        <div class="dms-score-bar">
          <div class="dms-score-label">
            <span>${SIGNAL_STRENGTH_LABEL}</span>
            <span class="dms-signal-val ${signalStrengthClass(s.score)}" title="Model score: ${s.score} out of 99">${signalStrengthLabel(s.score)}</span>
          </div>
          <div class="dms-score-track" aria-hidden="true"><div class="dms-score-fill" style="width:${s.score}%"></div></div>
        </div>
      </article>`;
    })
    .join("");
}

/**
 * @param {string} sym
 * @param {{ custom?: boolean }} [opts]
 */
function nameChipHtml(sym, opts = {}) {
  const hl = highlightedSym === sym ? " is-highlight" : "";
  const custom = opts.custom ? " is-custom" : "";
  return `<button type="button" class="dms-name-chip is-rel-link${hl}${custom}" data-sym="${sym}">${sym}</button>`;
}

/**
 * @param {string[]} syms
 */
function nameChipRow(syms) {
  return syms
    .map((sym, i) => {
      const sep = i < syms.length - 1 ? '<span class="dms-name-sep"> • </span>' : "";
      return `${nameChipHtml(sym)}${sep}`;
    })
    .join("");
}

function renderDefaultKeyNames() {
  const theme = THEMES[activeThemeId];
  const wrap = els.keyNamesDefault();
  if (!wrap || !theme) return;

  const defaultFour = theme.keyNames.slice(0, 4);
  wrap.innerHTML = `
    <span class="dms-key-names__label">Key names</span>
    ${nameChipRow(defaultFour)}`;
}

function renderExpandedNameGroups() {
  const theme = THEMES[activeThemeId];
  const wrap = els.namesGroups();
  if (!wrap || !theme?.nameGroups) return;

  const groups = [
    { title: "Leaders", syms: theme.nameGroups.leaders, custom: false },
    { title: "Emerging", syms: theme.nameGroups.emerging, custom: false },
    { title: "Watchlist", syms: theme.nameGroups.watchlist, custom: false },
  ];

  if (customEntries.length) {
    groups.push({
      title: "Custom",
      syms: customEntries.map((c) => c.sym),
      custom: true,
    });
  }

  wrap.innerHTML = groups
    .map(
      (g) => `
    <div class="dms-name-group${g.custom ? " dms-name-group--custom" : ""}">
      <div class="dms-name-group__title">${g.title}</div>
      <div class="dms-name-group__chips">
        ${g.syms.map((sym) => nameChipHtml(sym, { custom: g.custom })).join("")}
      </div>
    </div>`
    )
    .join("");
}

function syncCustomAddUi() {
  const toggle = document.getElementById("dmsAddStockToggle");
  const panel = document.getElementById("dmsCustomAdd");
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(customAddOpen));
    toggle.textContent = customAddOpen ? "Hide add stock" : "Add stock";
  }
  if (panel) panel.hidden = !customAddOpen;
}

function syncNamesExpandUi() {
  const toggle = els.namesToggle();
  const expanded = els.namesExpanded();
  if (toggle) {
    toggle.textContent = namesExpanded ? "Show fewer names" : "Show more names";
    toggle.setAttribute("aria-expanded", String(namesExpanded));
  }
  if (expanded) {
    expanded.hidden = !namesExpanded;
    if (!namesExpanded) {
      customAddOpen = false;
      syncCustomAddUi();
    }
  }
}

function renderNamesSection() {
  renderDefaultKeyNames();
  syncNamesExpandUi();
  if (namesExpanded) {
    renderExpandedNameGroups();
  }
}

function setNamesExpanded(next) {
  namesExpanded = next;
  syncNamesExpandUi();
  if (namesExpanded) {
    renderExpandedNameGroups();
    els.namesExpanded()?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function setCustomMessage(text, tone = "") {
  const msg = document.getElementById("dmsCustomMsg");
  if (!msg) return;
  msg.textContent = text;
  msg.className = "dms-custom-msg" + (tone ? ` dms-custom-msg--${tone}` : "");
}

function hideCustomResolver() {
  const el = document.getElementById("dmsCustomResolver");
  if (el) el.hidden = true;
  pendingCustomResolve = null;
}

function showCustomResolver(token, matches) {
  const el = document.getElementById("dmsCustomResolver");
  if (!el) return;
  pendingCustomResolve = { token, matches };

  const options = matches
    .slice(0, 5)
    .map(
      (m, i) => `
    <label class="dms-custom-resolver__opt">
      <input type="radio" name="dms-custom-pick" value="${i}" ${i === 0 ? "checked" : ""} />
      <span class="dms-custom-resolver__sym">${esc(m.symbol)}</span>
      <span>${esc(m.name)}</span>
    </label>`
    )
    .join("");

  el.innerHTML = `
    <p class="dms-custom-resolver__q">Which symbol did you mean for “${esc(token)}”?</p>
    ${options}
    <div class="dms-custom-resolver__actions">
      <button type="button" class="dms-custom-resolver__btn" data-action="cancel">Cancel</button>
      <button type="button" class="dms-custom-resolver__btn dms-custom-resolver__btn--ok" data-action="confirm">Use this</button>
    </div>`;
  el.hidden = false;
}

/**
 * @param {string} sym
 * @param {string} name
 */
function addCustomEntry(sym, name) {
  const upper = sym.toUpperCase();
  if (customEntries.some((c) => c.sym === upper)) return false;
  customEntries.push({ sym: upper, name: name || upper });
  return true;
}

async function processCustomToken(token) {
  const result = await resolveCompanyInput(token);
  if (result.status === "resolved") {
    cacheResolution(token, { symbol: result.symbol, name: result.name });
    const added = addCustomEntry(result.symbol, result.name);
    return added ? { ok: true, sym: result.symbol } : { ok: false, reason: "duplicate" };
  }
  if (result.status === "ambiguous") {
    pendingCustomTokens = pendingCustomTokens.filter((t) => t !== token);
    showCustomResolver(token, result.matches);
    return { ok: false, reason: "ambiguous" };
  }
  return { ok: false, reason: "unresolved", message: result.message };
}

async function continueCustomResolver() {
  if (!pendingCustomResolve) return;
  const el = document.getElementById("dmsCustomResolver");
  const selected = el?.querySelector('input[name="dms-custom-pick"]:checked');
  const idx = selected ? Number(selected.value) : 0;
  const match = pendingCustomResolve.matches[idx];
  hideCustomResolver();
  if (!match) return;

  cacheResolution(pendingCustomResolve.token, {
    symbol: match.symbol,
    name: match.name,
  });
  const added = addCustomEntry(match.symbol, match.name);
  if (added) customAddCount += 1;
  await drainCustomTokenQueue();
  if (customAddCount > 0) {
    if (!namesExpanded) setNamesExpanded(true);
    customAddOpen = true;
    syncCustomAddUi();
    renderNamesSection();
    renderCards();
    setCustomMessage(`Added ${match.symbol}.`, "ok");
  }
}

async function drainCustomTokenQueue() {
  if (pendingCustomResolve) return;
  while (pendingCustomTokens.length) {
    const token = pendingCustomTokens.shift();
    const outcome = await processCustomToken(token);
    if (outcome.reason === "ambiguous") {
      pendingCustomTokens.unshift(token);
      setCustomMessage("Pick the right match below.", "warn");
      return;
    }
    if (outcome.reason === "unresolved") {
      setCustomMessage(outcome.message || `Couldn't resolve "${token}".`, "error");
      pendingCustomTokens = [];
      return;
    }
    if (outcome.ok) {
      customAddCount += 1;
    }
  }
}

/** @type {number} */
let customAddCount = 0;

async function addCustomFromInput() {
  const input = document.getElementById("dmsCustomInput");
  const btn = document.getElementById("dmsCustomAddBtn");
  if (!input?.value.trim()) {
    setCustomMessage("Enter a company name or ticker.", "warn");
    return;
  }

  hideCustomResolver();
  const tokens = tokenizeRelationshipInput(input.value).map((t) => t.raw.trim()).filter(Boolean);
  if (!tokens.length) {
    setCustomMessage("Enter a company name or ticker.", "warn");
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = "…";
  }
  setCustomMessage("Resolving…", "");

  customAddCount = 0;
  pendingCustomTokens = [...tokens];
  input.value = "";

  await drainCustomTokenQueue();

  if (btn) {
    btn.disabled = false;
    btn.textContent = "Add";
  }

  if (pendingCustomResolve) return;

  if (customAddCount > 0) {
    if (!namesExpanded) setNamesExpanded(true);
    customAddOpen = true;
    syncCustomAddUi();
    renderNamesSection();
    renderCards();
    setCustomMessage(
      customAddCount === 1
        ? "Added to your Custom list."
        : `Added ${customAddCount} symbols to Custom.`,
      "ok"
    );
  } else if (!pendingCustomResolve) {
    setCustomMessage("No new symbols added — already on your list or not found.", "warn");
  }
}

function renderThemeChips() {
  const wrap = els.themeChips();
  if (!wrap) return;

  wrap.innerHTML = Object.values(THEMES)
    .map(
      (t) =>
        `<button type="button" class="dms-theme-chip${t.id === activeThemeId ? " is-active" : ""}" data-theme="${t.id}">${t.chip}</button>`
    )
    .join("");
}

function fadeStoryUpdate(fn) {
  const panel = els.story();
  if (!panel) {
    fn();
    return;
  }
  panel.classList.add("is-fading");
  setTimeout(() => {
    fn();
    panel.classList.remove("is-fading");
  }, 180);
}

function renderStory() {
  const theme = THEMES[activeThemeId];
  const title = els.themeTitle();
  const body = els.storyBody();
  const panel = els.story();
  if (!theme || !title || !body) return;

  title.textContent = theme.title;
  body.textContent = theme.story;
  if (panel) panel.classList.add("is-theme-active");
}

function setTheme(themeId) {
  if (!THEMES[themeId] || themeId === activeThemeId) return;
  activeThemeId = themeId;
  highlightedSym = null;
  namesExpanded = false;
  customAddOpen = false;
  hideCustomResolver();
  syncCustomAddUi();
  fadeStoryUpdate(() => {
    renderStory();
    renderThemeChips();
    renderNamesSection();
    renderCards();
  });
}

function setHighlightedSym(sym) {
  highlightedSym = highlightedSym === sym ? null : sym;
  renderNamesSection();
  document.querySelectorAll(".dms-card").forEach((card) => {
    card.classList.toggle("is-key-highlight", card.dataset.sym === highlightedSym);
  });
}

function openRelPanel() {
  const theme = THEMES[activeThemeId];
  const panel = els.relPanel();
  const mount = els.relMount();
  const label = els.relThemeLabel();
  if (!panel || !mount || !theme) return;

  if (label) label.textContent = theme.chip;

  const episode = buildRelationshipEpisode(theme);
  if (!relStoryApi) {
    relStoryApi = mountRelationshipStory(mount, {
      layout: "embed",
      episodes: [episode],
      defaultEpisode: 0,
      hidePicker: true,
    });
  } else {
    relStoryApi.setEpisodes([episode], { playIndex: 0, force: true });
  }

  panel.hidden = false;
  requestAnimationFrame(() => panel.classList.add("is-open"));
  document.body.style.overflow = "hidden";
}

function closeRelPanel() {
  const panel = els.relPanel();
  if (!panel) return;
  panel.classList.remove("is-open");
  document.body.style.overflow = "";
  setTimeout(() => {
    if (!panel.classList.contains("is-open")) panel.hidden = true;
  }, 400);
}

function bindEvents() {
  document.getElementById("dmsThemeChips")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-theme]");
    if (btn) setTheme(btn.dataset.theme);
  });

  document.getElementById("dmsNames")?.addEventListener("click", (e) => {
    const symBtn = e.target.closest("[data-sym]");
    if (symBtn) {
      setHighlightedSym(symBtn.dataset.sym);
      return;
    }
  });

  document.getElementById("dmsNamesToggle")?.addEventListener("click", () => {
    setNamesExpanded(!namesExpanded);
  });

  document.getElementById("dmsAddStockToggle")?.addEventListener("click", () => {
    customAddOpen = !customAddOpen;
    syncCustomAddUi();
    if (customAddOpen) {
      document.getElementById("dmsCustomInput")?.focus();
    }
  });

  document.getElementById("dmsCustomAddBtn")?.addEventListener("click", addCustomFromInput);
  document.getElementById("dmsCustomInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCustomFromInput();
    }
  });

  document.getElementById("dmsCustomResolver")?.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "cancel") {
      hideCustomResolver();
      pendingCustomTokens = [];
      setCustomMessage("Cancelled.", "");
      return;
    }
    if (action === "confirm") continueCustomResolver();
  });

  document.getElementById("dmsExploreBtn")?.addEventListener("click", openRelPanel);

  document.querySelector(".dms-scanner-controls")?.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-scan]");
    if (!chip) return;
    activeScan = chip.dataset.scan;
    document.querySelectorAll(".dms-filter-chip").forEach((el) => {
      el.classList.toggle("active", el.dataset.scan === activeScan);
    });
    renderCards();
  });

  document.getElementById("dmsRelClose")?.addEventListener("click", closeRelPanel);
  document.querySelector(".dms-rel-panel__backdrop")?.addEventListener("click", closeRelPanel);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeRelPanel();
  });
}

function init() {
  renderThemeChips();
  renderStory();
  renderNamesSection();
  syncCustomAddUi();
  renderCards();
  bindEvents();
}

init();
