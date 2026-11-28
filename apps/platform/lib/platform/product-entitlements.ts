import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RiAction } from '@/lib/ri/permissions';

/** Commercial product SKUs — entitlements are enforced server-side per organisation. */
export const FORGENIQ_PRODUCTS = [
  'market_intelligence',
  'regulatory_intelligence',
  'risk_controls',
  'financial_crime',
] as const;

export type ForgeniqProduct = (typeof FORGENIQ_PRODUCTS)[number];

const DEFAULT_ENTITLEMENTS: ForgeniqProduct[] = [
  'market_intelligence',
  'regulatory_intelligence',
  'risk_controls',
];

export class ProductAccessError extends Error {
  readonly product: ForgeniqProduct;
  constructor(product: ForgeniqProduct) {
    super('product_not_entitled');
    this.name = 'ProductAccessError';
    this.product = product;
  }
}

function parseEntitlements(raw: unknown): ForgeniqProduct[] {
  if (Array.isArray(raw)) {
    const set = new Set<ForgeniqProduct>();
    for (const item of raw) {
      if (typeof item === 'string' && (FORGENIQ_PRODUCTS as readonly string[]).includes(item)) {
        set.add(item as ForgeniqProduct);
      }
    }
    if (set.size > 0) return [...set];
  }
  const env = process.env.FORGENIQ_DEFAULT_PRODUCT_ENTITLEMENTS?.trim();
  if (env && env !== 'all') {
    return env
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is ForgeniqProduct => (FORGENIQ_PRODUCTS as readonly string[]).includes(s));
  }
  return DEFAULT_ENTITLEMENTS;
}

export async function loadOrganisationProductEntitlements(
  supabase: SupabaseClient,
  organisationId: string,
): Promise<ForgeniqProduct[]> {
  const { data, error } = await supabase
    .from('organisations')
    .select('product_entitlements')
    .eq('id', organisationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return parseEntitlements(data?.product_entitlements);
}

const GRC_ACTIONS: RiAction[] = [
  'risk:read',
  'risk:write',
  'risk:submit',
  'risk:approve',
  'control:read',
  'control:write',
  'control:submit',
  'control:approve',
  'assurance:read',
  'assurance:write',
  'assurance:submit',
  'assurance:approve',
  'policy:read',
  'policy:write',
  'action:read',
  'action:write',
  'evidence:read',
  'evidence:write',
  'finding:read',
  'finding:write',
  'finding:close',
];

const RI_ONLY_ACTIONS: RiAction[] = [
  'triage:read',
  'triage:write',
  'applicability:read',
  'applicability:write',
  'change:read',
  'change:write',
  'impact:read',
  'impact:write',
  'impact:submit',
  'impact:review',
  'impact:approve',
  'obligation:read',
  'obligation:write',
  'obligation:review',
  'ingestion:read',
  'ingestion:acknowledge',
  'ingestion:run_test',
  'ai:read',
  'ai:request',
  'ai:review',
  'ai:governance',
  'ask-ri:read',
];

/** Which product licence is required (any-of) for an API permission. */
export function productsRequiredForRiAction(action: RiAction): ForgeniqProduct[] {
  if (GRC_ACTIONS.includes(action)) {
    return ['risk_controls', 'regulatory_intelligence'];
  }
  if (RI_ONLY_ACTIONS.includes(action)) {
    return ['regulatory_intelligence'];
  }
  return ['regulatory_intelligence', 'risk_controls'];
}

export function assertOrganisationHasAnyProduct(
  entitled: ForgeniqProduct[],
  requiredAny: ForgeniqProduct[],
): void {
  if (requiredAny.some((p) => entitled.includes(p))) return;
  throw new ProductAccessError(requiredAny[0]);
}