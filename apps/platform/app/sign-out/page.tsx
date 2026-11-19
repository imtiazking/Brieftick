import { isClerkConfigured } from '@/lib/env';
import Link from 'next/link';
import { SignOutClient } from './sign-out-client';

export default function SignOutPage() {
  if (!isClerkConfigured()) {
    return (
      <main className="fg-main">
        <p>Clerk is not configured.</p>
        <p><Link href="/">Home</Link></p>
      </main>
    );
  }

  return <SignOutClient />;
}
