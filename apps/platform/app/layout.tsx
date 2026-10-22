import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { isClerkConfigured } from '@/lib/env';
import './globals.css';

export const metadata: Metadata = {
  title: 'FORGENIQ Platform',
  description: 'Authenticated FORGENIQ application — app.forgeniq.com',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const inner = isClerkConfigured() ? <ClerkProvider>{children}</ClerkProvider> : children;

  return (
    <html lang="en">
      <body>{inner}</body>
    </html>
  );
}
