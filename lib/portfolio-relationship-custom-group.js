/**
 * Custom ticker group controls for Relationship Story (production + design-lab).
 * @module lib/portfolio-relationship-custom-group
 */

import { cacheResolution } from "/lib/company-name-resolver.js";
import {
  buildCustomEpisode,
  resolveTickerGroup,
} from "/design-lab/portfolio-relationship-story/relationship-tickers.js";

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {{
 *   getStoryApi: () => { setEpisodes: (episodes: object[], opts?: { playIndex?: number }) => void } | null,
 *   mergeEpisodes: () => object[],
 *   setCustomEpisode: (episode: object | null) => void,
 *   onCustomEpisode?: (episode: object) => void,
 * }} options
 */
export function initPortfolioRelationshipCustomGroup(options) {
  const { getStoryApi, mergeEpisodes, setCustomEpisode, onCustomEpisode } = options;

  /** @type {import('/design-lab/portfolio-relationship-story/relationship-tickers.js').ParsedTickerGroup | null} */
  let pendingResolve = null;

  function setTickerMessage(text, tone = "") {
    const msg = document.getElementById("tickerInputMessage");
    if (!msg) return;
    msg.textContent = text;
    msg.className = "pr-ticker-msg" + (tone ? ` pr-ticker-msg--${tone}` : "");
  }

  function setAnalyzeBusy(busy) {
    const btn = document.getElementById("tickerAnalyzeBtn");
    if (btn) {
      btn.disabled = busy;
      btn.setAttribute("aria-busy", busy ? "true" : "false");
    }
  }

  function normalizeChoiceKey(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase();
  }

  function hideResolverPicker() {
    const picker = document.getElementById("resolverPicker");
    if (picker) picker.hidden = true;
  }

  /**
   * @param {import('/design-lab/portfolio-relationship-story/relationship-tickers.js').ParsedTickerGroup} parsed
   */
  function showResolverPicker(parsed) {
    const picker = document.getElementById("resolverPicker");
    const body = document.getElementById("resolverPickerBody");
    if (!picker || !body || !parsed.pending?.length) return;

    pendingResolve = parsed;

    body.innerHTML = parsed.pending
      .map((item, pickIdx) => {
        const options = item.matches
          .map(
            (m, i) => `
        <label class="pr-resolver-option">
          <input type="radio" name="resolver-${pickIdx}" value="${i}" ${i === 0 ? "checked" : ""} />
          <span class="pr-resolver-option__sym">${esc(m.symbol)}</span>
          <span class="pr-resolver-option__name">${esc(m.name)}</span>
        </label>`
          )
          .join("");
        return `
      <div class="pr-resolver-group" data-pick-idx="${pickIdx}">
        <p class="pr-resolver-group__q">“${esc(item.token)}”</p>
        <div class="pr-resolver-options">${options}</div>
      </div>`;
      })
      .join("");

    picker.hidden = false;
    picker.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  /**
   * @param {import('/design-lab/portfolio-relationship-story/relationship-tickers.js').ParsedTickerGroup} parsed
   */
  function finishCustomEpisode(parsed) {
    const episode = buildCustomEpisode(parsed);
    if (!episode) {
      setTickerMessage(
        parsed.message || "Add at least two valid tickers or company names.",
        "error"
      );
      return;
    }

    hideResolverPicker();
    pendingResolve = null;

    setCustomEpisode(episode);
    const episodes = mergeEpisodes();
    const playIndex = episodes.length - 1;
    getStoryApi()?.setEpisodes(episodes, { playIndex });
    onCustomEpisode?.(episode);

    const resolvedList = parsed.symbols
      .map(
        (s) =>
          `${s}${
            parsed.symbolNames[s] && parsed.symbolNames[s] !== s
              ? ` (${parsed.symbolNames[s]})`
              : ""
          }`
      )
      .join(", ");

    if (parsed.message) {
      setTickerMessage(`${parsed.message} Resolved: ${resolvedList}.`, "warn");
    } else {
      setTickerMessage(`Resolved: ${resolvedList}.`, "ok");
    }
  }

  async function continueAfterPicker() {
    if (!pendingResolve?.pending?.length) return;

    const input = document.getElementById("tickerInput");
    /** @type {Record<string, { symbol: string, name: string }>} */
    const choices = {};

    pendingResolve.pending.forEach((item, pickIdx) => {
      const group = document.querySelector(`[data-pick-idx="${pickIdx}"]`);
      const selected = group?.querySelector('input[type="radio"]:checked');
      const idx = selected ? Number(selected.value) : 0;
      const match = item.matches[idx] || item.matches[0];
      if (!match) return;
      choices[normalizeChoiceKey(item.token)] = {
        symbol: match.symbol,
        name: match.name,
      };
      cacheResolution(item.token, { symbol: match.symbol, name: match.name });
    });

    setAnalyzeBusy(true);
    setTickerMessage("Applying your selections…", "");

    const parsed = await resolveTickerGroup(input?.value || "", { choices });
    setAnalyzeBusy(false);

    if (parsed.status === "ambiguous") {
      showResolverPicker(parsed);
      setTickerMessage("Choose a match for each name below.", "warn");
      return;
    }

    if (parsed.status !== "ok") {
      setTickerMessage(
        parsed.message || "Add at least two valid tickers or company names.",
        "error"
      );
      return;
    }

    finishCustomEpisode(parsed);
  }

  async function analyzeCustomTickers() {
    const input = document.getElementById("tickerInput");
    if (!input || !getStoryApi()) return;

    hideResolverPicker();
    setAnalyzeBusy(true);
    setTickerMessage("Resolving company names…", "");

    const parsed = await resolveTickerGroup(input.value);
    setAnalyzeBusy(false);

    if (parsed.status === "empty") {
      setTickerMessage("Add at least two valid tickers or company names.", "error");
      return;
    }

    if (parsed.status === "ambiguous") {
      showResolverPicker(parsed);
      setTickerMessage("Multiple matches — choose the right symbol below.", "warn");
      return;
    }

    if (parsed.status !== "ok") {
      setTickerMessage(
        parsed.message || "Add at least two valid tickers or company names.",
        "error"
      );
      return;
    }

    finishCustomEpisode(parsed);
  }

  document.getElementById("tickerAnalyzeBtn")?.addEventListener("click", analyzeCustomTickers);
  document.getElementById("resolverPickerConfirm")?.addEventListener("click", continueAfterPicker);
  document.getElementById("resolverPickerCancel")?.addEventListener("click", () => {
    hideResolverPicker();
    pendingResolve = null;
    setTickerMessage("Resolution cancelled.", "");
  });

  document.getElementById("tickerInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      analyzeCustomTickers();
    }
  });
}
