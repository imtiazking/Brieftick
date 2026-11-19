import 'server-only';

import { currentUser } from '@clerk/nextjs/server';
import { loadOrganisationShellContext } from '@/lib/auth/require-organisation';
import type { PlatformRole } from '@/lib/roles';

export type ShellAccountContext = {
  email: string | null;
  organisationId: string | null;
  organisationName: string | null;
  role: PlatformRole | null;
  selectionRequired: boolean;
};

export async function loadShellAccountContext(): Promise<ShellAccountContext | null> {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    null;

  const org = await loadOrganisationShellContext();
  const active = org.active;

  return {
    email,
    organisationId: active?.organisationId ?? null,
    organisationName: active?.organisationName ?? null,
    role: active?.role ?? null,
    selectionRequired: org.selectionRequired,
  };
}
