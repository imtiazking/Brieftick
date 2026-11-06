let activeCorrelationId = null;

export function beginCorrelation(prefix = 'COR') {
  activeCorrelationId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return activeCorrelationId;
}

export function getCorrelationId() {
  if (!activeCorrelationId) beginCorrelation();
  return activeCorrelationId;
}

export function clearCorrelation() {
  activeCorrelationId = null;
}
