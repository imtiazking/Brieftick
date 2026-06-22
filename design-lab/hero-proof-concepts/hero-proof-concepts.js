/**
 * Hero proof pills — production landing environment + variant switcher.
 * @module design-lab/hero-proof-concepts/hero-proof-concepts
 */

import {
  buildSplitEnvHtml,
  buildSplitRiversHtml,
  initSplitCinematic,
  refreshSplitRivers,
} from "/lib/split-atmosphere.js";
import { PROOF_POINTS, SWITCHER_OPTIONS } from "./hero-proof-data.js";

let teardownCinematic = null;
let activeVariant = "compare-fg";

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function proofStatGrid() {
  const proof = [
    ["Live market data", "Streaming context"],
    ["12,000+ equities", "Global coverage"],
    ["Earnings monitoring", "Real-time updates"],
    ["Market intelligence", "Built for investors"],
  ];
  return proof
    .map(
      ([b, s]) =>
        `<div class="cw-proof-item"><b>${esc(b)}</b><span>${esc(s)}</span></div>`
    )
    .join("");
}

function proofPhrasesInner(variant) {
  if (variant === "rail") {
    return PROOF_POINTS.map((p, i) => {
      const sep =
        i < PROOF_POINTS.length - 1
          ? '<span class="hpc-rail-sep" aria-hidden="true">│</span>'
          : "";
      return `<span class="cw-phrase">${esc(p)}</span>${sep}`;
    }).join("");
  }

  if (variant === "status") {
    return PROOF_POINTS.map(
      (p) =>
        `<span class="cw-phrase hpc-phrase--status"><span class="hpc-status-dot" aria-hidden="true"></span>${esc(p)}</span>`
    ).join("");
  }

  return PROOF_POINTS.map((p) => `<span class="cw-phrase">${esc(p)}</span>`).join("");
}

function proofPhrasesRow(variant) {
  return `<div class="cw-phrases" data-pill-variant="${esc(variant)}">${proofPhrasesInner(variant)}</div>`;
}

function buildCompareFgHtml() {
  return `<div class="hpc-fg-compare" id="heroProofSlot">
    <div class="hpc-fg-row">
      <p class="hpc-fg-label">Version F · Premium Tags</p>
      ${proofPhrasesRow("premium")}
    </div>
    <div class="hpc-fg-row">
      <p class="hpc-fg-label">Version G · Premium Signals</p>
      ${proofPhrasesRow("signals")}
    </div>
  </div>`;
}

function buildProofSlotHtml(variant) {
  if (variant === "compare-fg") return buildCompareFgHtml();
  return `<div class="cw-phrases" id="heroProofSlot" data-pill-variant="${esc(variant)}">${proofPhrasesInner(variant)}</div>`;
}

/** Production hero scene — matches lib/split-landing.js sceneTitle() */
function buildHeroSceneHtml(variant) {
  return `<section class="cw-scene cw-scene--center cw-scene--hero is-active">
    <span class="cw-float" style="left:8%;top:20%">NYSE OPEN</span>
    <span class="cw-float" style="right:10%;top:30%;animation-delay:-5s">LIVE STREAM</span>
    <div class="cw-scene-inner cw-hero-copy--stable">
      <div class="cw-eyebrow"><span class="pulse"></span> Live Beta · Cohort II Open</div>
      <span class="cw-type-line" style="--i:0">Understand</span>
      <span class="cw-type-line" style="--i:1">what moves</span>
      <span class="cw-type-line" style="--i:2"><em class="gold">markets.</em></span>
      <p class="cw-sub">Real-time market intelligence across earnings, macro events, sentiment, and market-moving news. Built to explain the why behind every move.</p>
      <div class="cw-proof">${proofStatGrid()}</div>
      ${buildProofSlotHtml(variant)}
    </div>
  </section>`;
}

function buildProductionWorld(variant) {
  return `<div class="cw cw--dual" data-cw-variant="dual">
    ${buildSplitEnvHtml(28)}
    ${buildSplitRiversHtml()}
    <div class="cw-hud">LIVE · BETA</div>
    <div class="cw-scenes">${buildHeroSceneHtml(variant)}</div>
  </div>`;
}

function applyVariant(variant) {
  activeVariant = variant;
  const slot = document.getElementById("heroProofSlot");
  const inner = document.querySelector(".cw-scene--hero .cw-scene-inner");
  if (!inner) return;

  const proof = inner.querySelector(".cw-proof");
  if (!proof) return;

  const existing = inner.querySelector("#heroProofSlot, .hpc-fg-compare");
  existing?.remove();

  proof.insertAdjacentHTML("afterend", buildProofSlotHtml(variant));

  document.querySelectorAll(".hpc-switcher__btn").forEach((btn) => {
    const on = btn.dataset.variant === variant;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function mountSwitcher() {
  const bar = document.getElementById("hpcSwitcher");
  if (!bar || bar.dataset.mounted) return;
  bar.dataset.mounted = "1";

  bar.innerHTML = `
    <a class="hpc-switcher__back" href="/">← FORGENIQ</a>
    <span class="hpc-switcher__title">Proof pills</span>
    <div class="hpc-switcher__track" role="tablist" aria-label="Pill treatment">
      ${SWITCHER_OPTIONS.map(
        (o) =>
          `<button type="button" class="hpc-switcher__btn" role="tab" data-variant="${o.id}" aria-pressed="${o.id === activeVariant ? "true" : "false"}">${esc(o.label)}</button>`
      ).join("")}
    </div>
    <span class="hpc-switcher__badge">Design lab</span>
  `;

  bar.querySelectorAll(".hpc-switcher__btn").forEach((btn) => {
    btn.addEventListener("click", () => applyVariant(btn.dataset.variant));
  });
}

function mountStage() {
  const stage = document.getElementById("hpcStage");
  if (!stage || stage.dataset.mounted) return;
  stage.dataset.mounted = "1";

  document.documentElement.setAttribute("data-split-landing", "1");
  document.documentElement.setAttribute("data-hpc-lab", "1");
  document.documentElement.setAttribute("data-theme", "split");

  stage.innerHTML = buildProductionWorld(activeVariant);

  if (teardownCinematic) teardownCinematic();
  teardownCinematic = initSplitCinematic(stage, {
    snap: false,
    pointerTarget: stage,
  });

  const refresh = () => refreshSplitRivers(stage);
  refresh();
  setTimeout(refresh, 600);
  setTimeout(refresh, 2500);
}

function init() {
  mountSwitcher();
  mountStage();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
