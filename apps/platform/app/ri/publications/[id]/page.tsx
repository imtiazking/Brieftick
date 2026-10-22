import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiStatusChip } from '@/components/ri/ri-status-chip';
import { canRi } from '@/lib/ri/permissions';
import {
  createChangeAction,
  saveApplicabilityAction,
  updateTriageAction,
} from '@/lib/ri/server-actions';
import { tryRiContext } from '@/lib/ri/context';
import { RiNotFoundError } from '@/lib/ri/errors';
import { getPublicationDetail } from '@/lib/ri/services/publications';
import { RELEVANCE_STATUSES, TRIAGE_STATUSES } from '@/lib/ri/validation';
import { APPLICABILITY_RECOMMENDATIONS } from '@/lib/ri/enums';

export default async function PublicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await tryRiContext();
  if (!ctx) {
    return (
      <ShellLayout title="Publication">
        <RiDataGate><p>Sign in required.</p></RiDataGate>
      </ShellLayout>
    );
  }

  let detail;
  try {
    detail = await getPublicationDetail(ctx.supabase, ctx.organisationId, id);
  } catch (e) {
    if (e instanceof RiNotFoundError) notFound();
    throw e;
  }

  const { publication, orgPublication, applicability, changes } = detail;
  const canEdit = canRi(ctx.role, 'triage:write');
  const canApplicability = canRi(ctx.role, 'applicability:write');
  const canChange = canRi(ctx.role, 'change:write');
  const isTest =
    publication.data_origin === 'dev_fixture' ||
    publication.data_origin === 'test_fixture' ||
    publication.title.includes('TEST');

  return (
    <ShellLayout title={publication.title} subtitle="Publication detail and organisation workflow">
      <RiDataGate>
        {isTest && (
          <div className="fg-banner fg-banner--warn">TEST / DEVELOPMENT DATA — not a live regulator record</div>
        )}
        <div className="fg-card">
          <h2>Source</h2>
          <ul className="fg-status-list">
            <li><span>Regulator</span><span>{publication.regulator?.name}</span></li>
            <li><span>Source</span><span>{publication.source?.name}</span></li>
            <li><span>Canonical URL</span><span><a href={publication.canonical_url} rel="noopener noreferrer">{publication.canonical_url}</a></span></li>
            <li><span>Publication date</span><span>{publication.publication_date ?? '—'}</span></li>
            <li><span>Effective date</span><span>{publication.effective_date ?? '—'}</span></li>
            <li><span>Consultation deadline</span><span>{publication.consultation_deadline ?? '—'}</span></li>
            <li><span>Data origin</span><span>{publication.data_origin}</span></li>
            <li><span>Content hash</span><span>{publication.source_hash ?? '—'}</span></li>
          </ul>
        </div>

        <div className="fg-card">
          <h2>Organisation triage</h2>
          {canEdit ? (
            <form action={updateTriageAction} className="fg-form">
              <input type="hidden" name="publication_id" value={id} />
              <input type="hidden" name="updated_at" value={orgPublication?.updated_at ?? ''} />
              <label>
                Triage status
                <select name="triage_status" defaultValue={orgPublication?.triage_status ?? 'NEW'}>
                  {TRIAGE_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Relevance (RELEVANT / NOT_RELEVANT)
                <select name="relevance_status" defaultValue={orgPublication?.relevance_status ?? 'UNASSESSED'}>
                  {RELEVANCE_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>Materiality<input name="materiality" defaultValue={orgPublication?.materiality ?? ''} /></label>
              <label>Assignee (Clerk user id)<input name="assigned_to" defaultValue={orgPublication?.assigned_to ?? ''} /></label>
              <button type="submit" className="fg-btn">Save triage</button>
            </form>
          ) : (
            <p className="fg-muted">Read-only (VIEWER).</p>
          )}
        </div>

        <div className="fg-card">
          <h2>Applicability (human determination)</h2>
          <p className="fg-muted">No AI recommendation — record your organisation&apos;s manual assessment.</p>
          {canApplicability ? (
            <form action={saveApplicabilityAction} className="fg-form">
              <input type="hidden" name="publication_id" value={id} />
              <input type="hidden" name="assessment_id" value={applicability?.id ?? ''} />
              <input type="hidden" name="updated_at" value={applicability?.updated_at ?? ''} />
              <label>
                Recommendation
                <select name="recommendation" defaultValue={applicability?.recommendation ?? 'UNASSESSED'}>
                  {APPLICABILITY_RECOMMENDATIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label>Rationale<textarea name="rationale" rows={4} defaultValue={applicability?.rationale ?? ''} /></label>
              <label>Business areas (comma-separated)<input name="affected_business_areas" defaultValue={(applicability?.affected_business_areas ?? []).join(', ')} /></label>
              <label>Products<input name="affected_products" defaultValue={(applicability?.affected_products ?? []).join(', ')} /></label>
              <label>Jurisdictions<input name="affected_jurisdictions" defaultValue={(applicability?.affected_jurisdictions ?? []).join(', ')} /></label>
              <label>Regulated activities<input name="affected_regulated_activities" defaultValue={(applicability?.affected_regulated_activities ?? []).join(', ')} /></label>
              <label>Override reason<input name="override_reason" defaultValue={applicability?.override_reason ?? ''} /></label>
              <button type="submit" className="fg-btn">Save applicability</button>
            </form>
          ) : (
            applicability && <RiStatusChip label={applicability.recommendation} />
          )}
        </div>

        <div className="fg-card">
          <h2>Regulatory changes</h2>
          <ul className="fg-link-list">
            {changes.map((c) => (
              <li key={c.id}><Link href={`/ri/changes/${c.id}`}>{c.title}</Link> — <RiStatusChip label={c.status} /></li>
            ))}
          </ul>
          {canChange && (
            <form action={createChangeAction} className="fg-form">
              <input type="hidden" name="publication_id" value={id} />
              <h3>Create change</h3>
              <label>Title<input name="title" required /></label>
              <label>Change type<input name="change_type" defaultValue="REGULATORY" required /></label>
              <label>Description<textarea name="description" rows={3} /></label>
              <label>Materiality<input name="materiality" /></label>
              <label>Effective date<input name="effective_date" type="date" /></label>
              <label>Implementation deadline<input name="implementation_deadline" type="date" /></label>
              <button type="submit" className="fg-btn">Create regulatory change</button>
            </form>
          )}
        </div>
      </RiDataGate>
    </ShellLayout>
  );
}
