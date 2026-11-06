/**
 * Regulatory assurance — derived coverage, opinions, health, board signals (DEMO, deterministic).
 */
import { filterByScenario } from './relationships.js';
import { DEMO_TODAY, daysBetween, parseDemoDate, personName, getPerson, isCompleteStatus, slaStatus } from './workflow-helpers.js';
import { getEvidenceAssuranceStatus, getAttestationsForEntity, getClosureReadiness } from './governance-helpers.js';

export const ASSURANCE_RATINGS = [
  { id: 'fully-implemented', label: 'Fully Implemented', description: 'Obligations implemented with adequate evidence and no material open findings.' },
  { id: 'substantially-implemented', label: 'Substantially Implemented', description: 'Core implementation complete; limited residual gaps or observations.' },
  { id: 'partially-implemented', label: 'Partially Implemented', description: 'Material implementation or evidence gaps remain.' },
  { id: 'material-gaps', label: 'Material Gaps', description: 'Significant control, evidence or remediation gaps.' },
  { id: 'not-assured', label: 'Not Assured', description: 'Assurance review not complete or insufficient basis for conclusion.' },
];

export const FINDING_CATEGORIES = [
  'Evidence Gap',
  'Control Design',
  'Control Operating Effectiveness',
  'Governance',
  'Policy Gap',
  'Implementation Delay',
  'Incomplete Obligation Mapping',
  'Data / MI',
  'Documentation',
  'Ownership',
];

export const DELTA_CLASS = ['New', 'Improved', 'Deteriorated', 'Resolved', 'No Material Change'];

export function ratingLabel(ratingIdOrLabel) {
  const r = ASSURANCE_RATINGS.find((x) => x.id === ratingIdOrLabel || x.label === ratingIdOrLabel);
  return r?.label || ratingIdOrLabel || 'Not Assured';
}

export function getAssuranceMethodology(state, id) {
  return (state.assuranceMethodologies || []).find((m) => m.id === id);
}

export function getAssuranceReview(state, id) {
  return (state.assuranceReviews || []).find((r) => r.id === id);
}

export function getAssuranceReviewsForEntity(state, entityType, entityId) {
  return (state.assuranceReviews || []).filter((r) => r.entityType === entityType && r.entityId === entityId);
}

export function getFindingsForReview(state, reviewId) {
  return (state.assuranceFindings || []).filter((f) => f.assuranceReviewId === reviewId);
}

export function getFindingsForEntity(state, entityType, entityId) {
  return (state.assuranceFindings || []).filter((f) => f.entityType === entityType && f.entityId === entityId);
}

export function getManagementAttestation(state, id) {
  return (state.managementAttestations || []).find((a) => a.id === id);
}

export function getAssurancePack(state, id) {
  return (state.assurancePacks || []).find((p) => p.id === id);
}

export function getBoardPack(state, id) {
  return (state.boardPacks || []).find((p) => p.id === id);
}

export function getReportingPeriod(state, id) {
  return (state.reportingPeriods || []).find((p) => p.id === id);
}

export function getCurrentReportingPeriod(state) {
  return (state.reportingPeriods || []).find((p) => p.status === 'Current') || (state.reportingPeriods || [])[0];
}

export function getPreviousReportingPeriod(state) {
  const cur = getCurrentReportingPeriod(state);
  if (!cur?.previousPeriodId) {
    return (state.reportingPeriods || []).find((p) => p.status === 'Closed') || null;
  }
  return getReportingPeriod(state, cur.previousPeriodId);
}

