'use client';

import { useClerk } from '@clerk/nextjs';
import Link from 'next/link';
import { useEffect } from 'react';

export function SignOutClient() {
  const { signOut } = useClerk();

  useEffect(() => {
    void signOut({ redirectUrl: '/sign-in' });
  }, [signOut]);

  return (
    <main className="fg-main">
      <p>Signing out…</p>
      <p>
        <Link href="/sign-in">Return to sign in</Link>
      </p>
    </main>
  );
}
