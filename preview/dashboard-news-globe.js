/**

 * News globe interaction — Three.js intelligence mesh (preview / design lab).

 * @module preview/dashboard-news-globe

 */



/** @returns {boolean} */

function isGlobeStoryDebug() {

  if (typeof globalThis === "undefined") return false;

  if (globalThis.__NEWS_GLOBE_DEBUG__ === true) return true;

  if (typeof location === "undefined") return false;

  return new URLSearchParams(location.search).has("globe-debug");

}



/** @param {string} event @param {Record<string, unknown>} data */

function logGlobeStory(event, data) {

  if (isGlobeStoryDebug()) console.info(`[news-globe] ${event}`, data);

}



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

  let active = true;

  let teardown = () => {};

  /** @type {{ id: string, options?: { intent?: string } } | null} */

  let pendingStory = null;



  const applyGlobeStory = (id, options) => {

    if (visual._globeCanvas?.setStory) {

      visual._globeCanvas.setStory(id, options);

      return;

    }

    pendingStory = { id, options };

    logGlobeStory("setStory:queued", { storyId: id, intent: options?.intent ?? "select" });

  };



  visual._globeSetStory = applyGlobeStory;

  visual._globeFlushPendingStory = () => {

    const id = pendingStory?.id || visual.dataset.visual || storyId;

    const options = pendingStory?.options || { intent: "select" };

    pendingStory = null;

    visual._globeCanvas?.setStory?.(id, options);

  };



  import("./dashboard-news-globe-three.js")

    .then((mod) => {

      if (!active || !visual.isConnected) return;

      return mod.bindNewsGlobeThree(visual, storyId);

    })

    .then((fn) => {

      if (!active) {

        fn?.();

        return;

      }

      if (typeof fn === "function") teardown = fn;

    })

    .catch((err) => {

      console.error("[news globe] bind failed:", err);

    });



  return () => {

    active = false;

    teardown();

    delete visual._globeCanvas;

    delete visual._globeSetStory;

    delete visual._globeFlushPendingStory;

  };

}



/** @alias */

export const bindNewsGlobe = bindNewsGlobeInteraction;