/** @returns {'Independent'|'Independence Warning'|'Independence Conflict'} */
export function getIndependenceStatus(state, review) {
  if (!review?.independentReview) return { status: 'Independence Warning', message: 'Self-assessment — not independent assurance' };
  const entity = resolveEntity(state, review.entityType, review.entityId);
  const ownerId = entity?.ownerId || entity?.accountableExecutiveId;
  const implOwner =
    review.entityType === 'Regulatory Change'
      ? state.changes.find((c) => c.id === review.entityId)?.ownerId
      : ownerId;
  if (review.reviewerId && implOwner && review.reviewerId === implOwner) {
    return { status: 'Independence Conflict', message: 'Reviewer is the implementation owner — independent assurance required.' };
  }
  const actions = (state.actions || []).filter((a) => a.ownerId === review.reviewerId && a.sourceId === review.entityId);
  if (actions.length && review.assuranceLine !== 'Third Line') {
    return { status: 'Independence Warning', message: 'Reviewer owns implementation actions on this entity.' };
  }
  if (review.assuranceLine === 'Third Line' && review.reviewerTeamId === 'team-compliance' && review.reviewerId === implOwner) {
    return { status: 'Independence Conflict', message: 'Internal Audit must use a different reviewer.' };
  }
  return { status: 'Independent', message: 'Reviewer is independent of implementation ownership.' };
}

function resolveEntity(state, entityType, entityId) {
  const map = {
    'Regulatory Change': () => state.changes.find((c) => c.id === entityId),
    Obligation: () => state.obligations.find((o) => o.id === entityId),
    Control: () => state.controls.find((c) => c.id === entityId),
  };
  return map[entityType]?.() || null;
}

export function getObligationCoverage(state, obligationId) {
  const o = state.obligations.find((x) => x.id === obligationId);
  if (!o) return null;
  const policies = (o.policyIds || []).map((id) => state.policies.find((p) => p.id === id)).filter(Boolean);
  const controls = (o.controlIds || []).map((id) => state.controls.find((c) => c.id === id)).filter(Boolean);
  const actions = (o.actionIds || []).map((id) => state.actions.find((a) => a.id === id)).filter(Boolean);
  const evidence = (o.evidenceIds || []).map((id) => state.evidence.find((e) => e.id === id)).filter(Boolean);

  const checks = {
    policy: { ok: policies.length > 0, label: 'Policy coverage', detail: policies.length ? policies.map((p) => p.id).join(', ') : 'No policy mapped' },
    control: { ok: controls.length > 0, label: 'Control coverage', detail: controls.length ? controls.map((c) => c.id).join(', ') : 'No control mapped' },
    controlEffectiveness: {
      ok: controls.length > 0 && controls.every((c) => ['Effective', 'Current'].includes(c.effectivenessStatus || c.effectiveness)),
      label: 'Control effectiveness',
      detail: controls.map((c) => `${c.id}: ${c.effectivenessStatus || c.effectiveness || 'Not tested'}`).join('; ') || '—',
    },
    evidence: {
      ok: evidence.some((e) => getEvidenceAssuranceStatus(e) === 'Accepted'),
      label: 'Evidence coverage',
      detail: evidence.length ? evidence.map((e) => `${e.id}: ${getEvidenceAssuranceStatus(e)}`).join('; ') : 'Evidence missing',
    },
    implementation: {
      ok: actions.length === 0 || actions.every((a) => a.status === 'Complete'),
      label: 'Implementation actions',
      detail: actions.map((a) => `${a.id}: ${a.status}`).join('; ') || 'No actions required',
    },
    assurance: {
      ok: hasAssuranceForObligation(state, o),
      label: 'Assurance performed',
      detail: hasAssuranceForObligation(state, o) ? 'Assurance review on record' : 'Assurance not yet performed',
    },
  };

  const gaps = [];
  if (!checks.policy.ok) gaps.push('No Policy mapped');
  if (!checks.control.ok) gaps.push('No Control mapped');
  if (checks.control.ok && !checks.controlEffectiveness.ok) gaps.push('Control ineffective');
  if (!checks.evidence.ok) {
    if (evidence.some((e) => getEvidenceAssuranceStatus(e) === 'Expired')) gaps.push('Evidence expired');
    else gaps.push('Evidence missing');
  }
  if (!checks.implementation.ok) gaps.push('Action overdue');
  if (!checks.assurance.ok && o.priority === 'High') gaps.push('Assurance overdue');

  const scores = {
    policy: checks.policy.ok ? 100 : 0,
    controls: checks.control.ok ? (checks.controlEffectiveness.ok ? 100 : 60) : 0,
    evidence: checks.evidence.ok ? 100 : evidence.length ? 40 : 0,
    assurance: checks.assurance.ok ? 100 : o.priority === 'High' ? 50 : 100,
    implementation: checks.implementation.ok ? 100 : 50,
  };
  const overall = Math.round(
    (scores.policy + scores.controls + scores.evidence + scores.assurance + scores.implementation) / 5
  );

  let coverageStatus = 'Not Assessed';
  if (gaps.length === 0 && checks.policy.ok && checks.control.ok) coverageStatus = 'Complete';
  else if (gaps.some((g) => g.includes('No Policy') || g.includes('No Control'))) coverageStatus = 'Gap Identified';
  else if (gaps.length) coverageStatus = 'Partial';

  return { obligationId, checks, gaps, scores, overallCoverageIndicator: overall, coverageStatus };
}

