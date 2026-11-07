import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { listGlobalRegulators, listGlobalRegulatorySources } from '@/lib/ri/services/reference-catalogue';
import { listPublicationsForOrganisation } from '@/lib/ri/services/publications';
import { listChanges } from '@/lib/ri/services/changes';
import { buildLabLandscapeView } from '@/lib/ri/lab-api/lab-landscape-view';

export async function GET() {
  try {
    const ctx = await requireRiContext('ri:read');
    const [regulators, sources, publications, changes] = await Promise.all([
      listGlobalRegulators(ctx.supabase),
      listGlobalRegulatorySources(ctx.supabase),
      listPublicationsForOrganisation(ctx.supabase, ctx.organisationId),
      listChanges(ctx.supabase, ctx.organisationId),
    ]);

    const pubRegKeys = publications.map((p) => p.regulator?.external_key ?? null);
    const pubRegById = new Map(publications.map((p) => [p.id, p.regulator?.external_key ?? null]));
    const changeRegKeys = changes.map((c) => {
      const pub = Array.isArray(c.publication) ? c.publication[0] : c.publication;
      const pid = pub?.id as string | undefined;
      return pid ? pubRegById.get(pid) ?? null : null;
    });

    const landscape = buildLabLandscapeView({
      regulators,
      sources,
      publicationRegulatorKeys: pubRegKeys,
      changePublicationRegulatorKeys: changeRegKeys,
    });

    return NextResponse.json({
      ok: true,
      catalogueScope: 'global',
      ...landscape,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
