import {
  DEFAULT_EPISODES,
  mountRelationshipStory,
} from "/design-lab/move-together/story/relationship-story.js";
import { cacheResolution } from "/lib/company-name-resolver.js";
import {
  buildCustomEpisode,
  resolveTickerGroup,
} from "/design-lab/portfolio-relationship-story/relationship-tickers.js";

const ADVANCED_OPEN_KEY = "brieftick_portfolio_preview_advanced_open";

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @type {import('/design-lab/portfolio-relationship-story/relationship-tickers.js').RelationshipEpisode | null} */
let customEpisode = null;

/** @type {ReturnType<typeof mountRelationshipStory> | null} */
let storyApi = null;

/** @type {import('/design-lab/portfolio-relationship-story/relationship-tickers.js').ParsedTickerGroup | null} */
let pendingResolve = null;

function mergeEpisodes() {
  const presets = DEFAULT_EPISODES.map((ep) => ({ ...ep, source: ep.source || "preset" }));
  return customEpisode ? [...presets, customEpisode] : presets;
}

function updateRelationshipBadge(isCustom) {
  const badge = document.getElementById("prRelationshipBadge");
  if (!badge) return;
  badge.textContent = isCustom
    ? "Custom preview · illustrative relationship data"
    : "Preview only · illustrative relationship data";
}

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

  customEpisode = episode;
  const episodes = mergeEpisodes();
  storyApi?.setEpisodes(episodes, { playIndex: episodes.length - 1 });
  updateRelationshipBadge(true);

  const resolvedList = parsed.symbols
    .map((s) => `${s}${parsed.symbolNames[s] && parsed.symbolNames[s] !== s ? ` (${parsed.symbolNames[s]})` : ""}`)
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
  if (!input || !storyApi) return;

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

function initAdvancedToggle() {
  const toggle = document.getElementById("portAdvancedToggle");
  const panel = document.getElementById("portAdvancedPanel");
  const section = document.querySelector(".port-section--advanced");
  if (!toggle || !panel || !section) return;

  const stored = sessionStorage.getItem(ADVANCED_OPEN_KEY);
  const open = stored === null ? false : stored === "1";

  function setOpen(next) {
    toggle.setAttribute("aria-expanded", String(next));
    panel.hidden = !next;
    section.classList.toggle("is-open", next);
    sessionStorage.setItem(ADVANCED_OPEN_KEY, next ? "1" : "0");
  }

  setOpen(open);

  toggle.addEventListener("click", () => {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });
}

function initRelationshipStory() {
  const mount = document.getElementById("relationshipStoryMount");
  if (!mount) return;

  storyApi = mountRelationshipStory(mount, {
    layout: "embed",
    defaultEpisode: 0,
    episodes: mergeEpisodes(),
    onEpisodeChange: (episode) => {
      updateRelationshipBadge(episode?.source === "custom");
    },
  });

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

initAdvancedToggle();
initRelationshipStory();
