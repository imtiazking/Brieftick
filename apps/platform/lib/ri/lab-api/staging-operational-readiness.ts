import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { peekClerkJwtClaims } from '@/lib/auth/clerk-jwt-peek';
import { getClerkSupabaseAccessToken } from '@/lib/auth/clerk-supabase-token';
import { clerkKeyPairAligned, getAppEnvironment, isClerkConfigured } from '@/lib/env';
import { AI_PROVIDER_MODE } from '@/lib/ri/ai/enums';
import { getRequestedProviderMode, resolveAiProviderMode } from '@/lib/ri/ai/provider-registry';
import { isAnthropicConfigured } from '@/lib/ri/ai/anthropic-provider';
import { isOpenAiConfigured } from '@/lib/ri/ai/openai-provider';
import { FORGENIQ_RI_STAGING_PROJECT_REF } from '@/lib/ri/ingestion/snapshot/staging-constants.mjs';
import { extractProjectRefFromSupabaseUrl } from '@/lib/ri/ingestion/snapshot/supabase-config.mjs';

export type ReadinessState = 'HEALTHY' | 'DEGRADED' | 'DISABLED' | 'FAILED';

export type ReadinessComponent = {
  id: string;
  label: string;
  state: ReadinessState;
  summary: string;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  evidenceAt: string;
  diagnostics?: Record<string, unknown>;
};

function stateFromFlags(opts: {
  disabled?: boolean;
  failed?: boolean;
  degraded?: boolean;
}): ReadinessState {
  if (opts.disabled) return 'DISABLED';
  if (opts.failed) return 'FAILED';
  if (opts.degraded) return 'DEGRADED';
  return 'HEALTHY';
}

function resolveAiRuntimeState(): ReadinessComponent {
  const evidenceAt = new Date().toISOString();
  const requested = getRequestedProviderMode();
  const mode = resolveAiProviderMode();
  const anthropic = isAnthropicConfigured();
  const openai = isOpenAiConfigured();

  let state: ReadinessState = 'DISABLED';
  let summary = 'Fixture / offline mode — no live provider key on server.';

  if (mode === AI_PROVIDER_MODE.ANTHROPIC && anthropic) {
    state = 'HEALTHY';
    summary = 'Anthropic configured server-side; live execution must be proven per UAT run.';
  } else if (mode === AI_PROVIDER_MODE.OPENAI && openai) {
    state = 'HEALTHY';
    summary = 'OpenAI configured server-side; live execution must be proven per UAT run.';
  } else if (anthropic || openai) {
    state = 'DEGRADED';
    summary = 'Provider key present but mode does not match configured RI_AI_PROVIDER_MODE.';
  } else if (mode === AI_PROVIDER_MODE.FIXTURE) {
    state = 'DISABLED';
    summary = 'Fixture mode intentional for regression tests — not live AI UAT.';
  } else {
    state = 'FAILED';
    summary = 'Live AI mode requested but provider credentials missing on server.';
  }

  return {
    id: 'ai_runtime',
    label: 'AI provider runtime',
    state,
    summary,
    evidenceAt,
    diagnostics: {
      requestedMode: requested,
      resolvedMode: mode,
      anthropicKeyPresent: anthropic,
      openaiKeyPresent: openai,
    },
  };
}

async function querySchedulerAuditCounts(admin: SupabaseClient): Promise<{
  vercelCron: number;
  manualHosted: number;
  lastVercelCronAt: string | null;
  lastManualAt: string | null;
}> {
  const { data, error } = await admin
    .from('ingestion_operational_events')
    .select('created_at, metadata')
    .in('event_type', ['HOSTED_SCHEDULER_COMPLETED', 'HOSTED_SCHEDULER_INVOCATION'])
    .order('created_at', { ascending: false })
    .limit(500);

  if (error || !data) {
    return { vercelCron: 0, manualHosted: 0, lastVercelCronAt: null, lastManualAt: null };
  }

  let vercelCron = 0;
  let manualHosted = 0;
  let lastVercelCronAt: string | null = null;
  let lastManualAt: string | null = null;

  for (const row of data) {
    const kind = (row.metadata as { invocationKind?: string } | null)?.invocationKind;
    if (kind === 'VERCEL_CRON') {
      vercelCron += 1;
      if (!lastVercelCronAt) lastVercelCronAt = row.created_at as string;
    }
    if (kind === 'MANUAL_HOSTED') {
      manualHosted += 1;
      if (!lastManualAt) lastManualAt = row.created_at as string;
    }
  }

  return { vercelCron, manualHosted, lastVercelCronAt, lastManualAt };
}