function hasAssuranceForObligation(state, obligation) {
  const chId = obligation.changeId;
  const reviews = (state.assuranceReviews || []).filter(
    (r) =>
      (r.entityType === 'Obligation' && r.entityId === obligation.id) ||
      (r.changeId === chId && ['Complete', 'Closed'].includes(r.reviewStatus))
  );
  return reviews.some((r) => r.reviewStatus === 'Complete' || r.reviewStatus === 'Closed');
}

export function getEvidenceCoverage(state, entityType, entityId) {
  let required = [];
  let available = [];
  if (entityType === 'Regulatory Change') {
    const ch = state.changes.find((c) => c.id === entityId);
    required = ch?.linkedEvidenceIds || [];
    const obls = state.obligations.filter((o) => o.changeId === entityId);
    obls.forEach((o) => required.push(...(o.evidenceIds || [])));
    required = [...new Set(required)];
    available = required.map((id) => state.evidence.find((e) => e.id === id)).filter(Boolean);
  } else if (entityType === 'Obligation') {
    const o = state.obligations.find((x) => x.id === entityId);
    required = o?.evidenceIds || [];
    available = required.map((id) => state.evidence.find((e) => e.id === id)).filter(Boolean);
  } else if (entityType === 'Control') {
    const tests = (state.controlTests || []).filter((t) => t.controlId === entityId);
    required = [...new Set(tests.flatMap((t) => t.evidenceIds || []))];
    available = required.map((id) => state.evidence.find((e) => e.id === id)).filter(Boolean);
  }

  const accepted = available.filter((e) => getEvidenceAssuranceStatus(e) === 'Accepted');
  const expired = available.filter((e) => getEvidenceAssuranceStatus(e) === 'Expired');
  const rejected = available.filter((e) => e.reviewStatus === 'Rejected' || e.approvalStatus === 'Rejected');
  const gaps = required.filter((id) => !available.find((e) => e.id === id));
  gaps.push(...available.filter((e) => !['Accepted'].includes(getEvidenceAssuranceStatus(e)) && getEvidenceAssuranceStatus(e) !== 'Expired').map((e) => e.id));

  return { required, available, accepted, expired, rejected, gaps: [...new Set(gaps)] };
}

/** @returns {{ status: string, dimensions: object }} */
export function getEvidenceQuality(state, evidence) {
  if (!evidence) return { status: 'Insufficient', dimensions: {} };
  const assurance = getEvidenceAssuranceStatus(evidence);
  const dimensions = {
    relevance: evidence.obligationId || evidence.controlId ? 'Relevant' : 'Unclear',
    currency: assurance === 'Expired' ? 'Expired' : assurance === 'Review Due' ? 'Review due' : 'Current',
    completeness: evidence.fileName ? 'Complete' : 'Incomplete',
    independentReview: evidence.reviewStatus === 'Accepted' && evidence.reviewerId !== evidence.uploadedById ? 'Yes' : 'Pending',
    traceability: evidence.publicationId || evidence.obligationId ? 'Traceable' : 'Limited',
  };
  let status = 'Insufficient';
  if (assurance === 'Expired') status = 'Expired';
  else if (assurance === 'Accepted') status = dimensions.independentReview === 'Yes' ? 'Sufficient' : 'Sufficient with Observations';
  else if (assurance === 'Review Due') status = 'Sufficient with Observations';
  return { status, dimensions };
}

