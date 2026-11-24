/**
 * Authoritative PS22/9 dates from the FCA publication record.
 * https://www.fca.org.uk/publications/policy-statements/ps22-9-new-consumer-duty
 * PDF cover states "July 2022" only; 29 July 2022 was an unsupported inference.
 */
export const FCA_PS22_9_AUTHORITATIVE_METADATA = {
  fcaReference: 'PS22/9',
  officialTitle: 'A new Consumer Duty',
  subtitle: 'Feedback to CP21/36 and final rules',
  canonicalPublicationPage: 'https://www.fca.org.uk/publications/policy-statements/ps22-9-new-consumer-duty',
  canonicalPdfUrl: 'https://www.fca.org.uk/publication/policy/ps22-9.pdf',
  publicationType: 'policy_statement',
  /** FCA "Policy Statement & Finalised Guidance" / first published. */
  publicationDate: '2022-07-27',
  lastUpdatedOnFcaRecord: '2025-12-03',
  /** Cover text does not state a day-of-month; do not treat July 2022 as 29 July. */
  pdfCoverDateText: 'July 2022',
  priorIncorrectPublicationDate: '2022-07-29',
  priorIncorrectPublicationDateReason: 'Inferred day not present on the FCA publication record or PDF cover.',
  consultationOpened: '2021-12-07',
  consultationClosed: '2022-02-15',
  relatedConsultations: ['CP21/13', 'CP21/36'],
  notThisDocument: ['CP22/09 Dormant Assets scheme'],
  commencement: {
    newAndExistingOpenToSaleOrRenewal: '2023-07-31',
    closedProductsOrServices: '2024-07-31',
    source: 'FCA PS22/9 publication page — Next steps',
  },
  scopeNote:
    'Regulated firms including e-money and payments; retail customer outcomes. Firm-specific applicability is a human review matter.',
  sourcePdfSha256: 'ee1230a9d9dfc378604ea9462568817cf6c1e7702ab38e927027fe08172f637b',
};
