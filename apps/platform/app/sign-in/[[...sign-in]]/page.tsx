import { SignIn } from '@clerk/nextjs';
import { isClerkConfigured } from '@/lib/env';
import Link from 'next/link';

export default function SignInPage() {
  if (!isClerkConfigured()) {
    return (
      <main className="fg-main">
        <p>Clerk is not configured. Set keys from <code>.env.example</code> for sign-in.</p>
        <p><Link href="/">Home</Link></p>
      </main>
    );
  }

  return (
    <main className="fg-main" style={{ display: 'flex', justifyContent: 'center' }}>
      <SignIn />
    </main>
  );
}
