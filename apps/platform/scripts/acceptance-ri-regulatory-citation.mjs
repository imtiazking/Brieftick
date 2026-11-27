#!/usr/bin/env node
import { normalizeRegulatoryCitation } from '../lib/ri/ai/regulatory-citation.mjs';

let fail = 0;
const check = (id, ok) => (ok ? console.log(`PASS: ${id}`) : (fail++, console.error(`FAIL: ${id}`)));

const pack = {
  provision: { reference: 'CONC 7.20.1R' },
  quotation: { text: 'notify the borrower', page: 95, verified: true },
  effective: { date: '2026-07-15', source: 'instrument_commencement' },
};

const c = normalizeRegulatoryCitation({ sourceSectionIds: ['OBL-1'], claim: 'Impact area' }, { evidencePack: pack });
check('fills quotation from pack', c?.sourceQuotation?.includes('notify'));
check('fills provision reference', c?.provisionReference === 'CONC 7.20.1R');
check('fills effective date', c?.effectiveDate === '2026-07-15');
check('rejects empty', normalizeRegulatoryCitation({}) === null);

process.exit(fail ? 1 : 0);