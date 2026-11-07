import type { SupabaseClient } from '@supabase/supabase-js';

export type GlobalRegulatorRow = {
  id: string;
  external_key: string;
  name: string;
  acronym: string;
  jurisdiction: string;
  country: string;
  official_base_url: string;
  lifecycle_status: string;
};

export type GlobalRegulatorySourceRow = {
  id: string;
  external_key: string;
  name: string;
  production_status: string;
  ingestion_mode: string | null;
  regulator: {
    id: string;
    external_key: string;
    acronym: string;
    name: string;
  } | null;
};

export async function listGlobalRegulators(supabase: SupabaseClient): Promise<GlobalRegulatorRow[]> {
  const { data, error } = await supabase
    .from('regulators')
    .select('id, external_key, name, acronym, jurisdiction, country, official_base_url, lifecycle_status')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as GlobalRegulatorRow[];
}

export async function listGlobalRegulatorySources(
  supabase: SupabaseClient,
): Promise<GlobalRegulatorySourceRow[]> {
  const { data, error } = await supabase
    .from('regulatory_sources')
    .select(
      `
      id, external_key, name, production_status, ingestion_mode,
      regulator:regulators(id, external_key, acronym, name)
    `,
    )
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...row,
    regulator: Array.isArray(row.regulator) ? row.regulator[0] : row.regulator,
  })) as GlobalRegulatorySourceRow[];
}
