import { serveDesignLabSegments } from '@/lib/design-lab-static';

/** Bare `/design-lab/regulatory-intelligence` — optional catch-all does not always match zero segments on Vercel. */
export async function GET() {
  return serveDesignLabSegments([]);
}
