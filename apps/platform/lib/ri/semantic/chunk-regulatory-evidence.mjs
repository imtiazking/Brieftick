import {
  CHUNK_ABSOLUTE_MAX_TOKENS,
  CHUNK_HARD_MAX_TOKENS,
  CHUNK_INDEX_MAX_TOKENS,
  CHUNK_MIN_TARGET_TOKENS,
  CHUNK_TARGET_MAX_TOKENS,
} from './gte-small-config.mjs';

const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z0-9"“])/;

export async function tokenLength(tokenizer, text, { addSpecialTokens = true } = {}) {
  const enc = await tokenizer(String(text || ''), { add_special_tokens: addSpecialTokens });
  const ids = enc.input_ids;
  if (ids?.data) return ids.data.length;
  if (Array.isArray(ids)) return ids.length;
  if (typeof ids?.length === 'number') return ids.length;
  return 0;
}

function splitSentences(text) {
  const parts = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [String(text || '').trim()].filter(Boolean);
}

/**
 * Split text within a single PDF page (never cross pageNumber).
 */
export async function splitPageTextToTokenBudget(tokenizer, text, pageNumber) {
  const pieces = await splitToMaxTokens(tokenizer, text);
  return pieces.map((chunkText, chunkIndex) => ({
    chunkText,
    pageNumber,
    chunkIndexOnPage: chunkIndex,
  }));
}

async function splitToMaxTokens(tokenizer, text) {
  const fullLen = await tokenLength(tokenizer, text, { addSpecialTokens: true });
  if (fullLen <= CHUNK_INDEX_MAX_TOKENS) return [text];

  const sentences = splitSentences(text);
  const out = [];
  let buf = '';
  for (const sentence of sentences) {
    const candidate = buf ? `${buf} ${sentence}` : sentence;
    const len = await tokenLength(tokenizer, candidate, { addSpecialTokens: true });
    if (len <= CHUNK_INDEX_MAX_TOKENS) {
      buf = candidate;
      continue;
    }
    if (buf) out.push(buf);
    const sLen = await tokenLength(tokenizer, sentence, { addSpecialTokens: true });
    if (sLen > CHUNK_INDEX_MAX_TOKENS) {
      const words = sentence.split(/\s+/);
      let wbuf = '';
      for (const w of words) {
        const wc = wbuf ? `${wbuf} ${w}` : w;
        const wlen = await tokenLength(tokenizer, wc, { addSpecialTokens: true });
        if (wlen <= CHUNK_INDEX_MAX_TOKENS) wbuf = wc;
        else {
          if (wbuf) out.push(wbuf);
          wbuf = w;
        }
      }
      if (wbuf) buf = wbuf;
      else buf = '';
    } else {
      buf = sentence;
    }
  }
  if (buf) out.push(buf);
  const finalized = [];
  for (const piece of out) {
    const tok = await tokenLength(tokenizer, piece, { addSpecialTokens: true });
    if (tok <= CHUNK_INDEX_MAX_TOKENS) finalized.push(piece);
    else finalized.push(...(await splitToMaxTokens(tokenizer, piece)));
  }
  return finalized;
}

function publicationStatusFromPack(pack) {
  return pack.regulatoryStatus || pack.publicationType || 'unknown';
}

async function isHeadingLike(tokenizer, text, tokenCount) {
  const t = String(text || '').trim();
  const tok = tokenCount ?? (await tokenLength(tokenizer, t));
  if (tok >= CHUNK_MIN_TARGET_TOKENS) return false;
  if (t.length > 140) return false;
  const sentences = t.split(/[.!?]+/).filter((s) => s.trim().length > 4);
  if (sentences.length > 2) return false;
  if (/^\d+(\.\d+)*\.\s+\S{3,100}$/.test(t)) return true;
  if (tok < 25 && !/[.!?]/.test(t)) return true;
  return tok < 40 && t.split(/\s+/).length <= 14;
}

function isShortLegalProvision(text) {
  return /\b(shall|must|require|prohibition|firm[s]? should|we expect|rules in|Handbook)\b/i.test(text);
}

