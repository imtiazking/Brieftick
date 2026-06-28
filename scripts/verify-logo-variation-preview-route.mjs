/**
 * Verify logo variation preview gallery is reachable (HTTP 200 + required content).
 * Usage: node scripts/verify-logo-variation-preview-route.mjs [baseUrl]
 */
const base = (process.argv[2] || "http://localhost:49696").replace(/\/$/, "");
const pageUrl = `${base}/debug/logo-variation-preview/`;

const requiredStrings = [
  "Variation 1",
  "Desktop header",
  "Mobile header",
  "100% zoom",
  "200% zoom",
  "compare__label--current",
  "compare__label--variation",
];

const requiredAssets = [
  "/debug/logo-variation-preview/shots/01-desktop-1440-header-current.png",
  "/debug/logo-variation-preview/shots/01-desktop-1440-header-variation.png",
  "/debug/logo-variation-preview/shots/03-mobile-390-header-current.png",
  "/debug/logo-variation-preview/shots/03-mobile-390-header-variation.png",
  "/debug/logo-variation-preview/shots/01-desktop-1440-current-crop-100pct.png",
  "/debug/logo-variation-preview/shots/01-desktop-1440-variation-crop-200pct.png",
];

async function check(url) {
  const res = await fetch(url, { redirect: "follow" });
  return { url, status: res.status, ok: res.ok, body: res.ok ? await res.text() : "" };
}

const page = await check(pageUrl);
const missing = requiredStrings.filter((s) => !page.body.includes(s));
const assetChecks = await Promise.all(requiredAssets.map((p) => check(`${base}${p}`)));
const badAssets = assetChecks.filter((a) => !a.ok);

const pass = page.ok && missing.length === 0 && badAssets.length === 0;

console.log(JSON.stringify({
  pass,
  pageUrl,
  pageStatus: page.status,
  missingContent: missing,
  failedAssets: badAssets.map((a) => ({ url: a.url, status: a.status })),
}, null, 2));

if (!pass) process.exit(1);
