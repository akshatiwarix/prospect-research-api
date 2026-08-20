import { z } from "zod";

import { fieldReasonSchema, fieldStateSchema } from "./field";
import type { FieldReason, FieldState } from "./states";

/**
 * The document skeleton, deliberately generic over the field tree.
 *
 * `lib/envelope/` knows what a box is and how completeness is computed. It does
 * not know that `technographics` exists. Keeping the capability set out of this
 * module is what lets the schema endpoint, the walker and the completeness rule
 * be tested against synthetic capability sets rather than only against the six
 * real ones — the sweep's cross-product depends on it.
 */

export const COMPLETENESS = ["complete", "partial", "none"] as const;
export type Completeness = (typeof COMPLETENESS)[number];

export type CapabilitySummary = {
  state: FieldState;
  reason: FieldReason;
  elapsed_ms?: number;
  upstream_key?: string;
};

export type Budget = {
  granted_ms: number;
  tier0_slice_ms: number;
  remaining_after_tier0_ms: number;
  elapsed_ms: number;
};

export type Deprecation = {
  path: string;
  replacement: string;
  sunset: string;
};

export type ResearchDocument<Fields> = {
  schema_version: "1";
  request_id: string;
  request_digest: string;
  company: {
    canonical_id: string;
    input: string;
    matched_alias?: string;
  };
  completeness: Completeness;
  transport: "fixture" | "live";
  fields: Fields;
  capabilities: Record<string, CapabilitySummary>;
  budget: Budget;
  deprecations: Deprecation[];
};

/**
 * Completeness is **derived, never assigned**. Sweep invariant 6 recomputes it
 * from the capability summaries and compares, so a route that sets it by hand
 * fails the build rather than shipping a document whose headline disagrees with
 * its own body.
 *
 * The rule turns on `reason === "ok"` rather than on `state === "resolved"`, and
 * the distinction is the whole reason this function is three lines instead of
 * one. A capability that ran and reported `unknown` did its job. Counting it as
 * incomplete would tell the caller to retry, when the honest signal is that the
 * upstream looked and there was nothing there. Completeness is a statement about
 * *coverage of the attempt*, not about how much data came back.
 */
export function deriveCompleteness(
  capabilities: Record<string, CapabilitySummary>,
): Completeness {
  const summaries = Object.values(capabilities);
  if (summaries.length === 0) return "none";

  const answered = summaries.filter((summary) => summary.reason === "ok").length;
  if (answered === summaries.length) return "complete";
  if (answered === 0) return "none";
  return "partial";
}

export const capabilitySummarySchema = z.object({
  state: fieldStateSchema,
  reason: fieldReasonSchema,
  elapsed_ms: z.number().int().nonnegative().optional(),
  upstream_key: z.string().min(1).optional(),
});

export const budgetSchema = z.object({
  granted_ms: z.number().int().positive(),
  tier0_slice_ms: z.number().int().nonnegative(),
  remaining_after_tier0_ms: z.number().int(),
  elapsed_ms: z.number().int().nonnegative(),
});

export const deprecationSchema = z.object({
  path: z.string().min(1),
  replacement: z.string().min(1),
  sunset: z.string().min(1),
});

export function researchDocumentSchema<F extends z.ZodTypeAny>(fields: F) {
  return z
    .object({
      schema_version: z.literal("1"),
      request_id: z.string().min(1),
      request_digest: z.string().min(1),
      company: z.object({
        canonical_id: z.string().min(1),
        input: z.string().min(1),
        matched_alias: z.string().min(1).optional(),
      }),
      completeness: z.enum(COMPLETENESS),
      transport: z.enum(["fixture", "live"]),
      fields,
      capabilities: z.record(z.string(), capabilitySummarySchema),
      budget: budgetSchema,
      deprecations: z.array(deprecationSchema),
    })
    .refine((doc) => doc.completeness === deriveCompleteness(doc.capabilities), {
      message: "completeness disagrees with the capability summaries it is derived from",
    });
}
