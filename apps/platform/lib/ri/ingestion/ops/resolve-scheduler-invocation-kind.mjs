/**
 * Audit-only classification for hosted scheduler ticks (never used for authentication).
 * Vercel Cron: User-Agent vercel-cron/1.0 + x-vercel-cron-schedule (see Vercel Cron Jobs docs).
 * Legacy x-vercel-cron: 1 may appear on operator probes; not sufficient alone for platform proof.
 */

/**
 * @param {Request | { headers: Headers | { get(name: string): string | null } }} request
 * @returns {{
 *   invocationKind: 'VERCEL_CRON' | 'MANUAL_HOSTED',
 *   platformSignals: {
 *     userAgent: string | null,
 *     vercelCronSchedule: string | null,
 *     legacyVercelCronHeader: boolean,
 *     platformCronDetected: boolean,
 *   },
 * }}
 */
export function resolveHostedSchedulerInvocationKind(request) {
  const headers = request.headers;
  const userAgent = headers.get('user-agent')?.trim() || null;
  const vercelCronSchedule = headers.get('x-vercel-cron-schedule')?.trim() || null;
  const legacyVercelCronHeader = headers.get('x-vercel-cron') === '1';

  const platformCronDetected =
    (userAgent && userAgent.toLowerCase().startsWith('vercel-cron/')) ||
    Boolean(vercelCronSchedule) ||
    legacyVercelCronHeader;

  return {
    invocationKind: platformCronDetected ? 'VERCEL_CRON' : 'MANUAL_HOSTED',
    platformSignals: {
      userAgent: userAgent ? userAgent.slice(0, 80) : null,
      vercelCronSchedule,
      legacyVercelCronHeader,
      platformCronDetected,
    },
  };
}
