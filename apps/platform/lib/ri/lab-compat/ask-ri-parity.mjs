/**
 * Compare Design Lab Ask RI retrieval vs production port (same state object).
 */
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const labRoot = join(repoRoot, 'design-lab', 'regulatory-intelligence');
const portRoot = join(repoRoot, 'apps', 'platform', 'lib', 'ri', 'ask-ri');

function primaryIds(ret) {
  const type = ret.requestedTargetType || ret.plan?.primaryTargetType || 'Change';
  const ids = (ret.matchedRecordIdsAll || ret.matchedRecordIds || []).filter(
    (id) => ret.recordTypes[id] === type,
  );
  return [...new Set(ids)].sort();
}

export async function compareAskRiPortVsLab(state, question) {
  const { retrieveRiRecords: labRetrieve } = await import(
    pathToFileURL(join(labRoot, 'js', 'ai', 'ri-retrieval.js')).href,
  );
  const { retrieveRiRecords: portRetrieve } = await import(
    pathToFileURL(join(portRoot, 'port', 'ai', 'ri-retrieval.js')).href,
  );
  const lab = labRetrieve(state, question);
  const port = portRetrieve(state, question);
  const match =
    lab.resultState === port.resultState &&
    primaryIds(lab).join() === primaryIds(port).join();
  return { match, labState: lab.resultState, portState: port.resultState, labIds: primaryIds(lab), portIds: primaryIds(port) };
}
