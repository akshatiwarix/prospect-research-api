/**
 * The console's view of the API, hand-written from the published schema.
 *
 * Deliberately *not* imported from `lib/`. The console is a client of this
 * service and nothing more, and a component that imports `ResearchResponse` from
 * the server's own module has a structural dependency the contract does not
 * describe — which is how "our API is the product" quietly becomes "our API is a
 * side effect of our UI". Anything wrong in here is a bug the schema at
 * `/api/schema` would have caught, which is the point.
 */

export type FieldState = "resolved" | "unknown" | "absent" | "not_attempted" | "unavailable";

export type FieldReason =
  | "ok"
  | "deadline"
  | "dependency_failed"
  | "unmapped"
  | "upstream_error"
  | "upstream_unconfigured"
  | "upstream_rate_limited"
  | "timeout"
  | "boundary_violation"
  | "excluded_by_caller";

export type Box = {
  value?: unknown;
  state: FieldState;
  reason: FieldReason;
  capability: string;
  upstream_key?: string;
  observed_at?: string;
  retry_after_s?: number;
};

export type CapabilitySummary = {
  state: FieldState;
  reason: FieldReason;
  elapsed_ms?: number;
  upstream_key?: string;
};

export type ResearchDocument = {
  schema_version: string;
  request_id: string;
  request_digest: string;
  company: { canonical_id: string; input: string; matched_alias?: string };
  completeness: "complete" | "partial" | "none";
  transport: "fixture" | "live";
  fields: Record<string, Record<string, Box>>;
  capabilities: Record<string, CapabilitySummary>;
  budget: { granted_ms: number; tier0_slice_ms: number; remaining_after_tier0_ms: number; elapsed_ms: number };
  deprecations: Array<{ path: string; replacement: string; sunset: string }>;
};

export type Directory = {
  capabilities: Array<{
    id: string;
    upstream: string;
    shipped_by: string;
    tier: number;
    depends_on: string[];
  }>;
  companies: Array<{
    canonical_id: string;
    name: string;
    origin: "real" | "synthetic";
    known_to: string[];
    bound: Record<string, boolean>;
    bound_count: number;
  }>;
  note: string;
};

export type Deprecation = ResearchDocument["deprecations"][number];