export function getEvidenceAgeing(evidence) {
  const st = getEvidenceAssuranceStatus(evidence);
  if (st === 'Expired') return 'Expired';
  if (st === 'Review Due') return 'Review Due';
  return 'Current';
}

export function getControlAssurance(state, controlId) {
  const c = state.controls.find((x) => x.id === controlId);
  if (!c) return null;
  const tests = (state.controlTests || []).filter((t) => t.controlId === controlId);
  const latest = tests.sort((a, b) => (b.testDate || '').localeCompare(a.testDate || ''))[0];
  const findings = (state.assuranceFindings || []).filter((f) => f.entityType === 'Control' && f.entityId === controlId && f.status !== 'Closed');
  let label = 'Not Assured';
  const eff = c.effectivenessStatus || c.effectiveness;
  if (!latest) label = 'Not Assured';
  else if (latest.result === 'Fail' || eff === 'Ineffective' || eff === 'Partially Effective') label = 'Weak';
  else if (latest.result === 'Pass with Observations' || findings.length) label = 'Effective with Observations';
  else if (latest.result === 'Pass' || eff === 'Effective') label = 'Effective';
  return { controlId, designStatus: c.designStatus || 'Designed', latestTest: latest, findings, assuranceLabel: label, nextTestDate: c.nextReviewDate };
}

export function getImplementationHealth(state, changeId) {
  const ch = state.changes.find((c) => c.id === changeId);
  if (!ch) return { status: 'On Track', statusCode: 'green', reasons: [] };
  const reasons = [];
  const findings = getFindingsForEntity(state, 'Regulatory Change', changeId).filter((f) => f.status !== 'Closed');
  const highOverdue = findings.filter((f) => ['High', 'Critical'].includes(f.severity) && f.dueDate && daysBetween(DEMO_TODAY, f.dueDate) < 0);
  if (highOverdue.length) reasons.push('Critical/High finding overdue');

  const obls = state.obligations.filter((o) => o.changeId === changeId);
  const ctrlIds = [...new Set(obls.flatMap((o) => o.controlIds || []))];
  const weakCtrl = ctrlIds.some((id) => {
    const ca = getControlAssurance(state, id);
    return ca?.assuranceLabel === 'Weak';
  });
  if (weakCtrl) reasons.push('Required control ineffective');

  const acts = state.actions.filter((a) => obls.some((o) => (o.actionIds || []).includes(a.id)));
  const effPassed = ch.effectiveDate && daysBetween(DEMO_TODAY, ch.effectiveDate) < 0;
  const openActs = acts.filter((a) => a.status !== 'Complete');
  if (effPassed && openActs.length) reasons.push('Effective date passed with incomplete actions');

  if (reasons.length) return { status: 'Material Concern', statusCode: 'red', reasons };

  const mediumOpen = findings.filter((f) => f.severity === 'Medium' && f.status === 'Open');
  if (mediumOpen.length) reasons.push('Medium assurance finding open');
  const evCov = getEvidenceCoverage(state, 'Regulatory Change', changeId);
  if (evCov.expired.length) reasons.push('Expired evidence');
  if (openActs.some((a) => slaStatus(a.dueDate, false) === 'Overdue')) reasons.push('Implementation action overdue');
  const exc = (state.governanceExceptions || []).filter((e) => acts.some((a) => a.id === e.entityId) && e.status === 'Approved');
  if (exc.length) reasons.push('Open exception');

  if (reasons.length) return { status: 'Attention Required', statusCode: 'amber', reasons };
  return { status: 'On Track', statusCode: 'green', reasons: [] };
}

