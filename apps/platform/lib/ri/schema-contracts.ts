/**
 * Production RI schema contracts (static — validated by acceptance-phase-3-ri-schema.mjs).
 */

export const GLOBAL_RI_TABLES = [
  'regulators',
  'regulatory_sources',
  'regulatory_publications',
] as const;

export const TENANT_RI_TABLES = [
  'organisation_publications',
  'applicability_assessments',
  'regulatory_changes',
  'impact_assessments',
  'impact_assessment_business_areas',
  'impact_assessment_systems',
  'impact_assessment_products',
  'impact_assessment_legal_entities',
  'regulatory_obligations',
  'policies',
  'risks',
  'controls',
  'actions',
  'evidence_items',
  'assurance_reviews',
  'findings',
  'workflow_events',
  'ai_analysis_runs',
  'ai_analysis_citations',
  'ai_analysis_reviews',
  'ai_claim_materialisations',
  'ask_ri_query_log',
] as const;

export const GLOBAL_AI_REFERENCE_TABLES = ['ai_use_cases'] as const;

export const AUTHORITATIVE_JOIN_TABLES = [
  'obligation_policy_links',
  'obligation_risk_links',
  'risk_control_links',
  'obligation_control_links',
  'action_impact_assessment_links',
  'action_obligation_links',
  'action_control_gap_links',
  'action_policy_gap_links',
  'evidence_action_links',
  'evidence_control_links',
  'evidence_obligation_links',
  'assurance_review_control_links',
  'assurance_review_obligation_links',
  'finding_control_links',
  'finding_action_links',
  'finding_assurance_review_links',
] as const;

/** Explicit evidence / finding attribution — no obligation link on findings. */
export const FORBIDDEN_INFERENCE_TABLES = [
  'finding_obligation_links',
  'obligation_evidence_arrays',
] as const;

export const LIFECYCLE_ENTITY_LABELS = [
  'Publications (global)',
  'Organisation publication state',
  'Applicability',
  'Regulatory changes',
  'Impact assessments',
  'Obligations',
  'Policies',
  'Risks',
  'Controls',
  'Actions',
  'Evidence',
  'Assurance reviews',
  'Findings',
  'Workflow events',
] as const;
