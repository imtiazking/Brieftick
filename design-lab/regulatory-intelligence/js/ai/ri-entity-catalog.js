/**
 * Data-driven RI entity catalogue + approved aliases (Design Lab Ask RI).
 */
import { getSectorById, frameworksForSector, regulatorsForSector } from '../landscape-helpers.js';

const QUERY_STOPWORDS = new Set([
  'what',
  'which',
  'how',
  'many',
  'the',
  'a',
  'an',
  'are',
  'is',
  'there',
  'currently',
  'affect',
  'affected',
  'changes',
  'change',
  'regulatory',
  'regulation',
  'requirements',
  'requirement',
  'developments',
  'development',
  'linked',
  'implementation',
  'compliance',
  'rules',
  'under',
  'in',
  'to',
  'for',
  'and',
  'or',
  'sector',
  'open',
  'obligations',
  'obligation',
  'uk',
  'united',
  'kingdom',
]);

/** Approved aliases → catalogue keys (only entities RI knows). */
const REGULATOR_ALIAS_ENTRIES = [
  { alias: 'pra', regulatorShortNames: ['PRA'], regulatorNameIncludes: ['prudential regulation authority'] },
  { alias: 'prudential regulation authority', regulatorShortNames: ['PRA'], regulatorNameIncludes: ['prudential regulation authority'] },
  { alias: 'boe', regulatorShortNames: ['BoE', 'Bank of England'], regulatorNameIncludes: ['bank of england'] },
  { alias: 'bank of england', regulatorShortNames: ['BoE', 'Bank of England'], regulatorNameIncludes: ['bank of england'] },
  { alias: 'tpr', regulatorShortNames: ['TPR'], regulatorNameIncludes: ['pensions regulator'] },
  { alias: 'the pensions regulator', regulatorShortNames: ['TPR'], regulatorNameIncludes: ['pensions regulator'] },
  { alias: 'fca', regulatorShortNames: ['FCA'], regulatorNameIncludes: ['financial conduct authority'] },
  { alias: 'bis', regulatorShortNames: ['BIS'], regulatorNameIncludes: ['bank for international settlements'] },
  { alias: 'bcbs', regulatorShortNames: ['BCBS', 'BIS'], regulatorNameIncludes: ['basel committee'] },
];

const SOURCE_ALIAS_ENTRIES = [
  { alias: 'basel', match: (s) => /basel|bcbs|bis/i.test(s.label || s.id || '') },
  { alias: 'basel iii', match: (s) => /basel/i.test(s.label || '') },
  { alias: 'basel 3.1', match: (s) => /basel/i.test(s.label || '') },
  { alias: 'bcbs', match: (s) => /bcbs|basel|bis/i.test(s.label || s.id || '') },
  { alias: 'bis', match: (s) => /bis|basel/i.test(s.label || s.id || '') },
];

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

function wordBoundaryIncludes(hay, needle) {
  const n = norm(needle);
  if (!n || n.length < 2) return false;
  const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return re.test(hay);
}

export function buildRiEntityCatalog(state) {
  const sectors = (state.sectors || []).map((s) => ({
    type: 'sector',
    id: s.id,
    slug: s.slug,
    label: s.name,
    tokens: [norm(s.name), norm(s.slug), ...(s.slug || '').split('-')],
  }));

  const regulators = (state.landscapeRegulators || []).map((r) => ({
    type: 'regulator',
    id: r.id,
    label: r.name,
    shortName: r.shortName,
    tokens: [norm(r.name), norm(r.shortName)],
  }));

  const frameworks = (state.regulatoryFrameworks || []).map((f) => ({
    type: 'framework',
    id: f.id,
    label: f.name,
    shortName: f.shortName,
    tokens: [norm(f.name), norm(f.shortName)],
  }));

  const jurisdictions = new Set();
  (state.org?.jurisdictions || []).forEach((j) => jurisdictions.add(norm(j)));
  (state.publications || []).forEach((p) => (p.affectedJurisdictions || []).forEach((j) => jurisdictions.add(norm(j))));
  (state.legislationRecords || []).forEach((l) => {
    if (l.jurisdiction) jurisdictions.add(norm(l.jurisdiction));
  });
  const jurisdictionEntries = [...jurisdictions].filter(Boolean).map((j) => ({
    type: 'jurisdiction',
    id: j,
    label: j,
    tokens: [j],
  }));

  const baselSources = (state.baselPublicationRecords || []).map((b) => ({
    type: 'basel_source',
    id: b.baselRecordId,
    label: b.title || b.baselRecordId,
    tokens: [norm(b.title), norm(b.baselRecordId)],
  }));

  const riSources = (state.riSources || state.sources || []).map((s) => ({
    type: 'ri_source',
    id: s.id,
    label: s.label || s.name || s.id,
    tokens: [norm(s.label), norm(s.name), norm(s.id)],
  }));

  return { sectors, regulators, frameworks, jurisdictions: jurisdictionEntries, baselSources, riSources };
}

