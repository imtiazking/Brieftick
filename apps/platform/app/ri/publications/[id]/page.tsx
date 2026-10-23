import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiStatusChip } from '@/components/ri/ri-status-chip';
import { RiCatalogueStatusBanner } from '@/components/ri/ri-catalogue-status-banner';
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
import { RiPublicationAiPanel } from '@/components/ri/ri-publication-ai-panel';
import { listAnalysisRuns } from '@/lib/ri/services/ai-analysis';

function formatStatus(value: string | null | undefined) {
  return (value || 'NOT_TESTED').replaceAll('_', ' ');
}

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

  const { publication, orgPublication, applicability, changes, impacts, versions, sourceMeta } = detail;
  const aiRuns = (await listAnalysisRuns(ctx.supabase, ctx.organisationId, 100)).filter(
    (r) => r.publication_id === id,
  );
  const latestVersion =
    [...versions].sort((a, b) => (b.version_number ?? 0) - (a.version_number ?? 0))[0] ?? null;
  const regulator = publication.regulator;
  const source = publication.source;
  const canEdit = canRi(ctx.role, 'triage:write');
  const canApplicability = canRi(ctx.role, 'applicability:write');
  const canChange = canRi(ctx.role, 'change:write');
  const isTest =
    publication.data_origin === 'dev_fixture' ||
    publication.data_origin === 'test_fixture' ||
    publication.title.includes('TEST');
  const currentVersion = versions[0];

  return (
    <ShellLayout title={publication.title} subtitle="Publication detail and organisation workflow">
      <RiDataGate>
        {isTest && (
          <div className="fg-banner fg-banner--warn">TEST / DEVELOPMENT DATA — not a live regulator record</div>
        )}
        <nav className="fg-ri-detail-tabs" aria-label="Publication sections">
          <a href="#overview">Overview</a>
          <a href="#source">Source</a>
          <a href="#changes">Changes</a>
          <a href="#impact">Impact</a>
          <a href="#applicability">Applicability</a>
          <a href="#linked">Linked records</a>
          <a href="#ai">AI summary</a>
        </nav>
        <div className="fg-card" id="overview">
          <h2>Overview</h2>
          <p>{publication.summary ?? 'No summary stored for this publication.'}</p>
          <ul className="fg-status-list">
            <li><span>Type</span><span>{publication.publication_type}</span></li>
            <li><span>Regulator</span><span>{regulator?.name ?? '—'} ({regulator?.external_key ?? '—'})</span></li>
            <li><span>Source</span><span>{source?.name ?? '—'} ({source?.external_key ?? '—'})</span></li>
            <li><span>Publication date</span><span>{publication.publication_date ?? '—'}</span></li>
            <li><span>Effective date</span><span>{publication.effective_date ?? '—'}</span></li>
            <li><span>Consultation deadline</span><span>{publication.consultation_deadline ?? '—'}</span></li>
            <li><span>Organisation triage</span><span>{orgPublication?.triage_status ?? 'NEW'}</span></li>
            <li><span>Relevance</span><span>{orgPublication?.relevance_status ?? 'UNASSESSED'}</span></li>
            <li><span>Materiality</span><span>{orgPublication?.materiality ?? '—'}</span></li>
          </ul>
        </div>
        <div className="fg-card" id="source">
          <h2>Source &amp; provenance</h2>
          <RiCatalogueStatusBanner />
          <ul className="fg-status-list">
            <li><span>Regulator ID</span><span>{regulator?.external_key ?? '—'}</span></li>
            <li><span>Source ID</span><span>{source?.external_key ?? '—'}</span></li>
            <li><span>Canonical URL</span><span><a href={publication.canonical_url} rel="noopener noreferrer">{publication.canonical_url}</a></span></li>
            <li><span>Publication version</span><span>{currentVersion?.version_number ?? '—'}</span></li>
            <li><span>Source hash</span><span>{currentVersion?.source_hash ?? publication.source_hash ?? '—'}</span></li>
            <li><span>Retrieved at</span><span>{currentVersion?.retrieved_at ?? '—'}</span></li>
            <li><span>Ingestion run</span><span>{currentVersion?.ingestion_run_id ?? '—'}</span></li>
            <li><span>Data origin</span><span>{publication.data_origin}</span></li>
            <li><span>Technical verification</span><span>{formatStatus(sourceMeta?.verification_status)}</span></li>
            <li><span>Semantic coverage</span><span>{formatStatus(sourceMeta?.coverage_verification_status)}</span></li>
            <li><span>Production enablement</span><span>{formatStatus(sourceMeta?.production_status === 'NOT_ENABLED' ? 'NOT ENABLED' : sourceMeta?.production_status)}</span></li>
          </ul>
          {versions.length > 1 && (
            <>
              <h3>Version history</h3>
              <ul className="fg-link-list">
                {versions.map((v) => (
                  <li key={v.id}>
                    v{v.version_number} · hash {v.source_hash ?? '—'} · retrieved {v.retrieved_at ?? '—'}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="fg-card" id="triage">
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

        <div className="fg-card" id="changes">
          <h2>Changes</h2>
          {changes.length === 0 ? (
            <p className="fg-muted">No regulatory changes linked to this publication.</p>
          ) : (
            <ul className="fg-link-list">
              {changes.map((c) => (
                <li key={c.id}><Link href={`/ri/changes/${c.id}`}>{c.title}</Link> — <RiStatusChip label={c.status} /></li>
              ))}
            </ul>
          )}
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

        <div className="fg-card" id="impact">
          <h2>Impact</h2>
          {impacts.length === 0 ? (
            <p className="fg-muted">No impact assessments linked through regulatory changes.</p>
          ) : (
            <ul className="fg-link-list">
              {impacts.map((ia) => (
                <li key={ia.id}>
                  <Link href={`/ri/impact-assessments/${ia.id}`}>Impact assessment</Link>
                  {' — '}
                  <RiStatusChip label={ia.status} />
                  {ia.due_date ? ` · due ${ia.due_date}` : ''}
                  {ia.materiality ? ` · ${ia.materiality}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="fg-card" id="applicability">
          <h2>Applicability (human determination)</h2>
          <p className="fg-muted">AI recommendation is not enabled in production — record your organisation&apos;s manual assessment.</p>
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

        <div className="fg-card" id="linked">
          <h2>Linked records</h2>
          <p>Changes: {changes.length} · Impact assessments: {impacts.length} · Applicability: {applicability ? 'recorded' : 'none'}</p>
          <p className="fg-muted">Relationships are explicit publication → change → impact links only.</p>
        </div>
        <div id="ai">
          <RiPublicationAiPanel
            publicationId={id}
            publicationVersionId={latestVersion?.id ?? null}
            runs={aiRuns}
            canRequest={canRi(ctx.role, 'ai:request')}
          />
        </div>
      </RiDataGate>
    </ShellLayout>
  );
}
