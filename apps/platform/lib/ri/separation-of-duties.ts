/**
 * Segregation of duties — aligned with Design Lab maker/checker rules.
 */
export const SOD = {
  PASS: 'PASS',
  WARNING: 'WARNING',
  BLOCKED: 'BLOCKED',
} as const;

export type SodResult = (typeof SOD)[keyof typeof SOD];

export function checkMakerChecker(params: {
  submitterId: string | null | undefined;
  approverId: string | null | undefined;
  makerCheckerRequired?: boolean;
}): { result: SodResult; message: string } {
  if (!params.makerCheckerRequired) {
    return { result: SOD.PASS, message: 'Maker/checker not required' };
  }
  if (!params.submitterId || !params.approverId) {
    return { result: SOD.PASS, message: 'No submitter recorded' };
  }
  if (params.submitterId !== params.approverId) {
    return { result: SOD.PASS, message: 'Different reviewer' };
  }
  return {
    result: SOD.BLOCKED,
    message:
      'Segregation of duties check — this item requires approval by a different authorised reviewer.',
  };
}

export function assertImpactApproverSoD(params: {
  ownerUserId: string | null | undefined;
  approverUserId: string;
}): void {
  const check = checkMakerChecker({
    submitterId: params.ownerUserId,
    approverId: params.approverUserId,
    makerCheckerRequired: true,
  });
  if (check.result === SOD.BLOCKED) {
    throw new Error('segregation_of_duties');
  }
}
