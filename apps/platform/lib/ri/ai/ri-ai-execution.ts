import 'server-only';

/** When not `true`, live provider APIs must not be called (default: disabled). */
export function isRiAiExecutionEnabled(): boolean {
  return process.env.RI_AI_EXECUTION_ENABLED === 'true';
}

export function isRiAiRemoteHealthCheckEnabled(): boolean {
  return process.env.RI_AI_REMOTE_HEALTH_CHECK === '1';
}
