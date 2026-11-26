import { buildCalendarEventsFromRecords } from '@/lib/ri/lab-compat/calendar-parity.mjs';
import { forwardWindowEnd } from '@/lib/ri/lab-compat/date-window.mjs';
import { scopeRegister, type LabRegisterPartition } from '@/lib/ri/lab-api/lab-data-scope';
import type { LabDataScope } from '@/lib/ri/uat-record-provenance';
import {
  impactLabProvenanceInputFromRow,
  partitionImpactsForLabScope,
} from '@/lib/ri/lab-api/impact-lab-provenance';
import {
  obligationLabProvenanceInputFromRow,
  partitionObligationsForLabScope,
} from '@/lib/ri/lab-api/obligation-lab-provenance';
import { actionLabProvenanceInputFromRow, partitionActionsForLabScope } from '@/lib/ri/lab-api/action-lab-provenance';

export const CALENDAR_WINDOWS = [30, 90, 180, 365] as const;
export const DEFAULT_CALENDAR_WINDOW = 90;

export type LabCalendarEvent = {
  id: string;
  date: string;
  kind: string;
  title: string;
  recordId: string;
  recordType: string;
  /** Provenance of the underlying tenant record; catalogue publications are global reference data. */
  dataProvenance: 'catalogue' | 'operational' | 'uat_authorised';
  /** Workflow status of the underlying record, so a completed item is not mistaken for an open deadline. */
  status: string | null;
};

type Row = Record<string, unknown> & { id: string };

export type LabCalendarInput = {
  publications: Row[];
  obligations: Row[];
  impacts: Row[];
  actions: Row[];
};

export type LabCalendarResult = {
  window: number;
  from: string;
  to: string;
  events: LabCalendarEvent[];
  provenance: { operational: number; uatAuthorised: number; unverified: number; syntheticUat: number };
};

/** Only the supported windows are accepted; anything else falls back to the default rather than widening the query. */
export function parseCalendarWindow(raw: string | null | undefined): number {
  const n = Number(raw);
  return (CALENDAR_WINDOWS as readonly number[]).includes(n) ? n : DEFAULT_CALENDAR_WINDOW;
}

function snippet(text: unknown, max = 90): string {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

/**
 * Builds the tenant regulatory calendar from tenant records, applying the same lab data scope as every other register:
 * `operational` shows only operational records; `all` shows every tenant-visible record with a provenance label.
 * Tenant isolation is enforced by RLS on the queries that produced the rows - the scope only partitions them.
 */
export function buildLabCalendar(
  input: LabCalendarInput,
  opts: { organisationId: string; scope: LabDataScope; from: string; window: number },
): LabCalendarResult {
  const { organisationId, scope, from, window } = opts;
  const to = forwardWindowEnd(from, window);

  const obligationPartition = partitionObligationsForLabScope(input.obligations, scope, (r) =>
    obligationLabProvenanceInputFromRow(r as Parameters<typeof obligationLabProvenanceInputFromRow>[0]),
  );
  const impactPartition = partitionImpactsForLabScope(input.impacts, scope, (r) =>
    impactLabProvenanceInputFromRow(r as Parameters<typeof impactLabProvenanceInputFromRow>[0]),
  );
  const actionPartition = partitionActionsForLabScope(input.actions, scope, (r) =>
    actionLabProvenanceInputFromRow(r as Parameters<typeof actionLabProvenanceInputFromRow>[0]),
  );

  const obligations = scopeRegister(scope, input.obligations, obligationPartition as LabRegisterPartition<Row>);
  const impacts = scopeRegister(scope, input.impacts, impactPartition as LabRegisterPartition<Row>);
  const actions = scopeRegister(scope, input.actions, actionPartition as LabRegisterPartition<Row>);

  const uatIds = new Set<string>([
    ...obligationPartition.authorisedUat.map((r) => String((r as Row).id)),
    ...impactPartition.authorisedUat.map((r) => String((r as Row).id)),
    ...actionPartition.authorisedUat.map((r) => String((r as Row).id)),
  ]);
  const byId = (rows: Row[]) => new Map(rows.map((r) => [String(r.id), r]));
  const obligationById = byId(obligations.primary);
  const impactById = byId(impacts.primary);
  const actionById = byId(actions.primary);
  const publicationById = byId(input.publications);

  const raw = buildCalendarEventsFromRecords(
    {
      publications: input.publications,
      obligations: obligations.primary.map((o) => ({
        id: o.id,
        organisation_id: organisationId,
        due_date: str(o.due_date),
        effective_date: str(o.effective_date),
        obligation_statement: o.obligation_statement,
      })),
      impacts: impacts.primary.map((i) => ({
        id: i.id,
        organisation_id: organisationId,
        due_date: str(i.due_date),
        status: i.status,
      })),
      actions: actions.primary.map((a) => ({
        id: a.id,
        organisation_id: organisationId,
        due_date: str(a.due_date),
        title: a.title,
      })),
      policies: [],
    },
    { from, to, organisationId },
  ) as Array<{ id: string; date: string; kind: string; title: string; recordId: string; recordType: string }>;

  const events: LabCalendarEvent[] = raw.map((e) => {
    let title = e.title;
    let status: string | null = null;
    let dataProvenance: LabCalendarEvent['dataProvenance'] = 'catalogue';
    if (e.recordType === 'Publication') {
      const p = publicationById.get(e.recordId);
      const t = snippet(p?.title);
      if (t) title = `${e.title}: ${t}`;
    } else if (e.recordType === 'Obligation') {
      const o = obligationById.get(e.recordId);
      title = `Obligation effective: ${snippet(o?.obligation_statement) || e.recordId}`;
      status = str(o?.status);
      dataProvenance = uatIds.has(e.recordId) ? 'uat_authorised' : 'operational';
    } else if (e.recordType === 'Impact Assessment') {
      const i = impactById.get(e.recordId);
      title = `Impact assessment due${i?.status ? ` (${String(i.status)})` : ''}`;
      status = str(i?.status);
      dataProvenance = uatIds.has(e.recordId) ? 'uat_authorised' : 'operational';
    } else if (e.recordType === 'Action') {
      const a = actionById.get(e.recordId);
      title = snippet(a?.title) || e.title;
      status = str(a?.status);
      dataProvenance = uatIds.has(e.recordId) ? 'uat_authorised' : 'operational';
    }
    return { id: e.id, date: e.date, kind: e.kind, title, recordId: e.recordId, recordType: e.recordType, dataProvenance, status };
  });

  events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return {
    window,
    from,
    to,
    events,
    provenance: {
      operational: obligationPartition.operational.length + impactPartition.operational.length + actionPartition.operational.length,
      uatAuthorised: uatIds.size,
      unverified: obligationPartition.unverified.length + impactPartition.unverified.length + actionPartition.unverified.length,
      syntheticUat: obligationPartition.syntheticUat.length + impactPartition.syntheticUat.length + actionPartition.syntheticUat.length,
    },
  };
}
