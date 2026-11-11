import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Atomic JSON write: temp file in same directory then rename. */
export function writeCheckpointAtomic(filePath, payload) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(payload, null, 2));
  renameSync(tmp, filePath);
}
