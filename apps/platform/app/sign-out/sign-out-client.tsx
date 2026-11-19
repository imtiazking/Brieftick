'use client';

import { useClerk } from '@clerk/nextjs';
import { useEffect, useRef } from 'react';

const SIGN_IN_URL = process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || '/sign-in';

export function SignOutClient() {
  const { signOut, loaded } = useClerk();
  const started = useRef(false);

  useEffect(() => {
    if (!loaded || started.current) return;
    started.current = true;
    void (async () => {
      try {
        await fetch('/api/sign-out/app-session', { method: 'POST', credentials: 'same-origin' });
      } catch {
        /* cookie clear best-effort */
      }
      await signOut({ redirectUrl: SIGN_IN_URL });
    })();
  }, [loaded, signOut]);

  return (
    <div className="fg-card" style={{ maxWidth: '28rem', margin: '2rem auto' }}>
      <h2>Signing out</h2>
      <p className="fg-muted">Ending your FORGENIQ session…</p>
    </div>
  );
}
