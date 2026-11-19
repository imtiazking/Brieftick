import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { isClerkConfigured } from '@/lib/env';
import { resolveClerkAfterSignInUrl, resolveClerkAfterSignUpUrl } from '@/lib/platform-routing';
import './globals.css';

export const metadata: Metadata = {
  title: 'FORGENIQ Platform',
  description: 'Authenticated FORGENIQ application — app.forgeniq.com',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const inner = isClerkConfigured() ? (
    <ClerkProvider
      signInUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || '/sign-in'}
      signUpUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL || '/sign-up'}
      signInFallbackRedirectUrl={resolveClerkAfterSignInUrl()}
      signUpFallbackRedirectUrl={resolveClerkAfterSignUpUrl()}
    >
      {children}
    </ClerkProvider>
  ) : (
    children
  );

  return (
    <html lang="en">
      <body>{inner}</body>
    </html>
  );
}
