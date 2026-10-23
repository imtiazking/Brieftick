/**
 * Build Design-Lab-shaped Ask RI state from production PostgreSQL (tenant-scoped).
 */
import { REGULATORS, REGULATORY_SOURCES } from '../../../../../packages/reference-data/index.mjs';

const MAX_ROWS = 500;

function labId(row, prefix) {
  if (row.external_key) return row.external_key;
  return row.id;
}

function mapChangeStatus(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'OPEN' || s === 'IN_PROGRESS') return 'Open';
  if (s === 'DRAFT') return 'Draft';
  if (s === 'IN_REVIEW') return 'In Review';
  if (s === 'CLOSED' || s === 'COMPLETE') return 'Closed';
  return status || 'Open';
}

function mapObligationStatus(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'OVERDUE') return 'Overdue';
  if (s === 'OPEN') return 'Open';
  if (s === 'IN_PROGRESS') return 'In Progress';
  if (s === 'DRAFT') return 'Draft';
  if (s === 'IN_REVIEW') return 'In Review';
  if (s === 'COMPLETE' || s === 'HISTORIC' || s === 'CLOSED') return 'Complete';
  return status || 'Open';
}

function mapActionStatus(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'COMPLETE' || s === 'CLOSED') return 'Complete';
  if (s === 'IN_PROGRESS') return 'In Progress';
  return 'Open';
}

export async function buildAskRiStateFromSupabase(supabase, organisationId) {
  const q = async (table, select, limit = MAX_ROWS) => {
    const { data, error } = await supabase.from(table).select(select).eq('organisation_id', organisationId).limit(limit);
    if (error) throw new Error(error.message);
    return data ?? [];
  };

  const state = await buildEmptyCatalogState();

  const chgRows = await q('regulatory_changes', 'id, external_key, title, status, publication_id, materiality, effective_date');
  const changeIdByUuid = new Map(chgRows.map((c) => [c.id, labId(c, 'CHG')]));
  state.changes = chgRows.map((c) => ({
    id: labId(c, 'CHG'),
    title: c.title,
    status: mapChangeStatus(c.status),
    publicationId: c.publication_id,
    materiality: c.materiality,
    effectiveDate: c.effective_date,
  }));

  const oblRows = await q(
    'regulatory_obligations',
    'id, external_key, obligation_statement, status, regulatory_change_id, publication_id, due_date, citation',
  );
  state.obligations = oblRows.map((o) => ({
    id: labId(o, 'OBL'),
    statement: o.obligation_statement,
    status: mapObligationStatus(o.status),
    changeId: changeIdByUuid.get(o.regulatory_change_id) || o.regulatory_change_id,
    publicationId: o.publication_id,
    dueDate: o.due_date,
    citation: o.citation,
  }));

  const actRows = await q('actions', 'id, external_key, title, status, due_date, owner_user_id');
  state.actions = actRows.map((a) => ({
    id: labId(a, 'ACT'),
    title: a.title,
    status: mapActionStatus(a.status),
    dueDate: a.due_date,
    ownerId: a.owner_user_id,
  }));

  const ctrlRows = await q('controls', 'id, external_key, name, status');
  state.controls = ctrlRows.map((c) => ({
    id: labId(c, 'CTRL'),
    name: c.name,
    status: c.status,
  }));

  const evRows = await q('evidence_items', 'id, external_key, title, evidence_type');
  state.evidence = evRows.map((e) => ({
    id: labId(e, 'EVD'),
    title: e.title,
    status: e.evidence_type,
  }));

  const oblCtrl = await q('obligation_control_links', 'obligation_id, control_id');
  state.obligationControlLinks = oblCtrl.map((r) => ({
    obligationId: r.obligation_id,
    controlId: r.control_id,
  }));

  const evObl = await q('evidence_obligation_links', 'obligation_id, evidence_id');
  state.evidenceObligationLinks = evObl.map((r) => ({
    obligationId: r.obligation_id,
    evidenceId: r.evidence_id,
  }));

  const evCtrl = await q('evidence_control_links', 'control_id, evidence_id');
  state.evidenceControlLinks = evCtrl.map((r) => ({
    controlId: r.control_id,
    evidenceId: r.evidence_id,
  }));

  const { data: pubs } = await supabase
    .from('regulatory_publications')
    .select('id, title, regulator_id')
    .limit(MAX_ROWS);
  state.publications = (pubs ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    regulator: p.regulator_id,
  }));

  return state;
}

async function buildEmptyCatalogState() {
  return {
    scenarioId: 'production',
    asOfDate: new Date().toISOString().slice(0, 10),
    sectors: [],
    regulators: REGULATORS.map((r) => ({
      id: r.regulatorId,
      shortName: r.shortName,
      label: r.name,
      name: r.name,
      jurisdictions: r.jurisdictions || [],
    })),
    sources: REGULATORY_SOURCES.map((s) => ({
      id: s.sourceId,
      label: s.name,
      regulatorId: s.regulatorId,
      productionStatus: s.integration?.productionStatus,
      verificationStatus: s.integration?.verificationStatus,
    })),
    publications: [],
    changes: [],
    obligations: [],
    actions: [],
    controls: [],
    policies: [],
    risks: [],
    evidence: [],
    findings: [],
    assuranceReviews: [],
    assessments: [],
    obligationControlLinks: [],
    evidenceObligationLinks: [],
    evidenceControlLinks: [],
    findingObligationLinks: [],
    findingActionLinks: [],
    internationalImplementationMappings: [],
    baselPublicationRecords: [],
    tprRecords: [],
  };
}

