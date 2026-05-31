/**
 * News globe interaction — 3D canvas Earth (preview / design lab).
 * @module preview/dashboard-news-globe
 */

import { bindNewsGlobeCanvas } from "./dashboard-news-globe-canvas.js";

/**
 * @param {HTMLElement} visual
 * @returns {() => void}
 */
export function bindNewsGlobeInteraction(visual) {
  const stage = visual.querySelector("[data-globe-stage]");
  if (!stage) {
    console.error("[news globe] bind failed — missing stage");
    return () => {};
  }

  const storyId = visual.dataset.visual || "inflation";
  const teardown = bindNewsGlobeCanvas(visual, storyId);

  visual._globeSetStory = (id) => {
    if (visual._globeCanvas) visual._globeCanvas.setStory(id);
  };

  return teardown;
}

/** @alias */
export const bindNewsGlobe = bindNewsGlobeInteraction;
