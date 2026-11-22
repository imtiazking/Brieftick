/**
 * Reviewable provision candidates derived from deterministic inventory (not AI output).
 */
import { parseProvisionReference } from '../classification/provision-eligibility.mjs';
import { PROVISION_TRACKING_STATUS } from '../classification/provision-inventory.mjs';

const MARKER_TO_CODE = { R: 'R', E: 'E', G: 'G', D: 'D', P: 'P', C: 'C', UK: 'UK', EU: 'EU' };

/**
 * @param {import('../classification/provision-inventory.mjs').buildInstrumentProvisionInventory extends Function ? ReturnType<typeof buildInstrumentProvisionInventory> : any} inventory
 * @param {number[]} suppliedCores cores in current batch scope
 * @param {Map<number, string>} pageTextByNumber
 */
export function buildDeterministicProvisionCandidates(inventory, suppliedCores, pageTextByNumber) {
  const cores = new Set(suppliedCores || []);
  if (!cores.size && inventory?.provisions) {
    for (const p of inventory.provisions) {
      if (p.trackingStatus === PROVISION_TRACKING_STATUS.IDENTIFIED) cores.add(p.core);
    }
  }
  const out = [];
  for (const core of [...cores].sort()) {
    const row = inventory.byCore?.get(core);
    if (!row) continue;
    const marker = row.marker;
    const code = MARKER_TO_CODE[marker] ?? null;
    if (!code || !['R', 'E'].includes(code)) continue;
    const pages = row.pages || [];
    const primaryPage = pages[0];
    const text = pages.map((p) => pageTextByNumber.get(p) || '').join('\n');
    const refMatch = text.match(new RegExp(`${core.replace(/\./g, '\\.')}\\s*(R|E|G)`, 'i'));
    const snippetStart = refMatch?.index ?? 0;
    const snippet = text.slice(snippetStart, snippetStart + 480).replace(/\s+/g, ' ').trim();
    if (snippet.length < 40) continue;
    out.push({
      origin: 'deterministic_provision_inventory',
      provisionCore: core,
      provisionReference: row.sourcebook ? `${row.sourcebook} ${core}` : core,
      regulatoryClassificationCode: code,
      pages,
      textStatusByPage: row.textStatusByPage,
      suggestedQuotation: snippet.slice(0, 320),
      trackingStatus: row.trackingStatus,
      aiOmission: row.trackingStatus === PROVISION_TRACKING_STATUS.UNRESOLVED,
    });
  }
  return out;
}

export function mergePageTextsFromBlocks(blocks) {
  const map = new Map();
  for (const b of blocks || []) {
    if (!Number.isInteger(b.pageNumber)) continue;
    map.set(b.pageNumber, `${map.get(b.pageNumber) || ''}\n${b.extractedText || ''}`.trim());
  }
  return map;
}