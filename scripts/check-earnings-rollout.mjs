/**
 * Pre-deploy checks for Earnings production rollout.
 */
const BASE = process.argv[2] || "http://localhost:3099";
const failures = [];
const passes = [];

function pass(m) {
  passes.push(m);
  console.log("PASS:", m);
}
function fail(m, d) {
  failures.push({ m, d });
  console.error("FAIL:", m, d ?? "");
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  return { res, text };
}

async function main() {
  console.log("Base:", BASE);

  const index = await get("/");
  if (!index.res.ok) fail("index.html", index.res.status);
  else pass("index.html loads");

  if (!index.text.includes('id="page-earnings"')) fail("page-earnings missing");
  else pass("page-earnings section present");

  if (!index.text.includes("earn-v2-detail-hero")) fail("earn-v2 UI missing in index");
  else pass("beginner-first earnings UI wired in index");

  if (index.text.includes("Design lab · not production")) fail("design-lab preview label leaked");
  else pass("no design-lab preview chrome");

  if (index.text.includes("Illustrative earnings data")) pass("illustrative disclosure in HTML");
  else fail("illustrative disclosure missing");

  if (index.text.includes('data-route="earnings"')) pass("nav earnings tab present");
  else fail("nav earnings tab missing");

  const css = await get("/styles/earnings-beginner.css");
  if (css.res.ok) pass("earnings-beginner.css");
  else fail("earnings-beginner.css", css.res.status);

  const js = await get("/lib/earnings-beginner.js");
  if (js.res.ok && js.text.includes("mountEarningsPage")) pass("earnings-beginner.js module");
  else fail("earnings-beginner.js", js.res.status);

  const routeJs = await get("/lib/earnings-route.js");
  if (routeJs.res.ok) pass("earnings-route.js");
  else fail("earnings-route.js", routeJs.res.status);

  const earnPath = await get("/earnings");
  if (earnPath.res.ok && earnPath.text.includes("page-earnings")) pass("/earnings rewrite → index");
  else if (earnPath.res.status === 404) fail("/earnings route 404 — check vercel rewrite to /");
  else fail("/earnings route", earnPath.res.status);

  if (!index.text.includes("38% of portfolio NAV")) pass("no hardcoded portfolio NAV in index earnings");
  else fail("hardcoded portfolio stats still in index");

  console.log("\n---", passes.length, "passed,", failures.length, "failed ---");
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
