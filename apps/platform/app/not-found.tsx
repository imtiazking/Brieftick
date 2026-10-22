import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="fg-shell">
      <main className="fg-main">
        <h1>Page not found</h1>
        <p style={{ color: 'var(--fg-muted)' }}>
          The requested route does not exist on the FORGENIQ platform.
        </p>
        <p>
          <Link href="/">Return home</Link>
        </p>
      </main>
    </div>
  );
}
