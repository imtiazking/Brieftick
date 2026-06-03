/**
 * Relationship Story — embeddable module (design-lab).
 * @module design-lab/move-together/story/relationship-story
 */

import { displayName, edgesFor, other } from "/design-lab/move-together/_together-mock.js";
import { prefersReducedMotion } from "/design-lab/move-together/_together-premium.js";
import {
  insightForCustomGroup,
  insightForCustomPair,
  insightForGroup,
  insightForPair,
  renderCardMetricsHtml,
  renderNarrativeHtml,
  sharedThemeFor,
} from "/design-lab/move-together/story/relationship-copy.js";
import {
  buildCustomRelationshipMeta,
  pairStrengthForCustom,
} from "/design-lab/move-together/story/custom-relationship-meta.js";

export { SHARED_THEMES } from "/design-lab/move-together/story/relationship-copy.js";

export const DEFAULT_EPISODES = [
  {
    id: "preset-nvda",
    source: "preset",
    hero: "NVDA",
    relatives: ["AMD", "AVGO", "MSFT"],
    positions: [
      { x: 72, y: 28 },
      { x: 78, y: 52 },
      { x: 68, y: 72 },
    ],
  },
  {
    id: "preset-msft",
    source: "preset",
    hero: "MSFT",
    relatives: ["GOOGL", "META", "AMZN"],
    positions: [
      { x: 26, y: 30 },
      { x: 22, y: 55 },
      { x: 28, y: 74 },
    ],
  },
  {
    id: "preset-jpm",
    source: "preset",
    hero: "JPM",
    relatives: ["BAC", "SPY"],
    positions: [
      { x: 74, y: 38 },
      { x: 76, y: 62 },
    ],
  },
];

function usesRelationshipMeta(episode) {
  return episode?.source === "custom" || episode?.source === "holdings";
}

function isCustomEpisode(episode) {
  return episode?.source === "custom";
}

function customMeta(episode) {
  if (!usesRelationshipMeta(episode)) return null;
  return (
    episode.relationshipMeta ||
    buildCustomRelationshipMeta(
      episode.hero,
      episode.relatives,
      episode.symbolNames || {}
    )
  );
}

function pairLabel(hero, peer) {
  return `${hero} ↔ ${peer}`;
}

function narrativeForGroup(episode) {
  if (usesRelationshipMeta(episode)) {
    const meta = customMeta(episode);
    if (!meta) return "";
    return renderNarrativeHtml({
      sentences: insightForCustomGroup(meta),
      theme: meta.theme,
      strengthDisplay: meta.groupStrength,
    });
  }

  return renderNarrativeHtml({
    sentences: insightForGroup(episode.hero, episode.relatives),
    theme: sharedThemeFor(episode.hero),
  });
}

function narrativeForPair(episode, peer, r) {
  if (usesRelationshipMeta(episode)) {
    const meta = customMeta(episode);
    if (!meta) return "";
    return renderNarrativeHtml({
      pairLabel: pairLabel(episode.hero, peer),
      sentences: insightForCustomPair(meta, peer),
      theme: meta.theme,
      strengthDisplay: pairStrengthForCustom(meta, peer),
    });
  }

  return renderNarrativeHtml({
    pairLabel: pairLabel(episode.hero, peer),
    sentences: insightForPair(episode.hero, peer),
    strengthPct: Math.round((r ?? 0.65) * 100),
    theme: sharedThemeFor(episode.hero),
  });
}

function pickerLabel(ep) {
  if (ep.pickerLabel) return ep.pickerLabel;
  return ep.hero;
}

function labelName(sym, episode) {
  return episode?.symbolNames?.[sym] || displayName(sym);
}

/**
 * @param {HTMLElement} host
 * @param {{ episodes?: typeof DEFAULT_EPISODES, layout?: 'fullscreen' | 'embed', defaultEpisode?: number, hidePicker?: boolean, onEpisodeChange?: (episode: typeof DEFAULT_EPISODES[0]) => void }} [options]
 */