async function mergeParagraphUnits(tokenizer, units) {
  const out = [];
  let i = 0;
  while (i < units.length) {
    let text = String(units[i] || '').trim();
    if (!text) {
      i += 1;
      continue;
    }
    let tok = await tokenLength(tokenizer, text);
    if ((await isHeadingLike(tokenizer, text, tok)) && i + 1 < units.length) {
      const candidate = `${text}\n\n${String(units[i + 1] || '').trim()}`;
      const ct = await tokenLength(tokenizer, candidate);
      if (ct <= CHUNK_TARGET_MAX_TOKENS) {
        out.push(candidate);
        i += 2;
        continue;
      }
    }
    out.push(text);
    i += 1;
  }
  return out;
}

async function mergeHtmlSamples(samples, tokenizer) {
  const merged = [];
  let i = 0;
  while (i < samples.length) {
    const cur = samples[i];
    let text = String(cur.extractedText || '').trim();
    if (!text) {
      i += 1;
      continue;
    }
    const section = cur.sectionReference;
    let tok = await tokenLength(tokenizer, text);
    let j = i + 1;
    while (tok < CHUNK_MIN_TARGET_TOKENS && j < samples.length) {
      const next = samples[j];
      if (typeof next.pageNumber === 'number') break;
      const nextText = String(next.extractedText || '').trim();
      if (!nextText) {
        j += 1;
        continue;
      }
      const headingLike = await isHeadingLike(tokenizer, text, tok);
      const sameSection = section && next.sectionReference === section;
      if (headingLike || (sameSection && tok < CHUNK_MIN_TARGET_TOKENS)) {
        const candidate = `${text}\n\n${nextText}`;
        const ct = await tokenLength(tokenizer, candidate);
        if (ct <= CHUNK_TARGET_MAX_TOKENS) {
          text = candidate;
          tok = ct;
          j += 1;
          continue;
        }
      }
      break;
    }
    merged.push({ ...cur, extractedText: text });
    i = j > i + 1 ? j : i + 1;
  }
  return merged;
}

function recordShortChunk(stats, tok, text) {
  if (tok < CHUNK_MIN_TARGET_TOKENS) {
    if (!stats.shortChunkExceptions) stats.shortChunkExceptions = 0;
    if (isShortLegalProvision(text)) stats.shortChunkExceptions += 1;
  }
}

/**
 * Build chunks from frozen evidence pack JSON (read-only).
 */
