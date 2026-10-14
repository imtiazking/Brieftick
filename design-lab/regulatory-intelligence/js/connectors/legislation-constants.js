/** Official UK legislation.gov.uk endpoints (verified from rel=alternate / site feeds). */

export const LEGISLATION_CONNECTOR_VERSION = 'LEG-GOVUK-ATOM-1.0';

export const LEGISLATION_ALLOWED_HOSTS = ['www.legislation.gov.uk', 'legislation.gov.uk'];

export const LEGISLATION_AUTHORITY = 'The National Archives';

export const LEGISLATION_USER_AGENT = 'FORGENIQ-Regulatory-Intelligence-Design-Lab/1.0';

/** New/recent legislation (official search feed, sorted by published). */
export const LEGISLATION_NEW_FEED = 'https://www.legislation.gov.uk/new/data.feed';

export const LEGISLATION_UKPGA_FEED = 'https://www.legislation.gov.uk/ukpga/data.feed?sort=published';

export const LEGISLATION_UKSI_FEED = 'https://www.legislation.gov.uk/uksi/data.feed?sort=published';

/**
 * Landscape framework → official legislation.gov.uk path segment (no host).
 * Identifiers confirmed via official data.feed metadata.
 */
export const LEGISLATION_TARGET_MAP = [
  {
    frameworkId: 'FWK-BANK-ACT',
    recordId: 'LEG-UKPGA-2009-21',
    path: 'ukpga/2009/21',
    title: 'Banking Act 2009',
    legislationType: 'UKPGA',
    year: 2009,
    number: '21',
  },
  {
    frameworkId: 'FWK-CCA',
    recordId: 'LEG-UKPGA-1974-39',
    path: 'ukpga/1974/39',
    title: 'Consumer Credit Act 1974',
    legislationType: 'UKPGA',
    year: 1974,
    number: '39',
  },
  {
    frameworkId: 'FWK-INS-ACT',
    recordId: 'LEG-UKPGA-2015-4',
    path: 'ukpga/2015/4',
    title: 'Insurance Act 2015',
    legislationType: 'UKPGA',
    year: 2015,
    number: '4',
  },
  {
    frameworkId: 'FWK-PSR',
    recordId: 'LEG-UKSI-2017-752',
    path: 'uksi/2017/752',
    title: 'Payment Services Regulations 2017',
    legislationType: 'UKSI',
    year: 2017,
    number: '752',
  },
  {
    frameworkId: 'FWK-EMR',
    recordId: 'LEG-UKSI-2011-99',
    path: 'uksi/2011/99',
    title: 'Electronic Money Regulations 2011',
    legislationType: 'UKSI',
    year: 2011,
    number: '99',
  },
  {
    frameworkId: 'FWK-PENS-1995',
    recordId: 'LEG-UKPGA-1995-26',
    path: 'ukpga/1995/26',
    title: 'Pensions Act 1995',
    legislationType: 'UKPGA',
    year: 1995,
    number: '26',
  },
  {
    frameworkId: 'FWK-PENS-2004',
    recordId: 'LEG-UKPGA-2004-35',
    path: 'ukpga/2004/35',
    title: 'Pensions Act 2004',
    legislationType: 'UKPGA',
    year: 2004,
    number: '35',
  },
];

export function canonicalLegislationUrl(path) {
  const clean = path.replace(/^\/+/, '').replace(/\/+$/, '');
  return `https://www.legislation.gov.uk/${clean}`;
}

export function legislationDataFeedUrl(path) {
  const clean = path.replace(/^\/+/, '').replace(/\/+$/, '');
  return `https://www.legislation.gov.uk/${clean}/data.feed`;
}
