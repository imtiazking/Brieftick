#!/usr/bin/env node
/** Locks FCA publication date 2022-07-27 against the incorrect 29 July inference. */
import { FCA_PS22_9_AUTHORITATIVE_METADATA as META } from '../../../integrations/regulatory-sources/catalogue/fca-ps22-9-authoritative-metadata.mjs';

let failed = 0;
const check = (l, ok) => {
  if (!ok) failed += 1;
  console.log(ok ? 'PASS' : 'FAIL', l);
};
check('publication date is 2022-07-27', META.publicationDate === '2022-07-27');
check('open-product commencement 2023-07-31', META.commencement.newAndExistingOpenToSaleOrRenewal === '2023-07-31');
check('closed-product commencement 2024-07-31', META.commencement.closedProductsOrServices === '2024-07-31');
check('29 July recorded as incorrect inference', META.priorIncorrectPublicationDate === '2022-07-29');
if (failed) process.exit(1);
console.log('PASS acceptance-ri-ps22-publication-dates');