export async function buildChunksFromEvidencePack(pack, tokenizer, stats) {
  const publicationId = pack.publicationId;
  const chunks = [];
  const profile = pack.extractionProfile || pack.profile;
  const meta = {
    publicationId,
    extractionRevisionId: pack.extractionRevisionId,
    publicationTitle: pack.publicationTitle,
    regulator: pack.regulator || 'FCA',
    publicationStatus: publicationStatusFromPack(pack),
    extractionProfile: profile,
    canonicalUrl: pack.canonicalUrl,
    contentSha256: pack.contentSha256,
  };

  const structured = pack.askRiEvidence?.structured;
  if (structured?.pages?.length && structured.pageBoundaryConfirmed) {
    for (const page of structured.pages) {
      const pageNumber = page.pageNumber ?? page.physicalPageIndex;
      const paragraphs = (page.paragraphs || [])
        .map((p) => p.text)
        .filter(Boolean);
      const fallbackText = page.text || '';
      let units = paragraphs.length ? paragraphs : [fallbackText];
      units = await mergeParagraphUnits(tokenizer, units);

      let pageBuffer = '';
      let pageBufferTokens = 0;

      const flushPageBuffer = async () => {
        if (!pageBuffer.trim()) return;
        const split = await splitPageTextToTokenBudget(tokenizer, pageBuffer.trim(), pageNumber);
        for (const part of split) {
          const tok = await tokenLength(tokenizer, part.chunkText, { addSpecialTokens: true });
          if (tok > CHUNK_HARD_MAX_TOKENS) stats.pageBoundaryViolations += 1;
          recordShortChunk(stats, tok, part.chunkText);
          chunks.push({
            ...meta,
            chunkText: part.chunkText,
            physicalPageNumber: pageNumber,
            htmlSectionId: null,
            sectionReference: null,
            documentEvidenceId: null,
            modelTokenCount: tok,
            pageBoundaryViolations: 0,
          });
        }
        pageBuffer = '';
        pageBufferTokens = 0;
      };

      for (const para of units) {
        const candidate = pageBuffer ? `${pageBuffer}\n\n${para}` : para;
        const candidateTokens = await tokenLength(tokenizer, candidate, { addSpecialTokens: true });
        if (candidateTokens <= CHUNK_TARGET_MAX_TOKENS) {
          pageBuffer = candidate;
          pageBufferTokens = candidateTokens;
          continue;
        }
        await flushPageBuffer();
        const paraTokens = await tokenLength(tokenizer, para, { addSpecialTokens: true });
        if (paraTokens <= CHUNK_TARGET_MAX_TOKENS) {
          pageBuffer = para;
          pageBufferTokens = paraTokens;
        } else {
          const split = await splitPageTextToTokenBudget(tokenizer, para, pageNumber);
          for (const part of split) {
            const tok = await tokenLength(tokenizer, part.chunkText, { addSpecialTokens: true });
            if (tok > CHUNK_HARD_MAX_TOKENS) stats.pageBoundaryViolations += 1;
            chunks.push({
              ...meta,
              chunkText: part.chunkText,
              physicalPageNumber: pageNumber,
              modelTokenCount: tok,
            });
          }
        }
      }
      await flushPageBuffer();
    }
    return chunks;
  }

  const htmlSamples = await mergeHtmlSamples(pack.verifiedTextSamples || [], tokenizer);
  for (const sample of htmlSamples) {
    const isPdf = typeof sample.pageNumber === 'number';
    const pageNumber = isPdf ? sample.pageNumber : null;
    const sectionReference = sample.sectionReference || null;
    const text = sample.extractedText || '';
    if (!text.trim()) continue;

    if (isPdf) {
      const split = await splitPageTextToTokenBudget(tokenizer, text, pageNumber);
      for (const part of split) {
        const tok = await tokenLength(tokenizer, part.chunkText, { addSpecialTokens: true });
        if (tok > CHUNK_HARD_MAX_TOKENS) stats.pageBoundaryViolations += 1;
        recordShortChunk(stats, tok, part.chunkText);
        chunks.push({
          ...meta,
          chunkText: part.chunkText,
          physicalPageNumber: pageNumber,
          sectionReference,
          documentEvidenceId: sample.documentEvidenceId,
          modelTokenCount: tok,
        });
      }
    } else {
      const tokFull = await tokenLength(tokenizer, text, { addSpecialTokens: true });
      if (tokFull <= CHUNK_HARD_MAX_TOKENS) {
        recordShortChunk(stats, tokFull, text);
        chunks.push({
          ...meta,
          chunkText: text,
          htmlSectionId: sectionReference,
          sectionReference,
          documentEvidenceId: sample.documentEvidenceId,
          modelTokenCount: tokFull,
        });
      } else {
        const split = await splitSentences(text);
        let buf = '';
        for (const sentence of split) {
          const candidate = buf ? `${buf} ${sentence}` : sentence;
          const len = await tokenLength(tokenizer, candidate, { addSpecialTokens: true });
          if (len <= CHUNK_TARGET_MAX_TOKENS) buf = candidate;
          else {
            if (buf) {
              const tok = await tokenLength(tokenizer, buf, { addSpecialTokens: true });
              chunks.push({
                ...meta,
                chunkText: buf,
                htmlSectionId: sectionReference,
                sectionReference,
                documentEvidenceId: sample.documentEvidenceId,
                modelTokenCount: tok,
              });
            }
            buf = sentence;
          }
        }
        if (buf) {
          const tok = await tokenLength(tokenizer, buf, { addSpecialTokens: true });
          if (tok > CHUNK_HARD_MAX_TOKENS) stats.pageBoundaryViolations += 1;
          chunks.push({
            ...meta,
            chunkText: buf,
            htmlSectionId: sectionReference,
            sectionReference,
            documentEvidenceId: sample.documentEvidenceId,
            modelTokenCount: tok,
          });
        }
      }
    }
  }

  const authoritative = [];
  if (!stats.oversizedChunksRejected) stats.oversizedChunksRejected = 0;
  for (const chunk of chunks) {
    const tok = chunk.modelTokenCount ?? 0;
    if (tok > CHUNK_ABSOLUTE_MAX_TOKENS) {
      stats.pageBoundaryViolations += 1;
      continue;
    }
    if (tok > CHUNK_INDEX_MAX_TOKENS) {
      stats.oversizedChunksRejected += 1;
      continue;
    }
    authoritative.push(chunk);
  }
  return authoritative;
}
