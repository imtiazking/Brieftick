import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/health(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/sign-out(.*)',
  '/design-lab/regulatory-intelligence(.*)',
]);

/** RI Lab JSON APIs — return 401 instead of Clerk page protect rewrite (404 HTML). */
const isRiLabJsonApiRoute = createRouteMatcher(['/api/ri-lab(.*)', '/api/organisation(.*)']);

const isSignOutAppSessionRoute = createRouteMatcher(['/api/sign-out/app-session']);

/** Hosted ingestion cron — CRON_SECRET auth inside route; must bypass Clerk. */
const isHostedSchedulerRoute = createRouteMatcher(['/api/internal/ri-ingestion/scheduler-tick']);

const clerkEnabled =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_') &&
  Boolean(process.env.CLERK_SECRET_KEY?.trim());

const candidateHost = process.env.FORGENIQ_CANDIDATE_HOST?.trim() || 'candidate-staging.forgeniq.com';
const officialStagingOrigin = process.env.FORGENIQ_OFFICIAL_STAGING_ORIGIN?.trim() || 'https://staging-app.forgeniq.com';
const candidateSatelliteEnabled = process.env.NEXT_PUBLIC_CLERK_CANDIDATE_SATELLITE === '1';

const clerkHandler = clerkMiddleware(
  async (auth, request) => {
    if (isPublicRoute(request)) {
      return;
    }
    if (isHostedSchedulerRoute(request)) {
      return;
    }
    if (isSignOutAppSessionRoute(request)) {
      return;
    }
    if (isRiLabJsonApiRoute(request)) {
      const { userId } = await auth();
      if (!userId) {
        return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
      }
      return;
    }
    await auth.protect();
  },
  (req) => {
    if (!candidateSatelliteEnabled) return {};
    const host = req.headers.get('host')?.split(':')[0]?.toLowerCase();
    if (host !== candidateHost) return {};
    return {
      isSatellite: true,
      domain: `https://${candidateHost}`,
      signInUrl: `${officialStagingOrigin}/sign-in`,
      signUpUrl: `${officialStagingOrigin}/sign-up`,
      satelliteAutoSync: true,
    };
  },
);

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (!clerkEnabled) {
    return NextResponse.next();
  }
  return clerkHandler(request, event);
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