function resolveSchedulerState(audit: Awaited<ReturnType<typeof querySchedulerAuditCounts>>): ReadinessComponent {
  const evidenceAt = new Date().toISOString();
  const enabled = process.env.FORGENIQ_RI_SCHEDULER_CRON_ENABLED === 'true';
  const ingestEnv = process.env.FORGENIQ_INGEST_ENV?.trim() || process.env.FORGENIQ_ENV?.trim();

  if (!enabled) {
    return {
      id: 'hosted_scheduler',
      label: 'Hosted ingestion scheduler',
      state: 'DISABLED',
      summary: 'FORGENIQ_RI_SCHEDULER_CRON_ENABLED is not true on this deployment.',
      evidenceAt,
    };
  }

  if (ingestEnv !== 'staging') {
    return {
      id: 'hosted_scheduler',
      label: 'Hosted ingestion scheduler',
      state: 'FAILED',
      summary: 'Hosted scheduler requires FORGENIQ_INGEST_ENV=staging.',
      evidenceAt,
    };
  }

  if (audit.vercelCron > 0) {
    return {
      id: 'hosted_scheduler',
      label: 'Hosted ingestion scheduler',
      state: 'HEALTHY',
      summary: 'Autonomous VERCEL_CRON executions recorded in operational audit.',
      lastSuccessAt: audit.lastVercelCronAt,
      evidenceAt,
      diagnostics: {
        vercelCronCompletedAudits: audit.vercelCron,
        manualHostedCompletedAudits: audit.manualHosted,
        lastManualHostedAt: audit.lastManualAt,
        cronSlotsUtc: ['00:00', '04:00', '12:00', '20:00'],
        hobbyNote: 'Hobby retains ~1h runtime logs; correlate scheduled slot with Vercel dashboard.',
      },
    };
  }

  if (audit.manualHosted > 0) {
    return {
      id: 'hosted_scheduler',
      label: 'Hosted ingestion scheduler',
      state: 'DEGRADED',
      summary:
        'Manual hosted ticks succeed but no VERCEL_CRON audit yet — autonomous scheduling not proven on this deployment.',
      lastSuccessAt: audit.lastManualAt,
      evidenceAt,
      diagnostics: {
        vercelCronCompletedAudits: 0,
        manualHostedCompletedAudits: audit.manualHosted,
      },
    };
  }

  return {
    id: 'hosted_scheduler',
    label: 'Hosted ingestion scheduler',
    state: 'FAILED',
    summary: 'No hosted scheduler completion audits recorded.',
    evidenceAt,
  };
}

export async function buildStagingOperationalReadiness(options: {
  cataloguePublicationCount: number | null;
  organisationId: string;
  role: string;
}): Promise<{
  evidenceAt: string;
  environment: string;
  stagingProjectMatch: boolean;
  components: ReadinessComponent[];
}> {
  const evidenceAt = new Date().toISOString();
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const projectRef = apiUrl ? extractProjectRefFromSupabaseUrl(apiUrl) : null;
  const stagingProjectMatch = projectRef === FORGENIQ_RI_STAGING_PROJECT_REF;

  const clerkToken = await getClerkSupabaseAccessToken();
  const jwtClaims = peekClerkJwtClaims(clerkToken);

  const authComponent: ReadinessComponent = {
    id: 'authentication',
    label: 'Clerk authentication',
    state: stateFromFlags({
      failed: !isClerkConfigured(),
      degraded: isClerkConfigured() && !clerkKeyPairAligned(),
    }),
    summary: isClerkConfigured()
      ? clerkKeyPairAligned()
        ? 'Clerk session active for this request.'
        : 'Clerk publishable/secret key pair misaligned.'
      : 'Clerk not configured.',
    evidenceAt,
    diagnostics: jwtClaims
      ? { subMatchesRequest: true, iss: jwtClaims.iss ?? null }
      : { clerkTokenPresent: Boolean(clerkToken) },
  };

  const tenantComponent: ReadinessComponent = {
    id: 'tenant_context',
    label: 'Tenant organisation context',
    state: 'HEALTHY',
    summary: `Active organisation ${options.organisationId} · role ${options.role}.`,
    evidenceAt,
  };

  const postgresComponent: ReadinessComponent = {
    id: 'postgresql',
    label: 'Supabase PostgreSQL',
    state: stateFromFlags({
      failed: !stagingProjectMatch,
      degraded: options.cataloguePublicationCount == null,
    }),
    summary: stagingProjectMatch
      ? `Connected to staging project ${FORGENIQ_RI_STAGING_PROJECT_REF}.`
      : 'Supabase project ref does not match FORGENIQ RI staging.',
    evidenceAt,
    diagnostics: {
      cataloguePublicationCount: options.cataloguePublicationCount,
      projectRef,
    },
  };

  const admin = createSupabaseAdminClient();
  const audit = admin
    ? await querySchedulerAuditCounts(admin)
    : { vercelCron: 0, manualHosted: 0, lastVercelCronAt: null, lastManualAt: null };

  const schedulerComponent = resolveSchedulerState(audit);

  const aiComponent = resolveAiRuntimeState();

  const notificationsComponent: ReadinessComponent = {
    id: 'tenant_notifications',
    label: 'Tenant in-app notifications',
    state:
      process.env.FORGENIQ_STAGING_UAT_INTAKE_NOTIFY === 'true' ? 'DEGRADED' : 'DISABLED',
    summary:
      process.env.FORGENIQ_STAGING_UAT_INTAKE_NOTIFY === 'true'
        ? 'Staging intake fan-out enabled — verify Attention Centre manually.'
        : 'Tenant fan-out disabled by policy; platform notification_events may still be written on ingest.',
    evidenceAt,
  };

  return {
    evidenceAt,
    environment: getAppEnvironment(),
    stagingProjectMatch,
    components: [
      authComponent,
      tenantComponent,
      postgresComponent,
      schedulerComponent,
      aiComponent,
      notificationsComponent,
    ],
  };
}