export async function buildAskRiStateFromClient(client, organisationId) {
  const state = {
    scenarioId: 'production',
    asOfDate: new Date().toISOString().slice(0, 10),
    sectors: [],
    regulators: REGULATORS.map((r) => ({
      id: r.regulatorId,
      shortName: r.shortName,
      label: r.name,
      name: r.name,
      jurisdictions: r.jurisdictions || [],
    })),
    sources: REGULATORY_SOURCES.map((s) => ({
      id: s.sourceId,
      label: s.name,
      regulatorId: s.regulatorId,
      productionStatus: s.integration?.productionStatus,
      verificationStatus: s.integration?.verificationStatus,
    })),
    publications: [],
    changes: [],
    obligations: [],
    actions: [],
    controls: [],
    policies: [],
    risks: [],
    evidence: [],
    findings: [],
    assuranceReviews: [],
    assessments: [],
    obligationControlLinks: [],
    evidenceObligationLinks: [],
    evidenceControlLinks: [],
    findingObligationLinks: [],
    findingActionLinks: [],
    internationalImplementationMappings: [],
    baselPublicationRecords: [],
    tprRecords: [],
  };

  const pubs = await client.query(
    `select p.id, p.title, p.regulator_id, r.external_key as regulator_key
     from regulatory_publications p
     left join regulators r on r.id = p.regulator_id
     limit $1`,
    [MAX_ROWS],
  );
  state.publications = pubs.rows.map((p) => ({
    id: p.id,
    title: p.title,
    regulator: p.regulator_key || p.regulator_id,
  }));

  const chg = await client.query(
    `select id, external_key, title, status, publication_id, materiality, effective_date
     from regulatory_changes where organisation_id = $1 limit $2`,
    [organisationId, MAX_ROWS],
  );
  const changeIdByUuid = new Map(chg.rows.map((c) => [c.id, labId(c, 'CHG')]));
  state.changes = chg.rows.map((c) => ({
    id: labId(c, 'CHG'),
    title: c.title,
    status: mapChangeStatus(c.status),
    publicationId: c.publication_id,
    materiality: c.materiality,
    effectiveDate: c.effective_date,
  }));

  const obl = await client.query(
    `select id, external_key, obligation_statement, status, regulatory_change_id, publication_id, due_date, citation
     from regulatory_obligations where organisation_id = $1 limit $2`,
    [organisationId, MAX_ROWS],
  );
  state.obligations = obl.rows.map((o) => ({
    id: labId(o, 'OBL'),
    statement: o.obligation_statement,
    status: mapObligationStatus(o.status),
    changeId: changeIdByUuid.get(o.regulatory_change_id) || o.regulatory_change_id,
    publicationId: o.publication_id,
    dueDate: o.due_date,
    citation: o.citation,
  }));

  const acts = await client.query(
    `select id, external_key, title, status, due_date, owner_user_id from actions where organisation_id = $1 limit $2`,
    [organisationId, MAX_ROWS],
  );
  state.actions = acts.rows.map((a) => ({
    id: labId(a, 'ACT'),
    title: a.title,
    status: mapActionStatus(a.status),
    dueDate: a.due_date,
    ownerId: a.owner_user_id,
  }));

  const ctrl = await client.query(
    `select id, external_key, name, status from controls where organisation_id = $1 limit $2`,
    [organisationId, MAX_ROWS],
  );
  state.controls = ctrl.rows.map((c) => ({
    id: labId(c, 'CTRL'),
    name: c.name,
    status: c.status,
  }));

  const ev = await client.query(
    `select id, external_key, title, evidence_type from evidence_items where organisation_id = $1 limit $2`,
    [organisationId, MAX_ROWS],
  );
  state.evidence = ev.rows.map((e) => ({
    id: labId(e, 'EVD'),
    title: e.title,
    status: e.evidence_type,
  }));

  const oblCtrl = await client.query(
    `select obligation_id, control_id from obligation_control_links where organisation_id = $1 limit $2`,
    [organisationId, MAX_ROWS],
  );
  state.obligationControlLinks = oblCtrl.rows.map((r) => ({
    obligationId: r.obligation_id,
    controlId: r.control_id,
  }));

  const evObl = await client.query(
    `select obligation_id, evidence_id from evidence_obligation_links where organisation_id = $1 limit $2`,
    [organisationId, MAX_ROWS],
  );
  state.evidenceObligationLinks = evObl.rows.map((r) => ({
    obligationId: r.obligation_id,
    evidenceId: r.evidence_id,
  }));

  const evCtrl = await client.query(
    `select control_id, evidence_id from evidence_control_links where organisation_id = $1 limit $2`,
    [organisationId, MAX_ROWS],
  );
  state.evidenceControlLinks = evCtrl.rows.map((r) => ({
    controlId: r.control_id,
    evidenceId: r.evidence_id,
  }));

  const actObl = await client.query(
    `select obligation_id, action_id from action_obligation_links where organisation_id = $1 limit $2`,
    [organisationId, MAX_ROWS],
  );
  for (const row of actObl.rows) {
    const action = state.actions.find((a) => a.id === row.action_id) || { id: row.action_id };
    action.obligationId = row.obligation_id;
  }

  return state;
}
