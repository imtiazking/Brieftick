import { buildSeedState, linkSeedRelationships } from './seed-data.js';
import { syncGraphLinks } from './graph-sync.js';
import { applyOperationalSeed } from './seed-operational.js';
import { applyIngestionSeed } from './ingestion-seed.js';
import { applyGovernanceSeed } from './governance-seed.js';
import { applyAiGovernanceSeed } from './ai-governance-seed.js';
import { applyAssuranceSeed } from './assurance-seed.js';
import { applyPlatformSeed } from './platform/platform-seed.js';
import { applyAiRuntimeSeed } from './ai-runtime/ai-runtime-seed.js';
import { applyLandscapeSeed } from './landscape-seed.js';
import { applyLegislationSeed } from './legislation-seed.js';
import { applyTprSeed } from './tpr-seed.js';
import { applyBaselSeed } from './basel-seed.js';
import { applyAiDomainSeed } from './ai/ai-domain-seed.js';
import {
  STORAGE_KEY_V2,
  STORAGE_KEY_V1,
  loadPersistedRaw,
  savePersistedJson,
  clearPlatformStorageKeys,
} from './platform/platform-persistence.js';
import { validateMinimalState } from './platform/startup-validation.js';

export { STORAGE_KEY_V2, STORAGE_KEY_V1 };
export const SCHEMA_VERSION = 16;

export function createFreshState() {
  const state = buildSeedState();
  state.schemaVersion = SCHEMA_VERSION;
  applyLandscapeSeed(state);
  applyLegislationSeed(state);
  applyTprSeed(state);
  applyBaselSeed(state);
  applyAiDomainSeed(state);
  return linkSeedRelationships(syncGraphLinks(state));
}

export function migratePersistedState() {
  const v2 = loadPersistedRaw(STORAGE_KEY_V2);
  if (v2.ok && v2.value) {
    try {
      const migrated = migrateSavedSnapshot(v2.value);
      const check = validateMinimalState(migrated);
      if (!check.ok) {
        return loadSafeBaseline('Persisted state failed validation');
      }
      return migrated;
    } catch {
      /* continue */
    }
  }
  if (v2.corrupt) {
    return loadSafeBaseline('Local demo state was corrupted and could not be parsed');
  }

  const v1 = loadPersistedRaw(STORAGE_KEY_V1);
  if (v1.ok && v1.value) {
    try {
      const migrated = migrateSavedSnapshot(v1.value);
      savePersistedJson(STORAGE_KEY_V2, migrated);
      return migrated;
    } catch {
      /* continue */
    }
  }

  return loadSafeBaseline(null);
}

function loadSafeBaseline(message) {
  const fresh = createFreshState();
  if (message) {
    fresh.persistenceRecovery = { usedBaseline: true, message, at: new Date().toISOString() };
  }
  savePersistedJson(STORAGE_KEY_V2, fresh);
  return fresh;
}

/** Idempotent migration to current schema (safe for tests and re-run). */
export function migrateSavedSnapshot(saved) {
  const parsed = { ...saved };
  if (!parsed.schemaVersion) parsed.schemaVersion = 1;
  const merged = mergeWithSeed(parsed);
  merged.schemaVersion = SCHEMA_VERSION;
  return applyOperationalSeed(linkSeedRelationships(syncGraphLinks(merged)));
}