export function getResidualConcern(state, changeId) {
  const health = getImplementationHealth(state, changeId);
  const review = (state.assuranceReviews || []).find((r) => r.changeId === changeId && r.reviewStatus === 'Complete');
  if (review?.residualConcern) return review.residualConcern;
  if (health.status === 'Material Concern') return 'High';
  if (health.status === 'Attention Required') return 'Medium';
  return 'Low';
}

export function getAssuranceLayers(state, changeId) {
  const reviews = (state.assuranceReviews || []).filter((r) => r.changeId === changeId || (r.entityType === 'Regulatory Change' && r.entityId === changeId));
  const mgmt = reviews.find((r) => r.assuranceType === 'Management Self-Assessment');
  const second = reviews.find((r) => r.assuranceLine === 'Second Line' && r.independentReview);
  const third = reviews.find((r) => r.assuranceLine === 'Third Line');
  const ch = state.changes.find((c) => c.id === changeId);
  return {
    management: mgmt?.assuranceRating ? ratingLabel(mgmt.assuranceRating) : ch?.implementationAssuranceRating || 'Not stated',
    complianceAssurance: second?.assuranceRating ? ratingLabel(second.assuranceRating) : 'Not yet reviewed',
    internalAudit: third?.reviewStatus === 'Complete' ? ratingLabel(third.assuranceRating) : 'Not Reviewed',
    reviews: { mgmt, second, third },
  };
}

export function getAssuranceVariance(state, changeId) {
  const layers = getAssuranceLayers(state, changeId);
  const order = ['Not Assured', 'Material Gaps', 'Partially Implemented', 'Substantially Implemented', 'Fully Implemented', 'Not stated', 'Not yet reviewed', 'Not Reviewed'];
  const norm = (s) => order.indexOf(s) >= 0 ? order.indexOf(s) : -1;
  const m = norm(layers.management);
  const c = norm(layers.complianceAssurance);
  if (c < 0 || m < 0) return { variance: 'Aligned', detail: 'Insufficient independent assurance to compare' };
  const diff = m - c;
  if (diff >= 2) return { variance: 'Material Variance', detail: 'Management assessment is materially more positive than independent assurance.' };
  if (diff === 1) return { variance: 'Minor Variance', detail: 'Management and independent assurance differ slightly.' };
  if (diff <= -1) return { variance: 'Minor Variance', detail: 'Independent assurance is more positive than management self-assessment.' };
  return { variance: 'Aligned', detail: 'Management and independent assurance are aligned.' };
}

export function getAssuranceStaleness(state, reviewOrChangeId) {
  const review =
    typeof reviewOrChangeId === 'string'
      ? (state.assuranceReviews || []).find((r) => r.id === reviewOrChangeId) ||
        (state.assuranceReviews || []).find((r) => r.changeId === reviewOrChangeId && r.reviewStatus === 'Complete')
      : reviewOrChangeId;
  const ch = review?.changeId ? state.changes.find((c) => c.id === review.changeId) : null;
  if (ch?.governanceReviewRequired || ch?.reanalysisRequired) return { status: 'Stale', reason: 'Source or governance update requires assurance refresh' };
  if (review?.stalenessStatus) return { status: review.stalenessStatus, reason: review.stalenessReason || '' };
  const openHigh = (state.assuranceFindings || []).filter(
    (f) => f.changeId === review?.changeId && ['High', 'Critical'].includes(f.severity) && f.status !== 'Closed'
  );
  if (openHigh.length) return { status: 'Review Due', reason: 'Material open findings' };
  if (review?.nextReviewDate && daysBetween(DEMO_TODAY, review.nextReviewDate) <= 0) {
    return { status: 'Review Due', reason: 'Scheduled review date reached' };
  }
  return { status: 'Current', reason: '' };
}

