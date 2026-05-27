import assert from "node:assert/strict";
import { isConversationalLogicPreview } from "../previewFlags.js";

const origWindow = globalThis.window;

function withWindow(url, fn) {
  globalThis.window = {
    __LOGIC_PREVIEW: undefined,
    location: { search: url.includes("?") ? url.slice(url.indexOf("?")) : "" },
  };
  globalThis.document = {
    documentElement: { classList: { contains: () => false, add: () => {} } },
  };
  try {
    fn();
  } finally {
    globalThis.window = origWindow;
    delete globalThis.document;
  }
}

withWindow("https://x.test/?preview=logic&tab=logic", () => {
  assert.equal(isConversationalLogicPreview(), true);
});

withWindow("https://x.test/?tab=logic", () => {
  assert.equal(isConversationalLogicPreview(), false);
});

withWindow("https://x.test/", () => {
  window.__LOGIC_PREVIEW = true;
  assert.equal(isConversationalLogicPreview(), true);
});

console.log("previewFlags.test.mjs: ok");
