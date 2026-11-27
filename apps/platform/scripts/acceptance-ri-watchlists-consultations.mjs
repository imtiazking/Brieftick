#!/usr/bin/env node
/** Watchlist matcher + consultation type helpers (deterministic). */

function obligationMatchesWatchlist(obligation, filters) {
  if (!filters.obligationIds?.length) return null;
  if (!filters.obligationIds.includes(obligation.id)) return null;
  return 'obligation';
}

function publicationMatchesWatchlist(pub, filters) {
  if (filters.obligationIds?.length && !filters.publicationIds?.length && !filters.regulatoryChangeIds?.length) {
    return null;
  }
  if (filters.publicationIds?.length && !filters.publicationIds.includes(pub.id)) return null;
  const regKey = pub.regulator?.external_key;
  if (filters.regulatorKeys?.length && (!regKey || !filters.regulatorKeys.includes(regKey))) return null;
  if (
    filters.publicationTypes?.length &&
    !filters.publicationTypes.some((t) => pub.publication_type?.toLowerCase().includes(t.toLowerCase()))
  ) {
    return null;
  }
  const blob = `${pub.title} ${pub.publication_type}`.toLowerCase();
  if (filters.keywords?.length && !filters.keywords.some((k) => blob.includes(k.toLowerCase()))) return null;
  return regKey ? `Regulator ${regKey}` : 'matched';
}

function isConsultationPublication(publicationType) {
  return /consultation/i.test(String(publicationType || ''));
}

let fail = 0;
const check = (id, ok, detail = '') => {
  if (ok) console.log(`PASS: ${id}`);
  else {
    fail += 1;
    console.error(`FAIL: ${id} ${detail}`);
  }
};

const pub = {
  id: 'p1',
  title: 'BNPL Policy Statement PS26/1',
  publication_type: 'policy_statement_with_instrument',
  regulator: { external_key: 'REG-FCA' },
};

check('regulator filter matches', publicationMatchesWatchlist(pub, { regulatorKeys: ['REG-FCA'] })?.includes('Regulator'));
check('regulator filter rejects', publicationMatchesWatchlist(pub, { regulatorKeys: ['REG-PRA'] }) === null);
check('keyword filter matches', publicationMatchesWatchlist(pub, { keywords: ['bnpl'] }) !== null);
check('consultation type', isConsultationPublication('consultation_paper'));
check('policy statement not consultation', !isConsultationPublication('policy_statement_with_instrument'));
check(
  'obligation-only filter skips publication',
  publicationMatchesWatchlist(pub, { obligationIds: ['ob-1'] }) === null,
);
check('obligation filter matches id', obligationMatchesWatchlist({ id: 'ob-1' }, { obligationIds: ['ob-1'] }) === 'obligation');

process.exit(fail ? 1 : 0);