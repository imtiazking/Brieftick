import 'server-only';

/** When not `true`, live provider APIs must not be called (default: disabled). */
export function isRiAiExecutionEnabled(): boolean {
  return process.env.RI_AI_EXECUTION_ENABLED === 'true';
}

export function isRiAiRemoteHealthCheckEnabled(): boolean {
  return process.env.RI_AI_REMOTE_HEALTH_CHECK === '1';
}

/** Return HTTP quickly for long UC-RI-005 runs; client polls run status (avoids proxy/client ECONNRESET). */
export function shouldDispatchPublicationAnalysisAsync(useCaseId: string): boolean {
  if (useCaseId !== 'UC-RI-005' || !isRiAiExecutionEnabled()) return false;
  if (process.env.RI_AI_DISPATCH_ASYNC === 'false') return false;
  if (process.env.RI_AI_DISPATCH_ASYNC === 'true') return true;
  return process.env.VERCEL === '1';
}
