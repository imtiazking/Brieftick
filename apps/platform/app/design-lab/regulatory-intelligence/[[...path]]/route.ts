import { serveDesignLabSegments } from '@/lib/design-lab-static';

type Params = { params: Promise<{ path?: string[] }> };

export async function GET(_request: Request, { params }: Params) {
  const { path: segments } = await params;
  return serveDesignLabSegments(segments);
}
