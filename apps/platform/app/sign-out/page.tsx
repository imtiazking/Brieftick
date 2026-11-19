import { SignOutClient } from '@/app/sign-out/sign-out-client';
import { isClerkConfigured } from '@/lib/env';
import { redirect } from 'next/navigation';

export default function SignOutPage() {
  if (!isClerkConfigured()) {
    redirect('/');
  }

  return (
    <main className="fg-main fg-main--centered">
      <SignOutClient />
    </main>
  );
}
