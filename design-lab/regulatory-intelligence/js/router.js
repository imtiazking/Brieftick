import { renderView } from './views.js';
import { viewErrorBoundary, viewPageNotFound } from './error-views.js';
import { perfMark, perfMeasure } from './platform/performance.js';
import { telemetry } from './platform/telemetry.js';

/** Must match top-level segments handled in views.js */
const KNOWN_TOP_LEVEL = new Set([
  'dashboard',
  'demo',
  'ingestion',
  'governance',
  'ai-governance',
  'ai-operations',
  'ai-execution',
  'ai-analysis',
  'ai-model',
  'ai-use-case',
  'ai-config',
  'assurance',
  'intake',
  'work',
  'work-queue',
  'notifications',
  'feed',
  'horizon',
  'library',
  'publication',
  'changes',
  'version',
  'applicability',
  'change',
  'assessments',
  'assessment',
  'obligations',
  'obligation',
  'risks',
  'risk',
  'controls',
  'control',
  'policies',
  'policy',
  'actions',
  'action',
  'evidence',
  'calendar',
  'reports',
  'board',
  'audit',
  'admin',
  'approval',
  'attestation',
  'exception',
  'control-test',
  'finding',
  'management-attestation',
  'assurance-pack',
  'board-pack',
  'source-document',
  'landscape',
  'legislation',
  'tpr',
  'basel',
]);

export function isKnownRoute(route) {
  const path = route.replace(/^\//, '').split('/').filter(Boolean)[0] || 'dashboard';
  return KNOWN_TOP_LEVEL.has(path);
}

export function renderViewSafe(route) {
  const ref = `view-${route.replace(/\W/g, '-')}`;
  perfMark(ref);
  try {
    if (!isKnownRoute(route)) {
      return viewPageNotFound(route);
    }
    return renderView(route);
  } catch (err) {
    telemetry.app('error', 'View render failed', { route, message: err?.message });
    return viewErrorBoundary(route, err);
  } finally {
    const timing = perfMeasure(ref);
    if (timing.ms > 800) {
      telemetry.performance('warn', 'Slow view render', { route, ms: timing.ms });
    }
  }
}
