'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="fg-main">
      <h1>Something went wrong</h1>
      <p style={{ color: 'var(--fg-muted)' }}>{error.message || 'An unexpected error occurred.'}</p>
      <button type="button" onClick={() => reset()} style={{ marginTop: '1rem' }}>
        Try again
      </button>
    </main>
  );
}
