import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { emptyLabScopeMeta, mergeExcluded, parseLabDataScope } from '@/lib/ri/lab-api/lab-data-scope';
import { resolveRecordProvenance } from '@/lib/ri/record-provenance';
import { mapPublicationListRowToLabView } from '@/lib/ri/lab-api/lab-publication-view';
import { listPublicationsForOrganisation } from '@/lib/ri/services/publications';

export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('ri:read');
    const scope = parseLabDataScope(new URL(request.url));
    const scopeMeta = emptyLabScopeMeta(scope);
    const rows = await listPublicationsForOrganisation(ctx.supabase, ctx.organisationId);
    let publications = rows.map(mapPublicationListRowToLabView);
    if (scope === 'operational') {
      const before = publications.length;
      publications = publications.filter((p) =>
        resolveRecordProvenance({ dataOrigin: p.dataOrigin }) === 'regulatory_catalogue' ||
        p.display?.catalogueKind === 'regulatory',
      );
      mergeExcluded(scopeMeta, 'publications', before - publications.length);
    }
    return NextResponse.json({
      ok: true,
      total: publications.length,
      catalogueScope: 'global',
      ...scopeMeta,
      publications,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
