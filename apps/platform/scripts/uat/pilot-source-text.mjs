#!/usr/bin/env node
/**
 * Independent source text for FCA-EVAL-001 quotation checks. Reads the repository's official FCA PS26/1 PDF fixture
 * (same SHA-256 prefix as the staged publication version) and returns per-page text. No network, no database, no AI.
 *
 *   node scripts/uat/pilot-source-text.mjs --pages 94,95,96 [--find "7.20.1"]
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
export const FIXTURE_PDF = join(REPO_ROOT, 'integrations', 'regulatory-sources', 'fixtures', 'fca-ps26-1-official.pdf');
export const STAGED_VERSION_HASH_PREFIX = '2efd6b9051b6f654';

export function normaliseText(text) {
  return String(text ?? '')
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

let cached = null;
export async function loadPdfPages() {
  if (cached) return cached;
  const buf = readFileSync(FIXTURE_PDF);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const pages = [];
  const pdfParse = (await import('pdf-parse')).default;
  await pdfParse(buf, {
    pagerender: async (pageData) => {
      const content = await pageData.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
      let lastY;
      let text = '';
      for (const item of content.items) {
        text += lastY === item.transform[5] || lastY === undefined ? item.str : `\n${item.str}`;
        lastY = item.transform[5];
      }
      pages.push(text);
      return text;
    },
  });
  cached = { sha256, hashMatchesStaged: sha256.startsWith(STAGED_VERSION_HASH_PREFIX), pages };
  return cached;
}

export async function pageText(pageNumber) {
  const { pages } = await loadPdfPages();
  return pages[pageNumber - 1] ?? '';
}

/** True when the quotation (whitespace and punctuation-variant tolerant) appears in the given pages' text. */
export async function quotationFoundOnPages(quotation, pageNumbers) {
  const needle = normaliseText(quotation);
  if (!needle) return { found: false, page: null };
  for (const p of pageNumbers) {
    if (normaliseText(await pageText(p)).includes(needle)) return { found: true, page: p };
  }
  return { found: false, page: null };
}

export async function quotationFoundAnywhere(quotation) {
  const { pages } = await loadPdfPages();
  const needle = normaliseText(quotation);
  if (!needle) return { found: false, page: null };
  for (let i = 0; i < pages.length; i += 1) {
    if (normaliseText(pages[i]).includes(needle)) return { found: true, page: i + 1 };
  }
  return { found: false, page: null };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (n) => {
    const i = args.indexOf(`--${n}`);
    return i >= 0 ? args[i + 1] : null;
  };
  const { sha256, hashMatchesStaged, pages } = await loadPdfPages();
  console.log(JSON.stringify({ sha256Prefix: sha256.slice(0, 16), hashMatchesStaged, pageCount: pages.length }));
  const wanted = (flag('pages') || '').split(',').map(Number).filter(Boolean);
  for (const p of wanted) console.log(`--- page ${p} ---\n${await pageText(p)}`);
  const find = flag('find');
  if (find) {
    for (let i = 0; i < pages.length; i += 1) if (pages[i].includes(find)) console.log(`found "${find}" on page ${i + 1}`);
  }
}
