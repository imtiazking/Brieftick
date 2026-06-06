/**
 * Sync live riskState to visible Dashboard surfaces (wheel gauge, pulse, summary).
 * @module lib/market-risk-ui
 */

import {
  gaugeArcGeometry,
  vixToRiskScorePercent,
} from "/preview/market-mood.js";
import { applyBadge } from "/lib/live-data-badge.js";
import { refreshBriefingFromRiskState } from "/preview/dashboard-preview-briefing.js";

/**
 * @param {HTMLElement | null} root
 * @param {object} riskState
 */
export function hydrateMarketRiskGauge(root, riskState) {
  if (!root || !riskState) return;
  const gauge = root.querySelector(".live-gauge");
  if (!gauge) return;

  const displayVix = riskState.gaugeVix ?? 18;
  const mood = riskState.mood;
  const riskPct = vixToRiskScorePercent(displayVix);
  const geom = gaugeArcGeometry(displayVix);

  gauge.dataset.vix = String(displayVix.toFixed(1));
  gauge.dataset.mood = riskState.moodId || mood?.id || "neutral";
  gauge.style.setProperty("--gauge-fill", String(riskPct));
  gauge.setAttribute("aria-valuenow", String(Math.round(riskPct)));
  gauge.setAttribute("aria-label", `Market risk gauge · ${riskState.label}`);

  const module = root.closest(".rail-module--market-risk");
  if (module) module.dataset.mood = riskState.moodId || "neutral";

  const marker = gauge.querySelector(".live-gauge__marker");
  const needle = gauge.querySelector(".live-gauge__needle");
  const needleLine = gauge.querySelector(".live-gauge__needle-line");
  if (marker) {
    marker.setAttribute("cx", String(geom.markerX));
    marker.setAttribute("cy", String(geom.markerY));
  }
  if (needleLine) {
    needleLine.setAttribute("x2", String(geom.needleX2.toFixed(2)));
    needleLine.setAttribute("y2", String(geom.needleY2.toFixed(2)));
  } else if (needle) {
    needle.setAttribute("x2", String(geom.needleX2));
    needle.setAttribute("y2", String(geom.needleY2));
  }

  const moodLabel = gauge.querySelector(".live-gauge__headline-mood, .gauge-mood .gauge-state");
  if (moodLabel) moodLabel.textContent = riskState.label;

  const summary = root.querySelector("[data-mood-summary]");
  if (summary) {
    summary.textContent =
      riskState.narrative?.summary || mood?.summary || "Updating market risk context…";
  }
  const plain = root.querySelector("[data-mood-plain]");
  if (plain) {
    plain.textContent =
      riskState.narrative?.plainEnglish || mood?.plainEnglish || "";
  }

  const valueEl = gauge.querySelector(".gauge-value");
  if (valueEl && riskState.vix != null) {
    valueEl.textContent = riskState.vix.toFixed(1);
  }

  const badge = root.querySelector("[data-dash-live-badge]");
  if (badge) {
    const vixTxt =
      riskState.vix != null ? `VIX ${riskState.vix.toFixed(1)}` : "Composite risk";
    applyBadge(badge, "mixed", `${riskState.label} · ${vixTxt}`);
  }
}

/**
 * @param {object} riskState
 */
export function hydratePulseStrip(riskState) {
  const strip = document.querySelector("#page-dashboard.active .wheel-pulse-strip");
  if (!strip || !riskState) return;

  const headline = strip.querySelector(".wheel-pulse-strip__headline");
  const tag = strip.querySelector(".wheel-pulse-strip__tag");
  if (headline) {
    headline.textContent = riskState.narrative?.pulseLine || riskState.label || "Market Pulse";
  }
  if (tag) {
    const conf = riskState.confidence || "Medium";
    tag.textContent = `Market Pulse · ${riskState.label} · ${conf} confidence`;
  }

  const dashBadge = document.getElementById("dashLiveBadge");
  if (dashBadge) {
    applyBadge(dashBadge, "live", `Live risk engine · ${riskState.label}`);
  }
}

/**
 * Legacy hidden dashboard risk regime panel.
 * @param {object} riskState
 */
export function hydrateLegacyRiskPanel(riskState) {
  if (!riskState) return;
  const needle = document.getElementById("riskNeedle");
  const label = document.getElementById("riskRegimeLabel");
  const scoreEl = document.getElementById("riskScore");
  const agreement = document.getElementById("riskAgreement");
  const confidence = document.getElementById("riskConfidence");
  const components = document.getElementById("riskComponents");
  const explanation = document.getElementById("riskExplanation");

  if (needle) needle.style.left = `${riskState.score}%`;
  if (label) {
    label.textContent = String(riskState.label).toUpperCase();
    label.className =
      "risk-state " +
      (riskState.score >= 58 ? "off" : riskState.score <= 30 ? "on" : "neutral");
  }
  if (scoreEl) scoreEl.textContent = `${riskState.score} / 100`;
  if (agreement && riskState.components) {
    agreement.textContent = `${riskState.signalAgreement} of ${riskState.components.length} signals`;
  }
  if (confidence) confidence.textContent = `${riskState.confidence} confidence`;
  if (components && riskState.components) {
    components.innerHTML = riskState.components
      .map(
        (c) => `
      <div class="risk-component" title="${escapeAttr(c.detail)}">
        <span>${escapeHtml(c.name)}</span>
        <div class="risk-component-track"><div class="risk-component-fill" style="width:${c.value}%"></div></div>
        <b>${Math.round(c.value)}</b>
      </div>`
      )
      .join("");
  }
  if (explanation && riskState.narrative?.explanation) {
    explanation.innerHTML = riskState.narrative.explanation;
  }
  window._riskRegimeRendered = true;
}

/**
 * @param {object} riskState
 */
export function syncAllRiskSurfaces(riskState) {
  hydratePulseStrip(riskState);
  hydrateLegacyRiskPanel(riskState);

  const stage = document.getElementById("wheelModuleStage");
  const module = stage?.querySelector(".rail-module");
  if (module?.classList.contains("rail-module--market-risk")) {
    hydrateMarketRiskGauge(module, riskState);
  }
  if (module?.classList.contains("rail-module--briefing")) {
    refreshBriefingFromRiskState(module, riskState);
  } else {
    const briefingBody = document.querySelector(".wheel-briefing-body");
    if (briefingBody) refreshBriefingFromRiskState(briefingBody.closest(".rail-module") || briefingBody, riskState);
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
