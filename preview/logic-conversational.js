/**
 * Conversational Logic render — one primary answer; chips reveal depth on tap only.
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
  const primary = humanizeLogicAnswer(
    conv.primaryAnswer || res.directAnswer || res.summary || "",
    { depth, maxChars: depth === "brief" ? 320 : 480 }
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
            <p class="logic-conv-panel-text">${escapeHtml(humanizeLogicAnswer(c.text, { depth: "standard", maxChars: 420 }))}</p>
          </div>`
          )
          .join("")}
      </div>`
    : "";

  const deepDiveRail =
    role !== "user" && res.deepDiveOpen?.symbol
      ? `<div class="logic-conv-actions" role="group" aria-label="Ticker Deep Dive">
          <button type="button" class="logic-deep-dive-btn" data-logic-deep-dive="${escapeHtml(res.deepDiveOpen.symbol)}">Open Deep Dive</button>
        </div>`
      : "";

  if (role === "user") {
    return `<div class="logic-msg logic-msg--user">
      <p class="logic-msg-summary">${escapeHtml(primary)}</p>
    </div>`;
  }

  return `<div class="logic-msg logic-msg--logic logic-msg--conversational">
    ${limitedBanner}
    <div class="logic-conv-primary">
      <p class="logic-conv-answer">${escapeHtml(primary)}</p>
    </div>
    ${deepDiveRail}
    ${chipRow}
    ${panels}
    <p class="logic-disclaimer logic-conv-disclaimer">${escapeHtml(res.disclaimer || LOGIC_DISCLAIMER)}</p>
  </div>`;
}

/**
 * Chip expand/collapse — one panel open at a time; smooth inline reveal.
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
      p.classList.remove("is-open");
    });
    root.querySelectorAll(".logic-conv-chip").forEach((b) => {
      b.classList.remove("is-active");
      b.setAttribute("aria-expanded", "false");
    });

    if (willShow) {
      panel.hidden = false;
      requestAnimationFrame(() => panel.classList.add("is-open"));
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