function resolveRegulatorByAlias(catalog, aliasEntry) {
  return catalog.regulators.find((r) => {
    if (aliasEntry.regulatorShortNames?.some((sn) => norm(r.shortName) === norm(sn))) return true;
    if (aliasEntry.regulatorNameIncludes?.some((frag) => norm(r.label).includes(frag))) return true;
    return false;
  });
}

export function resolveRegulatorsInQuestion(question, catalog) {
  const lower = norm(question);
  const resolved = [];
  for (const entry of REGULATOR_ALIAS_ENTRIES) {
    if (!wordBoundaryIncludes(lower, entry.alias)) continue;
    const reg = resolveRegulatorByAlias(catalog, entry);
    if (reg && !resolved.some((x) => x.id === reg.id)) {
      resolved.push({ ...reg, aliasApplied: entry.alias });
    }
  }
  for (const r of catalog.regulators) {
    if (wordBoundaryIncludes(lower, r.shortName) || wordBoundaryIncludes(lower, r.label)) {
      if (!resolved.some((x) => x.id === r.id)) resolved.push({ ...r, aliasApplied: null });
    }
  }
  return resolved;
}

export function resolveBaselSourcesInQuestion(question, catalog) {
  const lower = norm(question);
  const hits = [];
  for (const entry of SOURCE_ALIAS_ENTRIES) {
    if (!wordBoundaryIncludes(lower, entry.alias)) continue;
    catalog.baselSources.forEach((s) => {
      if (entry.match(s) && !hits.some((h) => h.id === s.id)) hits.push({ ...s, aliasApplied: entry.alias });
    });
    catalog.riSources.forEach((s) => {
      if (entry.match(s) && !hits.some((h) => h.id === s.id)) hits.push({ ...s, aliasApplied: entry.alias });
    });
  }
  if (/basel|bcbs|bis/i.test(lower) && hits.length === 0 && catalog.baselSources[0]) {
    hits.push({ ...catalog.baselSources[0], aliasApplied: 'basel-family' });
  }
  return hits;
}

export function resolveSectorsInQuestion(question, catalog) {
  const lower = norm(question);
  const resolved = [];
  for (const s of catalog.sectors) {
    const slugPhrase = (s.slug || '').replace(/-/g, ' ');
    if (
      wordBoundaryIncludes(lower, s.label) ||
      wordBoundaryIncludes(lower, slugPhrase) ||
      new RegExp(`\\b${slugPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+sector\\b`, 'i').test(question)
    ) {
      resolved.push(s);
    }
  }
  return resolved;
}

export function resolveFrameworksInQuestion(question, catalog) {
  const lower = norm(question);
  const resolved = [];
  for (const f of catalog.frameworks) {
    const names = [f.label, f.shortName].filter((x) => x && x.length >= 4);
    for (const n of names) {
      if (wordBoundaryIncludes(lower, n) && !resolved.some((x) => x.id === f.id)) {
        resolved.push(f);
      }
    }
  }
  return resolved;
}

export function resolveJurisdictionsInQuestion(question, catalog) {
  const lower = norm(question);
  return catalog.jurisdictions.filter((j) => wordBoundaryIncludes(lower, j.label));
}

