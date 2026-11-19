-- Conceptual PostgreSQL schema (not executed in Design Lab)
CREATE TABLE tenants (
  id UUID PRIMARY KEY,
  business_ref TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  data_region TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL
);

CREATE TABLE regulatory_changes (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  business_ref TEXT NOT NULL,
  publication_id UUID,
  title TEXT NOT NULL,
  materiality TEXT,
  row_version INT NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, business_ref)
);

CREATE TABLE impact_assessments (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  business_ref TEXT NOT NULL,
  change_id UUID REFERENCES regulatory_changes(id),
  status TEXT,
  row_version INT NOT NULL DEFAULT 1
);

CREATE TABLE audit_events (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  actor_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  correlation_id TEXT,
  payload JSONB
);
-- Additional tables: obligations, controls, evidence (metadata), approval_*, ai_*, assurance_*, jobs