export function getAssuranceOpinion(state, reviewId) {
  const r = getAssuranceReview(state, reviewId);
  if (!r) return null;
  return {
    overallRating: ratingLabel(r.assuranceRating),
    conclusion: r.assuranceOpinion,
    scope: r.scope,
    evidenceReviewed: (r.evidenceIds || []).map((id) => state.evidence.find((e) => e.id === id)).filter(Boolean),
    controlsReviewed: (r.controlTestIds || []).map((id) => state.controlTests.find((t) => t.id === id)).filter(Boolean),
    keyFindings: getFindingsForReview(state, reviewId),
    exceptions: (r.exceptionIds || []).map((id) => state.governanceExceptions.find((e) => e.id === id)).filter(Boolean),
    residualConcerns: r.residualConcern,
    reviewer: personName(state, r.reviewerId),
    reviewDate: r.reviewCompletedAt?.slice(0, 10) || r.reviewStartedAt?.slice(0, 10),
    nextReviewDate: r.nextReviewDate,
    methodology: getAssuranceMethodology(state, r.methodologyId),
  };
}

export function getAssurancePackCompleteness(state, packId) {
  const pack = getAssurancePack(state, packId);
  if (!pack) return null;
  const sections = pack.completeness || {};
  const keys = Object.keys(sections);
  const vals = keys.map((k) => sections[k]);
  const pct = vals.length ? Math.round((vals.filter((v) => v === 'Complete').length / vals.length) * 100) : 0;
  const partial = vals.some((v) => v === 'Partial');
  const overall = partial ? Math.max(pct - 8, pct) : pct;
  return { sections, packCompleteness: overall, packStatus: pack.packStatus };
}

export function getAssuranceStatusForChange(state, changeId) {
  const reviews = (state.assuranceReviews || []).filter((r) => r.changeId === changeId || (r.entityId === changeId && r.entityType === 'Regulatory Change'));
  const primary = reviews.find((r) => r.assuranceType === 'Regulatory Change Implementation Assurance' && r.independentReview) || reviews[0];
  const staleness = primary ? getAssuranceStaleness(state, primary) : { status: 'Not Assessed', reason: '' };
  return {
    implementationHealth: getImplementationHealth(state, changeId),
    reviewStatus: primary?.reviewStatus || 'Not started',
    assuranceRating: primary ? ratingLabel(primary.assuranceRating) : 'Not Assured',
    reviewer: primary ? personName(state, primary.reviewerId) : '—',
    residualConcern: getResidualConcern(state, changeId),
    layers: getAssuranceLayers(state, changeId),
    variance: getAssuranceVariance(state, changeId),
    staleness,
    primaryReviewId: primary?.id,
    packId: (state.assurancePacks || []).find((p) => p.changeId === changeId)?.id,
  };
}

export function getBoardAttentionItems(state, scenarioId) {
  const sid = scenarioId || state.scenarioId;
  const items = [];
  filterByScenario(state.changes, sid)
    .filter((c) => c.materiality === 'High')
    .forEach((c) => {
      const st = getAssuranceStatusForChange(state, c.id);
      if (st.implementationHealth.status !== 'On Track') {
        items.push({
          severity: st.implementationHealth.status === 'Material Concern' ? 'High' : 'Medium',
          title: `${c.id} — ${st.implementationHealth.status}`,
          href: `#/change/${c.id}#assurance-${c.id}`,
          changeId: c.id,
        });
      }
      if (st.variance.variance === 'Material Variance') {
        items.push({
          severity: 'High',
          title: `Assurance variance on ${c.id}`,
          href: `#/assurance/${st.primaryReviewId}`,
          changeId: c.id,
        });
      }
    });

  (state.assuranceFindings || [])
    .filter((f) => f.status !== 'Closed' && ['High', 'Critical'].includes(f.severity))
    .forEach((f) => {
      const ch = state.changes.find((c) => c.id === f.changeId) || state.obligations.find((o) => o.id === f.entityId);
      const sc = ch?.scenario || state.obligations.find((o) => o.id === f.entityId)?.scenario;
      if (sid !== 'all' && sc && sc !== sid) return;
      items.push({ severity: f.severity, title: `Assurance finding: ${f.title}`, href: `#/finding/${f.id}`, changeId: f.changeId });
    });

  (state.managementAttestations || [])
    .filter((a) => a.status === 'Overdue' || (a.status === 'Due' && a.dueDate && daysBetween(DEMO_TODAY, a.dueDate) < 0))
    .forEach((a) => {
      items.push({ severity: 'Medium', title: `Management attestation overdue: ${a.id}`, href: `#/management-attestation/${a.id}` });
    });

  (state.boardPacks || [])
    .filter((p) => p.status === 'Ready for Review')
    .forEach((p) => {
      items.push({ severity: 'Medium', title: `Board Pack requires review: ${p.title}`, href: `#/board-pack/${p.id}` });
    });

  filterByScenario(state.changes, sid)
    .filter((c) => c.materiality === 'High' && c.effectiveDate)
    .forEach((c) => {
      const d = daysBetween(DEMO_TODAY, c.effectiveDate);
      const st = getAssuranceStatusForChange(state, c.id);
      if (d >= 0 && d <= 90 && st.assuranceRating === 'Not Assured') {
        items.push({
          severity: 'High',
          title: `Effective date approaching — incomplete assurance: ${c.id}`,
          href: `#/change/${c.id}#assurance-${c.id}`,
        });
      }
    });

  return items;
}

