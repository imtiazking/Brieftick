/** @deprecated Use logic-preview.js — redirects to Logic preview. */
import { initLogicPreview, isLogicPreview } from "./logic-preview.js";

export function initAgentPreview() {
  initLogicPreview();
}

export { isLogicPreview as isAgentPreview };

if (isLogicPreview()) {
  initLogicPreview();
}
