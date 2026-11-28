import { serveRiskControlsDesignLabSegments } from '@/lib/design-lab-static';

export async function GET() {
  return serveRiskControlsDesignLabSegments([]);
}