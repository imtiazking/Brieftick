/**
 * Conversational Logic render — preview UX (strategist note, not report grid).
 * @module preview/logic-conversational
 */

import { buildConversationalPresentation } from "../logic/engines/conversationalPresentation.js";
import { LOGIC_DISCLAIMER, LIMITED_DATA_MSG } from "../logic/types.js";

/**
 * @param {string} s
 */
function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {import('../logic/types.js').LogicResponse} res
 * @param {string} [role]
 */
export function renderConversationalLogic(res, role = "logic") {
  const conv =
    res.conversational || buildConversationalPresentation(res, { responsePlan: { intentId: res.responseIntent } });

  const primary = conv.primaryAnswer || res.directAnswer || res.summary || "";
  const insights = (conv.supportingInsights || []).slice(0, 3);
  const followUps = (conv.exploreNext || []).slice(0, 4);

  const limitedBanner =
    res.dataLimited || res.mockData
      ? `<p class="logic-conv-limited">${escapeHtml(LIMITED_DATA_MSG)}</p>`
      : "";

  const insightHtml = insights
    .map(
      (ins) => `<article class="logic-conv-insight" data-insight-id="${escapeHtml(ins.id)}">
      <div class="logic-conv-insight-label">${escapeHtml(ins.label)}</div>
      <p class="logic-conv-insight-text">${escapeHtml(ins.text)}</p>
    </article>`
    )
    .join("");

  const followHtml = followUps.length
    ? `<div class="logic-conv-explore">
      <div class="logic-conv-explore-title">Explore next</div>
      <div class="logic-conv-followups">
        ${followUps
          .map(
            (q) =>
              `<button type="button" class="logic-conv-followup" data-logic-followup="${escapeHtml(q)}">${escapeHtml(q)}</button>`
          )
          .join("")}
      </div>
    </div>`
    : "";

  const meta = [
    res.confidenceLabel || (res.confidence ? `Confidence ${res.confidence}%` : null),
    res.regimeLabel ? `Regime: ${res.regimeLabel}` : null,
    res.dataLimited || res.mockData ? "Partial data" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return `<div class="logic-msg logic-msg--logic logic-msg--conversational">
    <div class="logic-msg-head">
      <span class="logic-msg-role">${role === "user" ? "You" : "Brieftick Logic"}</span>
      ${res.mode ? `<span class="logic-msg-mode">${escapeHtml(res.modeLabel || res.mode)}</span>` : ""}
    </div>
    ${limitedBanner}
    <div class="logic-conv-primary">
      <p class="logic-conv-answer">${escapeHtml(primary)}</p>
    </div>
    ${insightHtml ? `<div class="logic-conv-insights">${insightHtml}</div>` : ""}
    ${followHtml}
    <div class="logic-msg-foot logic-conv-foot">
      <span>${escapeHtml(meta)}</span>
      <span class="logic-msg-sources">${escapeHtml((res.sources || []).slice(0, 4).join(" · "))}</span>
    </div>
    <p class="logic-disclaimer">${escapeHtml(res.disclaimer || LOGIC_DISCLAIMER)}</p>
  </div>`;
}

/**
 * Delegate follow-up chip clicks to submit handler.
 * @param {HTMLElement} root
 * @param {(prompt: string) => void} onFollowUp
 */
export function bindConversationalFollowUps(root, onFollowUp) {
  if (!root || root._logicConvBound) return;
  root._logicConvBound = true;
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-logic-followup]");
    if (!btn || !root.contains(btn)) return;
    e.preventDefault();
    const q = btn.getAttribute("data-logic-followup");
    if (q) onFollowUp(q);
  });
}
