const TOKEN_RE = /[a-z0-9]+/gi;

function tokens(text) {
  return new Set(String(text || '').toLowerCase().match(TOKEN_RE) || []);
}

function tokenOverlap(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / Math.sqrt(ta.size * tb.size);
}

export function isSubstantivePassage(chunkText, modelTokenCount, { minTokens = 60 } = {}) {
  const text = String(chunkText || '').trim();
  if (modelTokenCount >= minTokens) return { substantive: true, reason: 'token_budget_met' };
  if (text.length < 8) return { substantive: false, reason: 'heading_or_fragment' };
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 8);
  if (sentences.length >= 2) return { substantive: true, reason: 'multi_sentence' };
  if (
    /\b(shall|must|require|prohibition|obligation|firm[s]? should|we expect)\b/i.test(text) &&
    modelTokenCount >= 20
  ) {
    return { substantive: true, reason: 'short_legal_provision' };
  }
  if (modelTokenCount < minTokens && sentences.length <= 1 && text.split(/\s+/).length <= 14) {
    return { substantive: false, reason: 'short_heading_or_label' };
  }
  return { substantive: modelTokenCount >= minTokens / 2, reason: 'borderline_substance' };
}

/**
 * Multi-signal abstention (threshold is advisory, not sole gate).
 */
export function decideRetrievalMatch({
  question,
  referenceValidation,
  rankedPublications,
  topChunks,
  provisionalThreshold,
}) {
  const reasons = [];
  let abstain = false;

  if (referenceValidation?.blockSemanticSelection) {
    abstain = true;
    reasons.push(referenceValidation.abstainReason || 'reference_validation_block');
    return { abstain, reasons, signals: { referenceBlocked: true } };
  }

  const topPub = rankedPublications[0];
  const secondPub = rankedPublications[1];
  const topChunk = topChunks[0];
  const secondChunk = topChunks[1];

  const topSim = topPub?.maxSimilarity ?? topChunk?.similarity ?? 0;
  const marginPub = (topPub?.maxSimilarity ?? 0) - (secondPub?.maxSimilarity ?? 0);
  const marginChunk = (topChunk?.similarity ?? 0) - (secondChunk?.similarity ?? 0);
  const margin = Math.max(marginPub, marginChunk);

  const passageCheck = isSubstantivePassage(
    topChunk?.chunk?.chunkText,
    topChunk?.chunk?.modelTokenCount ?? 0,
  );
  const lexicalQueryPassage = tokenOverlap(question, topChunk?.chunk?.chunkText);
  const lexicalQueryTitle = tokenOverlap(question, topPub?.publicationTitle);

  const restrict = referenceValidation?.restrictToPublicationIds;
  let metadataRelevant = true;
  if (restrict?.length) {
    metadataRelevant = restrict.includes(topPub?.publicationId);
    if (!metadataRelevant) {
      abstain = true;
      reasons.push('semantic_top_publication_outside_reference_restriction');
    }
  }

  const absoluteWeak = topSim < provisionalThreshold * 0.92;
  const marginWeak = margin < 0.015;
  const lexicalWeak = lexicalQueryPassage < 0.08 && lexicalQueryTitle < 0.12;
  const substanceWeak = !passageCheck.substantive;

  if (absoluteWeak && marginWeak) {
    abstain = true;
    reasons.push('low_absolute_similarity_and_margin');
  }
  if (substanceWeak && topSim < provisionalThreshold) {
    abstain = true;
    reasons.push('insubstantive_top_passage_below_threshold');
  }
  if (lexicalWeak && absoluteWeak) {
    abstain = true;
    reasons.push('lexical_semantic_disagreement');
  }

  const signals = {
    absoluteSimilarity: Number(topSim.toFixed(6)),
    margin: Number(margin.toFixed(6)),
    lexicalQueryPassage: Number(lexicalQueryPassage.toFixed(4)),
    lexicalQueryTitle: Number(lexicalQueryTitle.toFixed(4)),
    metadataRelevant,
    passageSubstantive: passageCheck.substantive,
    passageSubstanceReason: passageCheck.reason,
    provisionalThreshold,
    referenceExplicit: Boolean(referenceValidation?.hasExplicitReference),
  };

  return { abstain, reasons, signals, selectedPublication: abstain ? null : topPub, selectedChunk: abstain ? null : topChunk };
}
