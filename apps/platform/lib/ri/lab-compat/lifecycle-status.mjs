/** Lab display status → production enum (golden-master mapping). */

export function labObligationStatusToProduction(status) {
  const key = String(status || '').trim().toLowerCase().replaceAll('_', ' ');
  const map = {
    draft: 'DRAFT',
    'in review': 'IN_REVIEW',
    open: 'OPEN',
    'in progress': 'IN_PROGRESS',
    overdue: 'OVERDUE',
    complete: 'COMPLETE',
    historic: 'HISTORIC',
    closed: 'CLOSED',
  };
  return map[key] || String(status || 'DRAFT').toUpperCase().replaceAll(' ', '_');
}

export function labImpactStatusToProduction(status) {
  const map = {
    Draft: 'DRAFT',
    Review: 'IN_REVIEW',
    'Under Review': 'IN_REVIEW',
    'Awaiting Approval': 'IN_REVIEW',
    Approved: 'APPROVED',
    Complete: 'CLOSED',
    Rejected: 'REJECTED',
  };
  return map[status] || status;
}
