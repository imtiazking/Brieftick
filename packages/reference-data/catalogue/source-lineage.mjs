/**
 * Split/supersession notes (IDs are never renamed).
 * @type {Record<string, { splitFrom?: string, relatedSources?: string[], note: string }>}
 */
export const SOURCE_LINEAGE_BY_ID = {
  'SRC-OFAC-REGULATORY-UPDATES': {
    splitFrom: 'SRC-OFAC-SDN-LISTS',
    relatedSources: ['SRC-OFAC-SDN-LISTS'],
    note:
      'Batch 2 recent-actions connectivity moved here (semantic audit). SRC-OFAC-SDN-LISTS retains FC sanctions-data meaning.',
  },
  'SRC-VARA-REGULATORY-UPDATES': {
    splitFrom: 'SRC-VARA-RULEBOOK',
    relatedSources: ['SRC-VARA-RULEBOOK'],
    note: 'VARA /en/news verification remapped from SRC-VARA-RULEBOOK.',
  },
  'SRC-CFPB-REGULATORY-UPDATES': {
    splitFrom: 'SRC-CFPB-RULES',
    relatedSources: ['SRC-CFPB-RULES'],
    note: 'Newsroom RSS remapped from SRC-CFPB-RULES; rules source targets final-rules index.',
  },
};