export function getPeriodDeltas(state, periodId) {
  const period = getReportingPeriod(state, periodId) || getCurrentReportingPeriod(state);
  const snapshot = (state.periodSnapshots || []).find((s) => s.reportingPeriodId === period?.id);
  if (!snapshot?.deltas) return [];
  return snapshot.deltas;
}

export function getPeriodTrendMetrics(state, periodId) {
  const period = getReportingPeriod(state, periodId) || getCurrentReportingPeriod(state);
  return (state.periodTrendHistory || []).filter((t) => t.reportingPeriodId === period?.id);
}

export function assuranceMetrics(state, scenarioId) {
  const sid = scenarioId || state.scenarioId;
  const changes = filterByScenario(state.changes, sid).filter((c) => c.materiality === 'High');
  const reviews = (state.assuranceReviews || []).filter((r) => {
    if (!r.changeId) return sid === 'all';
    const ch = state.changes.find((c) => c.id === r.changeId);
    return sid === 'all' || ch?.scenario === sid;
  });
  const findings = (state.assuranceFindings || []).filter((f) => {
    if (sid === 'all') return true;
    const ch = f.changeId ? state.changes.find((c) => c.id === f.changeId) : null;
    const obl = state.obligations.find((o) => o.id === f.entityId);
    return ch?.scenario === sid || obl?.scenario === sid;
  });
  const openFindings = findings.filter((f) => f.status !== 'Closed');
  const gaps = filterByScenario(state.obligations, sid)
    .map((o) => getObligationCoverage(state, o.id))
    .filter((c) => c && c.gaps.length);
  return {
    significantChanges: changes.length,
    reviewsDue: reviews.filter((r) => ['Planned', 'Awaiting Evidence'].includes(r.reviewStatus)).length,
    openFindings: openFindings.length,
    highFindings: openFindings.filter((f) => ['High', 'Critical'].includes(f.severity)).length,
    obligationGaps: gaps.length,
    packsIncomplete: (state.assurancePacks || []).filter((p) => p.packStatus === 'Incomplete').length,
  };
}

export function filterAssuranceReviews(state, scenarioId) {
  const sid = scenarioId || state.scenarioId;
  return (state.assuranceReviews || []).filter((r) => {
    if (sid === 'all') return true;
    if (r.changeId) {
      const ch = state.changes.find((c) => c.id === r.changeId);
      return ch?.scenario === sid;
    }
    const obl = state.obligations.find((o) => o.id === r.entityId);
    if (obl) return obl.scenario === sid;
    const ch2 = state.changes.find((c) => c.id === r.entityId);
    return ch2?.scenario === sid;
  });
}
