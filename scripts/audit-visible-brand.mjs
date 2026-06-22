/**
 * Audit user-visible Brieftick/BriefTick/brieftick.com references in HTML/JS strings.
 * Excludes internal identifiers (APIs, storage keys, headers, file paths in src/href).
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SKIP = new Set(["node_modules", ".git", ".cursor", ".vercel", "brand"]);
const EXT = new Set([".html", ".js", ".mjs", ".css", ".md", ".json"]);

const PATTERNS = [
  /\bBrieftick\b/i,
  /\bBriefTick\b/,
  /\bBRIEFTICK\b/,
  /\bbrieftick\.com\b/i,
];

const INTERNAL_LINE =
  /BriefTickAPI|Brieftick[A-Z]|getBrieftick|brieftick[_-]|x-brieftick|forgeniq-build|brieftick-build|brieftick\.com\)|brieftick\.vercel|_briefTick|brieftick:|forgeniq-beta|brieftick-beta|forgeniq-provider|brieftick-provider|brieftick-logo|brieftick-logo-lab|\/brand\/brieftick|href=|src=|content=|name="brieftick|console\.(log|warn)|\/\/|\/\*|\*\/|schema:|package\.json/;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!SKIP.has(ent.name)) walk(p, out);
    } else if (EXT.has(path.extname(ent.name).toLowerCase())) {
      out.push(p);
    }
  }
  return out;
}

const hits = [];
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (INTERNAL_LINE.test(line)) return;
    for (const re of PATTERNS) {
      if (re.test(line)) {
        hits.push({ file: rel, line: i + 1, text: line.trim().slice(0, 160) });
        break;
      }
    }
  });
}

if (hits.length) {
  console.log(JSON.stringify({ count: hits.length, hits }, null, 2));
  process.exit(1);
}
console.log("OK: zero user-visible Brieftick references in audited source strings.");
