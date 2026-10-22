/** Map Design Lab regulator labels to canonical REG-* IDs (packages/reference-data). */

export const LAB_REGULATOR_TO_EXTERNAL_KEY = {
  FCA: 'REG-FCA',
  PRA: 'REG-PRA',
  'Bank of England': 'REG-BOE',
  'HM Treasury': 'REG-HMT',
  HMT: 'REG-HMT',
  TPR: 'REG-TPR',
  'The Pensions Regulator': 'REG-TPR',
  Legislation: 'REG-UK-LEG',
  'UK Legislation': 'REG-UK-LEG',
  BIS: 'REG-BIS',
  BCBS: 'REG-BIS',
  'Basel Committee': 'REG-BIS',
};

export function regulatorExternalKeyFromLabLabel(label) {
  if (!label) return null;
  const direct = LAB_REGULATOR_TO_EXTERNAL_KEY[label];
  if (direct) return direct;
  const hit = Object.entries(LAB_REGULATOR_TO_EXTERNAL_KEY).find(([k]) =>
    label.toLowerCase().includes(k.toLowerCase()),
  );
  return hit?.[1] ?? null;
}
