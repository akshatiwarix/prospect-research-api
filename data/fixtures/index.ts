import { z } from "zod";

import { FIELD_REASONS } from "@/lib/envelope";
import type { FixtureRecord, FixtureStore } from "@/lib/transport";
import { UPSTREAM_HOSTS } from "@/data/upstreams";

import recordedJson from "./recorded.json";
import { AUTHORED_FIXTURES } from "./authored";

/**
 * Two stores, deliberately not one.
 *
 * The first attempt merged both halves with recordings winning, on the reasoning
 * that an authored fixture must never quietly replace an observation. That
 * reasoning is sound and the implementation was wrong: since every authored
 * record exists *precisely because* the recording is a failure, recordings
 * winning made the authored half unreachable. Day 006's brief could never appear
 * in any document, and the "what this looks like when the upstreams work" column
 * showed the same 404 as the live one.
 *
 * The honest fix is not a precedence rule, it is two named worlds:
 *
 *   `FIXTURE_STORE`        the counterfactual. Authored records win, because
 *                          showing a complete document is the entire point of
 *                          having them.
 *   `RECORDED_ONLY_STORE`  what the deployments actually did, with no authored
 *                          record anywhere near it.
 *
 * Nothing is silently substituted, because nothing is merged behind the reader's
 * back: every record carries `origin`, the console labels the column, and the
 * live transport goes to the real network. A wish and an observation are two
 * columns rather than one blended row.
 */

const failureSchema = z.object({
  reason: z.enum(FIELD_REASONS),
  retry_after_s: z.number().int().nonnegative().optional(),
  detail: z.string().min(1),
});

const recordSchema = z
  .object({
    upstream: z.enum(Object.keys(UPSTREAM_HOSTS) as [string, ...string[]]),
    key: z.string().min(1),
    latency_ms: z.number().int().nonnegative(),
    overshoot_ms: z.number().int().nonnegative().optional(),
    origin: z.enum(["recorded", "authored"]).optional(),
    recorded_at: z.string().min(1).optional(),
    body: z.unknown().optional(),
    failure: failureSchema.optional(),
  })
  .refine((record) => (record.body === undefined) !== (record.failure === undefined), {
    message: "a fixture records exactly one of body or failure",
  });

export const RECORDED_FIXTURES = recordSchema.array().parse(recordedJson) as unknown as readonly FixtureRecord[];

/** First half wins on a collision. Order is the caller's statement of intent. */
export function mergeFixtures(...halves: readonly FixtureStore[]): FixtureStore {
  const merged = new Map<string, FixtureRecord>();
  for (const half of halves) {
    for (const record of half) {
      const id = `${record.upstream}:${record.key}`;
      if (!merged.has(id)) merged.set(id, record);
    }
  }
  return [...merged.values()];
}

/**
 * The counterfactual world. Authored first, so the four `.example` inspections
 * and the three briefs actually reach a document.
 */
export const FIXTURE_STORE: FixtureStore = mergeFixtures(AUTHORED_FIXTURES, RECORDED_FIXTURES);

/**
 * The observed world, replayable without touching the network — for the sweep,
 * where reaching out to six deployments ten thousand times would be both slow and
 * rude, and for the scenarios that assert what a deployment really did.
 */
export const RECORDED_ONLY_STORE: FixtureStore = RECORDED_FIXTURES;

export { AUTHORED_FIXTURES };