/** Ensure new seed fields exist without wiping user workflow edits */
function mergeWithSeed(saved) {
  const fresh = createFreshState();
  fresh.scenarioId = saved.scenarioId || fresh.scenarioId;

  fresh.publications.forEach((p) => {
    const old = saved.publications?.find((x) => x.id === p.id);
    if (old) {
      p.applicabilityDecision = old.applicabilityDecision ?? p.applicabilityDecision;
      p.applicabilityConfidence = old.applicabilityConfidence ?? p.applicabilityConfidence;
      p.workflowStatus = old.workflowStatus ?? p.workflowStatus;
      p.unreviewed = old.unreviewed ?? p.unreviewed;
      p.priority = old.priority ?? p.priority;
    }
  });

  fresh.changes.forEach((c) => {
    const old = saved.changes?.find((x) => x.id === c.id);
    if (old) {
      c.applicabilityDecision = old.applicabilityDecision ?? c.applicabilityDecision;
      c.applicabilityRecommendation = old.applicabilityRecommendation ?? c.applicabilityRecommendation;
      c.status = old.status ?? c.status;
      c.applicabilityReasoning = old.applicabilityReasoning ?? c.applicabilityReasoning;
      if (old.decisionMeta) c.decisionMeta = old.decisionMeta;
    }
  });

  fresh.assessments.forEach((a) => {
    const old = saved.assessments?.find((x) => x.id === a.id);
    if (old?.status) a.status = old.status;
  });

  fresh.actions.forEach((a) => {
    const old = saved.actions?.find((x) => x.id === a.id);
    if (old?.status) a.status = old.status;
    if (old?.coverage) a.coverage = old.coverage;
  });

  fresh.obligations.forEach((o) => {
    const old = saved.obligations?.find((x) => x.id === o.id);
    if (old?.coverage) o.coverage = old.coverage;
    if (old?.status) o.status = old.status;
  });

  const auditMap = new Map();
  [...(saved.auditEvents || []), ...fresh.auditEvents].forEach((e) => {
    auditMap.set(e.id || `${e.timestamp}-${e.action}`, e);
  });
  fresh.auditEvents = [...auditMap.values()].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  fresh.applicabilityOverrides = saved.applicabilityOverrides || fresh.applicabilityOverrides;
  fresh.changeApplicabilityOverrides = saved.changeApplicabilityOverrides || fresh.changeApplicabilityOverrides || {};
  fresh.currentDemoUserId = saved.currentDemoUserId || fresh.currentDemoUserId;
  fresh.notificationReadIds = saved.notificationReadIds || fresh.notificationReadIds || [];
  fresh.orgProfile = saved.orgProfile || fresh.orgProfile;

  fresh.publications.forEach((p) => {
    const old = saved.publications?.find((x) => x.id === p.id);
    if (!old) return;
    if (old.triageStatus) p.triageStatus = old.triageStatus;
    if (old.intakeAccepted != null) p.intakeAccepted = old.intakeAccepted;
    if (old.assignedReviewerId !== undefined) p.assignedReviewerId = old.assignedReviewerId;
    if (old.ownerId) p.ownerId = old.ownerId;
    if (old.triageSlaDue) p.triageSlaDue = old.triageSlaDue;
  });

  fresh.changes.forEach((c) => {
    const old = saved.changes?.find((x) => x.id === c.id);
    if (old?.ownerId) c.ownerId = old.ownerId;
    if (old?.reviewerId) c.reviewerId = old.reviewerId;
    if (old?.applicabilityDecision) c.applicabilityDecision = old.applicabilityDecision;
  });

  fresh.assessments.forEach((a) => {
    const old = saved.assessments?.find((x) => x.id === a.id);
    if (old?.status) a.status = old.status;
    if (old?.approvalStatus) a.approvalStatus = old.approvalStatus;
    if (old?.ownerId) a.ownerId = old.ownerId;
  });

  fresh.actions.forEach((a) => {
    const old = saved.actions?.find((x) => x.id === a.id);
    if (old?.status) a.status = old.status;
    if (old?.ownerId) a.ownerId = old.ownerId;
    if (old?.dueDate) a.dueDate = old.dueDate;
  });

  if ((saved.schemaVersion || 0) < 4 || !saved.regulatorySources?.length) {
    applyIngestionSeed(fresh);
    fresh.mockIngestionRunCounter = saved.mockIngestionRunCounter || 0;
    if (saved.ingestionRuns?.length) {
      const ids = new Set(fresh.ingestionRuns.map((r) => r.id));
      saved.ingestionRuns.forEach((r) => {
        if (!ids.has(r.id)) fresh.ingestionRuns.unshift(r);
      });
    }
    if (saved.rawSourceItems?.length) {
      saved.rawSourceItems.forEach((r) => {
        const i = fresh.rawSourceItems.findIndex((x) => x.id === r.id);
        if (i >= 0) fresh.rawSourceItems[i] = { ...fresh.rawSourceItems[i], ...r };
      });
    }
    saved.publications?.forEach((oldP) => {
      if (!fresh.publications.some((p) => p.id === oldP.id)) fresh.publications.push(oldP);
    });
    saved.changes?.forEach((oldC) => {
      if (!fresh.changes.some((c) => c.id === oldC.id)) fresh.changes.push(oldC);
    });
  }

  if ((saved.schemaVersion || 0) < 5 || !saved.governancePolicies?.length) {
    applyGovernanceSeed(fresh);
  }

  if ((saved.schemaVersion || 0) < 6 || !saved.aiAnalyses?.length) {
    applyAiGovernanceSeed(fresh);
  }

  if ((saved.schemaVersion || 0) < 7 || !saved.assuranceReviews?.length) {
    applyAssuranceSeed(fresh);
  }

  if ((saved.schemaVersion || 0) < SCHEMA_VERSION || !saved.platformConfig) {
    applyPlatformSeed(fresh);
  }

  if ((saved.schemaVersion || 0) < 10 || !fresh.aiProviders?.length) {
    applyAiRuntimeSeed(fresh);
  }

  if ((saved.schemaVersion || 0) < 11 || !fresh.sectors?.length) {
    applyLandscapeSeed(fresh);
  } else if (saved.customerSectorPreferences) {
    fresh.customerSectorPreferences = saved.customerSectorPreferences;
  }

  if ((saved.schemaVersion || 0) < 12 || !fresh.legislationRecords?.length) {
    if (saved.legislationVerificationEvidence) fresh.legislationVerificationEvidence = saved.legislationVerificationEvidence;
    applyLegislationSeed(fresh);
  } else if (saved.legislationVerificationEvidence) {
    fresh.legislationVerificationEvidence = saved.legislationVerificationEvidence;
    applyLegislationSeed(fresh);
  }

  if ((saved.schemaVersion || 0) < 13 || !fresh.tprPublicationRecords?.length) {
    if (saved.tprVerificationEvidence) fresh.tprVerificationEvidence = saved.tprVerificationEvidence;
    applyTprSeed(fresh);
  } else if (saved.tprVerificationEvidence) {
    fresh.tprVerificationEvidence = saved.tprVerificationEvidence;
    applyTprSeed(fresh);
  }

  if ((saved.schemaVersion || 0) < 14 || !fresh.baselPublicationRecords?.length) {
    if (saved.baselVerificationEvidence) fresh.baselVerificationEvidence = saved.baselVerificationEvidence;
    if (saved.internationalImplementationMappings) {
      fresh.internationalImplementationMappings = saved.internationalImplementationMappings;
    }
    applyBaselSeed(fresh);
  } else if (saved.baselVerificationEvidence) {
    fresh.baselVerificationEvidence = saved.baselVerificationEvidence;
    applyBaselSeed(fresh);
  }

  if ((saved.schemaVersion || 0) < 16 || !fresh.aiPromptCatalog?.length) {
    applyAiDomainSeed(fresh, saved);
  } else {
    applyAiDomainSeed(fresh, saved);
  }

  fresh.schemaVersion = SCHEMA_VERSION;
  return fresh;
}

function migrateV1ToV2(old) {
  return mergeWithSeed(old);
}

export function clearAllLabStorage() {
  clearPlatformStorageKeys();
}