export function mountRelationshipStory(host, options = {}) {
  let episodes = [...(options.episodes || DEFAULT_EPISODES)];
  const layout = options.layout || "embed";
  let defaultEpisode = options.defaultEpisode ?? 0;
  const hidePicker = options.hidePicker === true;
  const onEpisodeChange = options.onEpisodeChange;

  host.classList.add("rs-root", layout === "fullscreen" ? "rs-root--fullscreen" : "rs-root--embed");
  host.innerHTML = `
    <div class="rs-stage" data-rs-stage>
      <div class="rs-scene" data-rs-scene>
        <div class="rs-scene__blur"></div>
        <div class="rs-aura" data-rs-aura></div>
        <div class="rs-hero" data-rs-hero>
          <div class="rs-hero__halo"></div>
          <span class="rs-hero__sym" data-rs-hero-sym></span>
          <span class="rs-hero__name" data-rs-hero-name></span>
        </div>
        <div class="rs-relatives" data-rs-relatives></div>
      </div>
      <aside class="rs-narrative" data-rs-narrative>
        <p class="rs-narrative__eyebrow">Why They Move Together</p>
        <div class="rs-narrative__body" data-rs-narr-body></div>
      </aside>
      <div class="rs-picker" data-rs-picker aria-label="Story episodes"></div>
    </div>
  `;

  const stage = host.querySelector("[data-rs-stage]");
  const scene = host.querySelector("[data-rs-scene]");
  const heroEl = host.querySelector("[data-rs-hero]");
  const heroSym = host.querySelector("[data-rs-hero-sym]");
  const heroName = host.querySelector("[data-rs-hero-name]");
  const relativesEl = host.querySelector("[data-rs-relatives]");
  const aura = host.querySelector("[data-rs-aura]");
  const narrBody = host.querySelector("[data-rs-narr-body]");
  const picker = host.querySelector("[data-rs-picker]");
  let narrativeFadeTimer = null;

  if (hidePicker) {
    picker.hidden = true;
    picker.setAttribute("aria-hidden", "true");
  }

  function renderPicker(activeIdx = episodeIdx) {
    if (hidePicker) return;
    picker.innerHTML = episodes
      .map((ep, i) => {
        const label = pickerLabel(ep);
        const customMark = isCustomEpisode(ep) ? ' data-custom="1"' : "";
        const cls = i === activeIdx ? "is-active" : "";
        return `<button type="button" data-idx="${i}" class="${cls}"${customMark} title="${isCustomEpisode(ep) ? "Custom group" : "Preset episode"}">${label}</button>`;
      })
      .join("");
  }

  let focusPeer = null;
  let cardEls = [];
  let episodeIdx = defaultEpisode;

  renderPicker(defaultEpisode);

  function auraBetween(heroRect, cardEl) {
    if (!cardEl || !heroRect) {
      aura.classList.remove("is-active");
      return;
    }
    const cr = cardEl.getBoundingClientRect();
    const sr = scene.getBoundingClientRect();
    const hx = heroRect.left + heroRect.width / 2 - sr.left;
    const hy = heroRect.top + heroRect.height / 2 - sr.top;
    const cx = cr.left + cr.width / 2 - sr.left;
    const cy = cr.top + cr.height / 2 - sr.top;
    aura.style.left = `${(hx + cx) / 2}px`;
    aura.style.top = `${(hy + cy) / 2}px`;
    aura.style.width = `${Math.max(80, Math.hypot(cx - hx, cy - hy) * 0.55)}px`;
    aura.style.height = `${Math.max(48, Math.hypot(cx - hx, cy - hy) * 0.35)}px`;
    aura.classList.add("is-active");
  }

  function setNarrative(html) {
    const reduced = prefersReducedMotion();
    const fadeMs = reduced ? 0 : 200;

    if (fadeMs === 0) {
      narrBody.innerHTML = html;
      return;
    }

    narrBody.classList.add("is-fading");
    clearTimeout(narrativeFadeTimer);
    narrativeFadeTimer = setTimeout(() => {
      narrBody.innerHTML = html;
      requestAnimationFrame(() => {
        narrBody.classList.remove("is-fading");
      });
    }, fadeMs);
  }

  function setFocus(peer, episode) {
    focusPeer = peer;
    const hasFocus = Boolean(peer);

    host.classList.toggle("rs-root--rel-active", hasFocus);
    scene.classList.toggle("rs-scene--rel-active", hasFocus);
    heroEl.classList.toggle("is-linked", hasFocus);
    relativesEl.classList.toggle("has-focus", hasFocus);

    cardEls.forEach((card) => {
      const focused = card.dataset.sym === peer;
      card.classList.toggle("is-focus", focused);
      card.classList.toggle("is-dimmed", hasFocus && !focused);
    });

    if (!peer) {
      setNarrative(narrativeForGroup(episode));
      aura.classList.remove("is-active");
      return;
    }

    const edge = edgesFor(episode.hero).find((e) => other(episode.hero, e) === peer);
    const r = edge?.r ?? 0.65;
    setNarrative(narrativeForPair(episode, peer, r));
    const card = cardEls.find((c) => c.dataset.sym === peer);
    auraBetween(heroEl.getBoundingClientRect(), card);
  }

  async function playEpisode(idx) {
    const episode = episodes[idx];
    if (!episode) return;
    episodeIdx = idx;
    focusPeer = null;
    cardEls = [];
    relativesEl.innerHTML = "";

    renderPicker(idx);
    host.classList.toggle("rs-root--custom", usesRelationshipMeta(episode));

    heroEl.classList.remove("is-visible");
    heroSym.textContent = episode.hero;
    heroName.textContent = labelName(episode.hero, episode);

    const reduced = prefersReducedMotion();
    const stagger = reduced ? 0 : 420;

    await new Promise((r) => setTimeout(r, reduced ? 30 : 180));
    heroEl.classList.add("is-visible");

    const custom = usesRelationshipMeta(episode);

    episode.relatives.forEach((sym, i) => {
      const edge = edgesFor(episode.hero).find((e) => other(episode.hero, e) === sym);
      const r = custom ? null : (edge?.r ?? 0.6);
      const pos = episode.positions[i] || { x: 70, y: 40 + i * 18 };
      const strengthPct = custom ? null : Math.round((r ?? 0.6) * 100);
      const meta = custom ? customMeta(episode) : null;
      const themeLabel = meta ? meta.theme : sharedThemeFor(episode.hero);
      const strengthDisplay = meta ? pairStrengthForCustom(meta, sym) : undefined;

      const card = document.createElement("article");
      card.className = "rs-card";
      card.dataset.sym = sym;
      if (strengthPct != null) card.dataset.strength = String(strengthPct);
      card.style.left = `${pos.x}%`;
      card.style.top = `${pos.y}%`;
      card.innerHTML = `
        <div class="rs-card__sym">${sym}</div>
        ${renderCardMetricsHtml({
          sym,
          strengthPct: custom ? null : strengthPct,
          strengthDisplay,
          theme: themeLabel,
        })}
      `;

      card.addEventListener("pointerenter", () => setFocus(sym, episode));
      card.addEventListener("pointerleave", () => setFocus(null, episode));

      relativesEl.appendChild(card);
      cardEls.push(card);
      setTimeout(() => card.classList.add("is-in"), stagger * (i + 1));
    });

    setTimeout(() => {
      setNarrative(narrativeForGroup(episode));
      if (!reduced && cardEls[0]) {
        auraBetween(heroEl.getBoundingClientRect(), cardEls[0]);
        setTimeout(() => aura.classList.remove("is-active"), 1000);
      }
    }, stagger * (episode.relatives.length + 1) + 160);

    if (typeof onEpisodeChange === "function") {
      onEpisodeChange(episode);
    }
  }

  picker.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    playEpisode(Number(btn.dataset.idx));
  });

  playEpisode(defaultEpisode);

  /**
   * @param {typeof DEFAULT_EPISODES} nextEpisodes
   * @param {{ playIndex?: number }} [opts]
   */
  function setEpisodes(nextEpisodes, opts = {}) {
    episodes = [...nextEpisodes];
    const idx = opts.playIndex ?? Math.max(0, episodes.length - 1);
    defaultEpisode = idx;
    playEpisode(idx);
    return episodes[episodeIdx];
  }

  return {
    playEpisode,
    setEpisodes,
    getEpisodes: () => [...episodes],
    getEpisode: () => episodes[episodeIdx],
    isCustomActive: () => isCustomEpisode(episodes[episodeIdx]),
    destroy() {
      host.innerHTML = "";
      host.classList.remove(
        "rs-root",
        "rs-root--fullscreen",
        "rs-root--embed",
        "rs-root--custom"
      );
    },
  };
}
