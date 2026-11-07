import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/health(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/design-lab/regulatory-intelligence(.*)',
]);

/** RI Lab JSON APIs — return 401 instead of Clerk page protect rewrite (404 HTML). */
const isRiLabJsonApiRoute = createRouteMatcher(['/api/ri-lab(.*)', '/api/organisation(.*)']);

/** Hosted ingestion cron — CRON_SECRET auth inside route; must bypass Clerk. */
const isHostedSchedulerRoute = createRouteMatcher(['/api/internal/ri-ingestion/scheduler-tick']);

const clerkEnabled =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_') &&
  Boolean(process.env.CLERK_SECRET_KEY?.trim());

const clerkHandler = clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) {
    return;
  }
  if (isHostedSchedulerRoute(request)) {
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
});

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
