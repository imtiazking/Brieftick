#!/usr/bin/env node
/**
 * Read-only verification of FCA PS26/1 official PDF — Appendix 1 / Annex F / sample CONC rules.
 * Does not ingest; writes verification artefact under docs/eval/regulatory-sources/ (metadata only).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const OFFICIAL_URL = 'https://www.fca.org.uk/publication/policy/ps26-1.pdf';
const CACHE_DIR = join(REPO_ROOT, 'docs/eval/regulatory-sources/cache');
const PDF_PATH = join(CACHE_DIR, 'fca-ps26-1-official.pdf');
const OUT_PATH = join(REPO_ROOT, 'docs/eval/FCA-PS26-1-INSTRUMENT-VERIFICATION.json');

const RULE_MARKERS = ['CONC 4.2A.3R', 'CONC 4.2A.6R', 'CONC 7.20.1R'];
const SECTION_MARKERS = ['Appendix 1', 'Annex F', 'Deferred Payment Credit Instrument 2026', 'FCA 2026/2'];

function sha256File(path) {
  const buf = readFileSync(path);
  return createHash('sha256').update(buf).digest('hex');
}

async function downloadPdf() {
  mkdirSync(CACHE_DIR, { recursive: true });
  if (existsSync(PDF_PATH)) return;
  const res = await fetch(OFFICIAL_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`download_failed_${res.status}`);
  const ab = await res.arrayBuffer();
  writeFileSync(PDF_PATH, Buffer.from(ab));
}

async function main() {
  const notes = [];
  let sourceSha256 = null;
  let textSample = '';
  const pageHints = {};

  try {
    await downloadPdf();
    sourceSha256 = sha256File(PDF_PATH);
    notes.push('Downloaded or reused official PDF from FCA URL');
  } catch (e) {
    notes.push(`PDF download skipped or failed: ${e.message}`);
  }

  if (existsSync(PDF_PATH)) {
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const buf = readFileSync(PDF_PATH);
      const parsed = await pdfParse(buf);
      pageHints.totalPages = parsed.numpages || null;
      const full = String(parsed.text || '');
      textSample = full.slice(0, 2000);

      const pageSize = Math.ceil(full.length / Math.max(1, parsed.numpages || 1));
      const rulePatterns = [
        ...RULE_MARKERS,
        { key: 'CONC 4.2A.6R', pattern: /4\.2A\.6\s*R\b/ },
        ...SECTION_MARKERS,
        'Made rules',
        'Regulation Day',
        '7.20.1R',
        '4.2A.3R',
      ];
      for (const entry of rulePatterns) {
        const marker = typeof entry === 'string' ? entry : entry.key;
        const pattern = typeof entry === 'string' ? entry : entry.pattern;
        const idx =
          typeof pattern === 'string'
            ? full.indexOf(pattern)
            : (pattern.exec(full)?.index ?? -1);
        if (idx >= 0) {
          const approxPage = Math.min(parsed.numpages || 1, Math.max(1, Math.floor(idx / pageSize) + 1));
          pageHints[marker] = [approxPage];
        }
      }

      const appendixIdx = full.search(/Appendix\s*1/i);
      const annexFIdx = full.search(/Annex\s*F/i);
      if (appendixIdx >= 0) pageHints.appendix1ApproxPage = Math.floor(appendixIdx / pageSize) + 1;
      if (annexFIdx >= 0) pageHints.annexFApproxPage = Math.floor(annexFIdx / pageSize) + 1;
    } catch (e) {
      notes.push(`pdf-parse text extraction failed: ${e.message}`);
    }
  }

  const verification = {
    schemaVersion: 'forgeniq.regulatory.ps26-1.verification.v1',
    capturedAt: new Date().toISOString(),
    officialSourceUrl: OFFICIAL_URL,
    instrument: {
      name: 'Deferred Payment Credit Instrument 2026',
      reference: 'FCA 2026/2',
      appendix: 'Appendix 1 — Made rules (legal instrument)',
      annexConcAmendments: 'Annex F — Consumer Credit sourcebook (CONC)',
    },
    authenticity: {
      sourceSha256: sourceSha256,
      cachePathNote: 'docs/eval/regulatory-sources/cache/ (gitignored binary)',
      downloadedFromOfficialFcaHost: Boolean(sourceSha256),
    },
    bindingRulesSample: RULE_MARKERS.map((rule) => ({
      rule,
      pdfPages: pageHints[rule] || [],
      foundInPdf: Boolean(pageHints[rule]?.length),
    })),
    sectionBoundaries: {
      appendix1Pages: pageHints['Appendix 1'] || [],
      annexFPages: pageHints['Annex F'] || [],
      instrumentTitlePages: pageHints['Deferred Payment Credit Instrument 2026'] || [],
    },
    regulatoryCharacterisation: {
      psNarrative: 'Policy statement body — includes guidance and context',
      appendixMadeRules: 'Binding legal instrument text',
      concAnnexF: 'Handbook CONC amendments — binding rules (R) vs guidance (G) per marker',
      phasedCommencement: 'Verify per-rule commencement in instrument — do not assume single date',
    },
    ingestAllowed: false,
    obligationGradeApprovalBypass: false,
    notes,
    textExcerptSha256: textSample ? createHash('sha256').update(textSample, 'utf8').digest('hex') : null,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(verification, null, 2));
  console.log(JSON.stringify({ ok: true, outPath: OUT_PATH, sourceSha256, pageHints, programmePass: false }, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});