import { z } from "zod";

import { FIELD_REASONS } from "@/lib/envelope";
import type { FixtureRecord, FixtureStore } from "@/lib/transport";
import { UPSTREAM_HOSTS } from "@/data/upstreams";

import recordedJson from "./recorded.json";
import { AUTHORED_FIXTURES } from "./authored";

/**
 * The fixture store: recordings first, authored records where the network cannot
 * answer, and a parse at import so a bad hand-edit fails the build rather than
 * the first request that happens to touch it.
 *
 * Precedence is recorded-over-authored, and it matters. Both halves contain
 * `techstack_icp:northwind.example` — the recording is a real 502, the authored
 * one is a working inspection. If authored records won, a single careless
 * addition here would quietly replace observed reality with a wish. So the
 * recorded half is loaded first and the authored half only fills gaps.
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

/** Recordings win; authored records fill the gaps they leave. */
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

export const FIXTURE_STORE: FixtureStore = mergeFixtures(RECORDED_FIXTURES, AUTHORED_FIXTURES);

/**
 * The live-shaped store: recordings only, so a "what does the network actually
 * do today" document can be produced without the network. Used by the console's
 * side-by-side view and by the sweep, where reaching out to six deployments
 * thousands of times would be both slow and rude.
 */
export const RECORDED_ONLY_STORE: FixtureStore = RECORDED_FIXTURES;

export { AUTHORED_FIXTURES };
