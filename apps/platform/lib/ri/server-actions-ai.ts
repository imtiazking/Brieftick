'use server';

import { revalidatePath } from 'next/cache';
import { requireRiContext } from '@/lib/ri/context';
import { requestPublicationAnalysis, submitAnalysisReview } from '@/lib/ri/services/ai-analysis';

export async function requestPublicationAiAnalysisAction(formData: FormData) {
  const ctx = await requireRiContext('ai:request');
  const publicationId = String(formData.get('publication_id') || '');
  const publicationVersionId = String(formData.get('publication_version_id') || '');
  const useCaseId = String(formData.get('use_case_id') || 'UC-RI-001');
  await requestPublicationAnalysis(ctx.supabase, {
    organisationId: ctx.organisationId,
    userId: ctx.userId,
    role: ctx.role,
    publicationId,
    publicationVersionId,
    useCaseId,
  });
  revalidatePath(`/ri/publications/${publicationId}`);
  revalidatePath('/ri/ai');
}

export async function submitAiReviewAction(formData: FormData) {
  const ctx = await requireRiContext('ai:review');
  const runId = String(formData.get('run_id') || '');
  const decision = String(formData.get('decision') || 'REJECTED') as
    | 'ACCEPTED'
    | 'PARTIALLY_ACCEPTED'
    | 'REJECTED';
  const accepted = String(formData.get('accepted_claim_indexes') || '')
    .split(',')
    .filter(Boolean)
    .map((n) => Number(n));
  const rejected = String(formData.get('rejected_claim_indexes') || '')
    .split(',')
    .filter(Boolean)
    .map((n) => Number(n));
  const notes = formData.get('notes') ? String(formData.get('notes')) : undefined;
  await submitAnalysisReview(ctx.supabase, {
    organisationId: ctx.organisationId,
    userId: ctx.userId,
    role: ctx.role,
    runId,
    decision,
    acceptedClaimIndexes: accepted,
    rejectedClaimIndexes: rejected,
    notes,
  });
  revalidatePath(`/ri/ai/${runId}`);
  revalidatePath('/ri/ai');
}
