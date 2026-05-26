/**
 * Portfolio import engine — CSV, XLSX, PDF text, image OCR (preview architecture).
 * @module logic/engines/portfolioImportEngine
 */

import { parsePortfolioPaste, savePortfolioHoldings } from "../portfolioParser.js";
import { logicDebug } from "../shared.js";

/**
 * @typedef {Object} ImportResult
 * @property {boolean} ok
 * @property {import('../portfolioParser.js').ParsedHolding[]} holdings
 * @property {string} [source]
 * @property {string} [message]
 * @property {string[]} [warnings]
 */

/**
 * @param {string} text
 */
function extractSymbolsFromText(text) {
  return parsePortfolioPaste(text);
}

/**
 * Parse CSV / TSV export (IBKR, Vanguard, generic).
 * @param {string} text
 */
export function parsePortfolioCsv(text) {
  const lines = String(text || "").split(/\n+/).filter(Boolean);
  if (!lines.length) return [];

  const header = lines[0].toLowerCase();
  const symIdx = ["symbol", "ticker", "instrument", "code"].findIndex((h) =>
    header.includes(h)
  );
  const qtyIdx = ["quantity", "qty", "shares", "units"].findIndex((h) => header.includes(h));
  const valIdx = ["value", "market value", "amount", "weight", "%"].findIndex((h) =>
    header.includes(h)
  );

  /** @type {import('../portfolioParser.js').ParsedHolding[]} */
  const holdings = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) =>
      c.replace(/^"|"$/g, "").trim()
    );
    if (!cols.length) continue;
    let symbol = cols[symIdx >= 0 ? symIdx : 0]?.toUpperCase().replace(/[^A-Z]/g, "");
    if (!symbol || symbol.length > 5) continue;
    let weight = 0;
    if (valIdx >= 0) weight = parseFloat(cols[valIdx]) || 0;
    else if (qtyIdx >= 0) weight = parseFloat(cols[qtyIdx]) || 0;
    else weight = parseFloat(cols[1]) || 0;
    if (weight > 0) holdings.push({ symbol, weight });
  }

  if (!holdings.length) {
    return extractSymbolsFromText(text);
  }

  const total = holdings.reduce((s, h) => s + h.weight, 0);
  if (total > 0 && total !== 100) {
    const scale = 100 / total;
    for (const h of holdings) h.weight = Math.round(h.weight * scale * 10) / 10;
  }
  return holdings;
}

/**
 * @param {ArrayBuffer} buffer
 */
async function parseXlsxBuffer(buffer) {
  try {
    const mod = await import("https://esm.sh/xlsx@0.18.5");
    const XLSX = mod.default || mod;
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_csv(sheet);
    return parsePortfolioCsv(rows);
  } catch (e) {
    logicDebug("portfolioImportEngine.xlsx", e.message);
    return [];
  }
}

/**
 * @param {ArrayBuffer} buffer
 */
async function parsePdfBuffer(buffer) {
  try {
    const pdfjs = await import("https://esm.sh/pdfjs-dist@4.0.379/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: buffer }).promise;
    let text = "";
    for (let i = 1; i <= Math.min(doc.numPages, 6); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(" ") + "\n";
    }
    return extractSymbolsFromText(text);
  } catch (e) {
    logicDebug("portfolioImportEngine.pdf", e.message);
    return [];
  }
}

/**
 * OCR brokerage screenshot (Robinhood, Fidelity, Trading212-style).
 * @param {Blob} blob
 */
export async function ocrPortfolioImage(blob) {
  try {
    const { createWorker } = await import("https://esm.sh/tesseract.js@5.1.0");
    const worker = await createWorker("eng");
    const {
      data: { text },
    } = await worker.recognize(blob);
    await worker.terminate();
    const holdings = extractSymbolsFromText(text);
    if (!holdings.length) {
      const symMatches = text.match(/\b[A-Z]{1,5}\b/g) || [];
      const uniq = [...new Set(symMatches)].filter((s) => s.length >= 2).slice(0, 12);
      const w = Math.round((100 / Math.max(1, uniq.length)) * 10) / 10;
      return uniq.map((symbol) => ({ symbol, weight: w }));
    }
    return holdings;
  } catch (e) {
    logicDebug("portfolioImportEngine.ocr", e.message);
    return [];
  }
}

/**
 * @param {File} file
 * @returns {Promise<ImportResult>}
 */
export async function importPortfolioFile(file) {
  if (!file) {
    return { ok: false, holdings: [], message: "No file provided" };
  }

  const name = (file.name || "").toLowerCase();
  const type = file.type || "";
  /** @type {string[]} */
  const warnings = [];

  let holdings = [];
  let source = "unknown";

  try {
    if (name.endsWith(".csv") || type.includes("csv") || type.includes("text")) {
      source = "csv";
      const text = await file.text();
      holdings = parsePortfolioCsv(text);
    } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      source = "xlsx";
      holdings = await parseXlsxBuffer(await file.arrayBuffer());
    } else if (name.endsWith(".pdf") || type.includes("pdf")) {
      source = "pdf";
      holdings = await parsePdfBuffer(await file.arrayBuffer());
      if (!holdings.length) warnings.push("PDF parsed with limited text — verify weights.");
    } else if (/\.(png|jpg|jpeg|webp)$/i.test(name) || type.startsWith("image/")) {
      source = "ocr";
      holdings = await ocrPortfolioImage(file);
      warnings.push("Screenshot OCR — confirm symbols and weights.");
    } else {
      const text = await file.text();
      holdings = extractSymbolsFromText(text);
      source = "text";
    }
  } catch (e) {
    return { ok: false, holdings: [], message: e.message || "Import failed" };
  }

  if (!holdings.length) {
    return {
      ok: false,
      holdings: [],
      source,
      message: "Could not extract holdings — try paste format or CSV export.",
      warnings,
    };
  }

  savePortfolioHoldings(holdings);
  logicDebug("portfolioImportEngine", { source, count: holdings.length });

  return {
    ok: true,
    holdings,
    source,
    message: `Imported ${holdings.length} positions from ${source.toUpperCase()}.`,
    warnings,
  };
}

/**
 * Drag-and-drop handler hook.
 * @param {FileList|File[]} files
 */
export async function importPortfolioFiles(files) {
  const file = files?.[0];
  return importPortfolioFile(file);
}

/**
 * Broker sync hook (not implemented).
 */
export function connectBrokerSync(_provider) {
  return { ok: false, reason: "broker_sync_not_enabled_preview" };
}
