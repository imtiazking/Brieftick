/**
 * Verify Variation 2 preview gallery route and assets.
 */
const base = (process.argv[2] || "http://localhost:49696").replace(/\/$/, "");
const pageUrl = `${base}/debug/logo-variation-2-preview/`;

const required = [
  "Variation 2",
  "Desktop header",
  "Mobile header",
  "100% zoom",
  "200% zoom",
  "compare__label--current",
  "compare__label--v2",
];

const assets = [
  "/debug/logo-variation-2-preview/shots/01-desktop-1440-header-current.png",
  "/debug/logo-variation-2-preview/shots/01-desktop-1440-header-variation2.png",
  "/debug/logo-variation-2-preview/forgeniq-wordmark.svg",
];

async function get(url) {
  const res = await fetch(url, { redirect: "follow" });
  return { url, status: res.status, ok: res.ok, text: res.ok ? await res.text() : "" };
}

const page = await get(pageUrl);
const missing = required.filter((s) => !page.text.includes(s));
const badAssets = (await Promise.all(assets.map((p) => get(`${base}${p}`)))).filter((a) => !a.ok);
const pass = page.ok && !missing.length && !badAssets.length;

console.log(JSON.stringify({ pass, pageUrl, pageStatus: page.status, missing, badAssets: badAssets.map((a) => a.url) }, null, 2));
if (!pass) process.exit(1);
