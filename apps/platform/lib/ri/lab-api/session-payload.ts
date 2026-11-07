import 'server-only';

import type { PlatformRole } from '@/lib/roles';
import { canRi, type RiAction } from '@/lib/ri/permissions';
import {
  buildLabWriteCapabilities,
  resolveLabAnyConnectedWritesEnabled,
  resolveLabChangeWritesEnabled,
} from '@/lib/ri/lab-api/lab-connected-writes';
import {
  isLabAuthorisedUatChangeCreationEnabled,
} from '@/lib/ri/lab-api/change-create-provenance';
import { roleAtLeast } from '@/lib/roles';

const READ_ACTIONS: RiAction[] = [
  'ri:read',
  'triage:read',
  'change:read',
  'impact:read',
  'obligation:read',
  'risk:read',
  'control:read',
  'policy:read',
  'evidence:read',
  'finding:read',
  'assurance:read',
  'action:read',
  'ai:read',
  'ask-ri:read',
  'ingestion:read',
];

export function buildLabSessionPayload(params: {
  userId: string;
  organisationId: string;
  organisationName: string | null;
  role: PlatformRole;
}) {
  const permissions = READ_ACTIONS.filter((action) => canRi(params.role, action));
  const writeCapabilities = buildLabWriteCapabilities(params.role);
  const changeWritesEnabled = writeCapabilities.changeManagement;
  const authorisedUatChangeCreationEnabled =
    changeWritesEnabled &&
    isLabAuthorisedUatChangeCreationEnabled() &&
    roleAtLeast(params.role, 'COMPLIANCE_MANAGER');
  return {
    ok: true,
    userId: params.userId,
    organisationId: params.organisationId,
    organisationName: params.organisationName,
    role: params.role,
    permissions,
    adapterMode: 'api',
    writesEnabled: resolveLabAnyConnectedWritesEnabled(params.role),
    changeWritesEnabled,
    authorisedUatChangeCreationEnabled,
    changeCreateModes: [
      'operational',
      ...(authorisedUatChangeCreationEnabled ? (['uat_authorised'] as const) : []),
    ],
    writeCapabilities,
    dataScopeDefault: 'operational',
    phase: '85d-operational-data-scope',
  };
}
