/** Compare persisted vs requested action status for audit emission (not transition validation). */
export function actionStatusValueEqual(
  persisted: string | null | undefined,
  requested: string | null | undefined,
): boolean {
  return String(persisted ?? '').trim() === String(requested ?? '').trim();
}

export function actionOwnerValueEqual(
  persisted: string | null | undefined,
  requested: string | null | undefined,
): boolean {
  const a = persisted == null || persisted === '' ? null : String(persisted).trim();
  const b = requested == null || requested === '' ? null : String(requested).trim();
  return a === b;
}

export type ActionPatchAuditPlan = {
  emitStatusChanged: boolean;
  emitOwnerAssigned: boolean;
  statusFrom: string | null;
  statusTo: string | null;
  assigneeUserId: string | null;
};

export function planActionPatchAuditEvents(params: {
  existingStatus: string | null | undefined;
  existingOwnerUserId: string | null | undefined;
  requestedStatus?: string | null;
  requestedOwnerUserId?: string | null;
  assignOwnerSelfUserId?: string | null;
}): ActionPatchAuditPlan {
  let emitOwnerAssigned = false;
  let assigneeUserId: string | null = null;

  if (params.assignOwnerSelfUserId) {
    if (!actionOwnerValueEqual(params.existingOwnerUserId, params.assignOwnerSelfUserId)) {
      emitOwnerAssigned = true;
      assigneeUserId = params.assignOwnerSelfUserId;
    }
  } else if (params.requestedOwnerUserId !== undefined && params.requestedOwnerUserId) {
    if (!actionOwnerValueEqual(params.existingOwnerUserId, params.requestedOwnerUserId)) {
      emitOwnerAssigned = true;
      assigneeUserId = params.requestedOwnerUserId;
    }
  }

  let emitStatusChanged = false;
  let statusTo: string | null = null;
  if (params.requestedStatus !== undefined) {
    const parsed = params.requestedStatus ?? params.existingStatus ?? null;
    if (!actionStatusValueEqual(params.existingStatus, parsed)) {
      emitStatusChanged = true;
      statusTo = parsed;
    }
  }

  return {
    emitStatusChanged,
    emitOwnerAssigned,
    statusFrom: params.existingStatus ?? null,
    statusTo: emitStatusChanged ? statusTo : null,
    assigneeUserId: emitOwnerAssigned ? assigneeUserId : null,
  };
}
