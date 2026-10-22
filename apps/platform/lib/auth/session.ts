import 'server-only';

import { auth } from '@clerk/nextjs/server';
import { isClerkConfigured } from '@/lib/env';

export class AuthRequiredError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

export async function requireUser(): Promise<{ userId: string }> {
  if (!isClerkConfigured()) {
    throw new AuthRequiredError('Clerk is not configured');
  }

  const { userId } = await auth();
  if (!userId) {
    throw new AuthRequiredError();
  }

  return { userId };
}

export async function getOptionalUser(): Promise<{ userId: string } | null> {
  if (!isClerkConfigured()) {
    return null;
  }
  const { userId } = await auth();
  return userId ? { userId } : null;
}