/** Phrases after in/under/from that do not resolve to any catalogue entity. */
export function findUnresolvedConstraintPhrases(question, catalog) {
  const unresolved = [];
  const re = /\b(?:in|under|from)\s+([a-z0-9][a-z0-9\s\-/]{2,60}?)(?=\s*(?:sector|requirements?|rules?|regime)?\b|[?.!,]|$)/gi;
  let m;
  while ((m = re.exec(question)) !== null) {
    const phrase = m[1].trim();
    const p = norm(phrase);
    if (!p || QUERY_STOPWORDS.has(p) || p === 'the') continue;
    const inCatalog =
      resolveJurisdictionsInQuestion(phrase, catalog).length > 0 ||
      resolveFrameworksInQuestion(phrase, catalog).length > 0 ||
      resolveRegulatorsInQuestion(phrase, catalog).length > 0 ||
      resolveSectorsInQuestion(phrase, catalog).length > 0;
    if (!inCatalog) unresolved.push(phrase);
  }
  return unresolved;
}

export function evaluateEntityConstraints(state, question) {
  const catalog = buildRiEntityCatalog(state);
  const unresolvedPhrases = findUnresolvedConstraintPhrases(question, catalog);
  const resolved = {
    catalog,
    sectors: resolveSectorsInQuestion(question, catalog),
    regulators: resolveRegulatorsInQuestion(question, catalog),
    frameworks: resolveFrameworksInQuestion(question, catalog),
    jurisdictions: resolveJurisdictionsInQuestion(question, catalog),
    baselSources: resolveBaselSourcesInQuestion(question, catalog),
    unresolvedPhrases,
  };

  const blocking = [];
  unresolvedPhrases.forEach((p) => blocking.push({ kind: 'constraint_phrase', phrase: p }));

  for (const phrase of unresolvedPhrases) {
    if (/\b(mifid|crd|solvency|aifmd|emir|mar)\b/i.test(phrase) && !resolveFrameworksInQuestion(phrase, catalog).length) {
      blocking.push({ kind: 'framework', phrase });
    }
  }

  const authorityRequire = /\bwhat does (?:the )?(.+?) require\b/i.exec(question);
  if (authorityRequire) {
    const authPhrase = authorityRequire[1].trim();
    if (authPhrase.length > 4 && !resolveRegulatorsInQuestion(authPhrase, catalog).length) {
      blocking.push({ kind: 'regulator', phrase: authPhrase });
    }
  }

  for (const s of catalog.sectors) {
    const slugPhrase = (s.slug || '').replace(/-/g, ' ');
    if (wordBoundaryIncludes(question, slugPhrase) && !resolved.sectors.some((x) => x.id === s.id)) {
      blocking.push({ kind: 'sector', phrase: s.slug });
    }
  }

  const sectorExplicitUnknown = /\b([a-z0-9][a-z0-9-]{4,})\s+sector\b/i.exec(question);
  if (sectorExplicitUnknown) {
    const slugGuess = sectorExplicitUnknown[1].toLowerCase();
    const known = catalog.sectors.some((s) => s.slug === slugGuess || norm(s.label) === slugGuess);
    if (!known) blocking.push({ kind: 'sector', phrase: slugGuess });
  }

  const hyphenSectorLike = /\b([a-z0-9][a-z0-9-]{8,})\b[\s\S]{0,40}\bregulatory\b/i.exec(question);
  if (hyphenSectorLike) {
    const slugGuess = hyphenSectorLike[1].toLowerCase();
    const known = catalog.sectors.some((s) => s.slug === slugGuess);
    if (!known) blocking.push({ kind: 'sector', phrase: slugGuess });
  }

  return { ...resolved, blocking, insufficient: blocking.length > 0 };
}

export function sectorRegulatorEvidence(state, sectorId, regulatorId) {
  const sector = getSectorById(state, sectorId);
  const regs = regulatorsForSector(state, sectorId);
  const regulator = regs.find((r) => r.id === regulatorId) || (state.landscapeRegulators || []).find((r) => r.id === regulatorId);
  const frameworks = frameworksForSector(state, sectorId).filter((f) => {
    if (!regulator) return false;
    const auth = norm(f.primaryAuthority);
    return (
      auth.includes(norm(regulator.shortName)) ||
      auth.includes(norm(regulator.name)) ||
      (f.id || '').toLowerCase().includes(norm(regulator.shortName))
    );
  });
  const tprRecords = (state.tprPublicationRecords || []).filter((r) => (r.sectorIds || []).includes(sectorId));
  const obligations = (state.obligations || []).filter((o) => (o.sectorIds || []).includes(sectorId)).slice(0, 8);
  const regulatorOk = regs.some((r) => r.id === regulatorId);
  return { sector, regulatorOk, frameworks, tprRecords, obligations };
}
