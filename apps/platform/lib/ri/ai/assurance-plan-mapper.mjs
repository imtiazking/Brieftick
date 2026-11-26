/**
 * Maps UC-RI-008 Control Assurance output into assurance review draft fields.
 *
 * Root cause of the pilot truncation: each plan field was cut with `.slice(0, 1500)` (procedure) / `.slice(0, 1000)`
 * (evidence) before persistence, mid-sentence and without a marker. Provider output, JSON validation, the response
 * mapping and the Design Lab renderer were not at fault (the model finished with stop_reason end_turn well inside its
 * output budget; the notes column accepts 8000 characters and the UI renders it whole).
 * Fields are now rendered in full. Only the 8000-character column limit can shorten the note; when it does, the cut
 * falls on a line boundary, carries an explicit marker, is flagged in metadata and the full plan is kept there.
 */

const HUMAN_CONFIRM = 'Requires human confirmation — not verified organisational fact.';
export const ASSURANCE_NOTES_MAX_CHARS = 8000;

/** Render a string or an array of steps/items without losing any of it. */
export function renderPlanField(value) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const items = value.map((v) => (typeof v === 'string' ? v.trim() : v && typeof v === 'object' ? JSON.stringify(v) : String(v))).filter(Boolean);
    if (!items.length) return null;
    return items.map((item, i) => `${i + 1}. ${item.replace(/^\s*\d+[.)]\s*/, '')}`).join('\n');
  }
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  const s = String(value).trim();
  return s || null;
}

export function assembleAssuranceNotes(sections, max = ASSURANCE_NOTES_MAX_CHARS) {
  const full = sections.filter(Boolean).join('\n\n');
  if (full.length <= max) return { notes: full, truncated: false, omittedCharacters: 0 };
  const marker = (n) => `\n\n[TRUNCATED — ${n} characters omitted to fit the ${max}-character notes limit; the complete plan is held in the record metadata.]`;
  let budget = max - marker(full.length).length;
  let cut = full.lastIndexOf('\n', budget);
  if (cut < max * 0.5) cut = budget;
  const omitted = full.length - cut;
  return { notes: `${full.slice(0, cut)}${marker(omitted)}`, truncated: true, omittedCharacters: omitted };
}

/**
 * @param {{ structured?: Record<string, any> | null, claims?: any[] | null }} input
 */
export function mapAssurancePlanToDraftFields(input) {
  const structured = input.structured && typeof input.structured === 'object' ? input.structured : {};
  const plan = structured.testPlan && typeof structured.testPlan === 'object' ? structured.testPlan : {};
  const claims = Array.isArray(input.claims) ? input.claims : Array.isArray(structured.claims) ? structured.claims : [];
  const confidence = Number(structured.confidence ?? 0);
  const objective = renderPlanField(plan.objective) || 'Validate control operation against approved risk mapping.';
  const procedure = renderPlanField(plan.procedure);
  const evidence = renderPlanField(plan.evidenceRequirements);
  const frequency = renderPlanField(plan.frequency);
  const sampling = renderPlanField(plan.sampling);
  const { notes, truncated, omittedCharacters } = assembleAssuranceNotes([
    objective,
    procedure ? `Procedure:\n${procedure}` : null,
    evidence ? `Evidence:\n${evidence}` : null,
    frequency ? `Frequency: ${frequency}` : null,
    sampling ? `Sampling: ${sampling}` : null,
    HUMAN_CONFIRM,
  ]);
  return {
    review_type: String(plan.reviewType || 'control_test').slice(0, 200),
    notes,
    notesTruncated: truncated,
    stage5Metadata: {
      aiUseCaseId: 'UC-RI-008',
      aiConfidence: confidence,
      aiClaims: claims.slice(0, 8),
      assignedTesterHint: plan.assignedTester || null,
      notesTruncated: truncated,
      notesOmittedCharacters: omittedCharacters,
      /** Complete provider test plan, kept so nothing is lost to the notes column limit. */
      fullTestPlan: plan,
      humanConfirmationRequired: [
        'Test execution and pass/fail must be recorded by authorised testers.',
        'AI cannot close assurance without independent human approval.',
        ...(truncated ? ['The notes were shortened to fit the column limit; read the full plan in the record metadata.'] : []),
      ],
      processingStatus: 'DRAFT_AI_TEST_PLAN',
    },
  };
}
