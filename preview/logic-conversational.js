/**
 * Conversational Logic render — answer first; chips reveal dormant intelligence on tap.
 * @module preview/logic-conversational
 */

import { buildConversationalPresentation } from "../logic/engines/conversationalPresentation.js";
import { humanizeLogicAnswer } from "../logic/engines/conversationalVoice.js";
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
    res.conversational ||
    buildConversationalPresentation(res, {
      prompt: res._logicPrompt,
      responsePlan: { intentId: res.responseIntent },
      primaryEntity: res.primarySymbol ? { symbol: res.primarySymbol } : undefined,
    });

  const depth = conv.depth || "standard";
  const depthIntent = conv.depthIntent || res.responseDepthIntent;
  const maxChars =
    depth === "brief" ? 280 : depth === "deep" ? 640 : depthIntent === "latest_context" ? 520 : 420;
  const maxSentences = depth === "brief" ? 2 : depth === "deep" ? 6 : 4;
  const primary = humanizeLogicAnswer(
    conv.primaryAnswer || res.directAnswer || res.summary || "",
    { depth, maxChars, maxSentences }
  );
  const chips = (conv.followUpChips || []).slice(0, 6);

  const limitedBanner =
    res.dataLimited || res.mockData
      ? `<p class="logic-conv-limited">${escapeHtml(LIMITED_DATA_MSG)}</p>`
      : "";

  const chipRow = chips.length
    ? `<div class="logic-conv-chips" role="group" aria-label="Explore follow-ups">
        ${chips
          .map(
            (c) =>
              `<button type="button" class="logic-conv-chip" data-logic-chip="${escapeHtml(c.id)}" aria-expanded="false">${escapeHtml(c.label)}</button>`
          )
          .join("")}
      </div>`
    : "";

  const panels = chips.length
    ? `<div class="logic-conv-panels">
        ${chips
          .map(
            (c) =>
              `<div class="logic-conv-panel" data-logic-chip-panel="${escapeHtml(c.id)}" hidden>
            <div class="logic-conv-panel-label">${escapeHtml(c.label)}</div>
            <p class="logic-conv-panel-text">${escapeHtml(humanizeLogicAnswer(c.text, { depth: "standard", maxChars: 480 }))}</p>
          </div>`
          )
          .join("")}
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
    </div>
    ${limitedBanner}
    <div class="logic-conv-primary">
      <p class="logic-conv-answer">${escapeHtml(primary)}</p>
    </div>
    ${chipRow}
    ${panels}
    <div class="logic-msg-foot logic-conv-foot">
      <span>${escapeHtml(meta)}</span>
      <span class="logic-msg-sources">${escapeHtml((res.sources || []).slice(0, 4).join(" · "))}</span>
    </div>
    <p class="logic-disclaimer">${escapeHtml(res.disclaimer || LOGIC_DISCLAIMER)}</p>
  </div>`;
}

/**
 * Chip expand/collapse — dormant layers only; no auto report grid.
 * @param {HTMLElement} root
 */
export function bindConversationalChips(root) {
  if (!root || root._logicConvChipBound) return;
  root._logicConvChipBound = true;
  root.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-logic-chip]");
    if (!chip || !root.contains(chip)) return;
    e.preventDefault();
    const id = chip.getAttribute("data-logic-chip");
    const panel = root.querySelector(`[data-logic-chip-panel="${id}"]`);
    if (!panel) return;

    const willShow = panel.hidden;
    root.querySelectorAll("[data-logic-chip-panel]").forEach((p) => {
      p.hidden = true;
    });
    root.querySelectorAll(".logic-conv-chip").forEach((b) => {
      b.classList.remove("is-active");
      b.setAttribute("aria-expanded", "false");
    });

    if (willShow) {
      panel.hidden = false;
      chip.classList.add("is-active");
      chip.setAttribute("aria-expanded", "true");
      panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
}

/**
 * @param {HTMLElement} root
 * @param {(prompt: string) => void} onFollowUp
 */
export function bindConversationalFollowUps(root, onFollowUp) {
  bindConversationalChips(root);
  if (!onFollowUp) return;
}
