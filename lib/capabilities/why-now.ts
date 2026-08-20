import { z } from "zod";

import { absent, resolved, unknown, type Field } from "@/lib/envelope";
import type { Capability, FieldMap } from "./types";

/**
 * `why_now` — Day 007 `why-now`, `POST /api/hypotheses`.
 *
 * The binding is a *pair*: Day 007's verdicts are seller-dependent by design, so
 * a timing hypothesis only exists relative to who is selling. That makes this the
 * clearest demonstration that a binding is not an identifier — the same company
 * with a different `sellerId` is a different, equally valid request, and the
 * directory has to name which seller this service asks as.
 *
 * The `absent` branch is the one worth reading. Day 007 returns both what it
 * emitted and what it rejected, with counts. Zero emitted *and* something
 * rejected means the reasoning ran and concluded there is no case to make right
 * now — an affirmative finding, so `absent`. Zero emitted and zero rejected means
 * there was nothing to reason over, so `unknown`. Collapsing those two would
 * throw away the difference between "we looked and there is no why-now" and "we
 * have no observations for this company", which is the difference between
 * skipping the account and going to get data.
 */

const countsSchema = z.object({
  emitted: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative().optional(),
  defeated: z.number().int().nonnegative().optional(),
  stale: z.number().int().nonnegative().optional(),
  unsupported: z.number().int().nonnegative().optional(),
});

/**
 * `looseObject`, and `reason` nullable, for two reasons both found by recording
 * the live corpus rather than by reasoning about it.
 *
 * Day 007 sends `reason: null` on some emitted hypotheses — Tessellate's first
 * one, as it happens — and a plain `z.string().optional()` rejected it. A `null`
 * where a string was optional is additive noise, not a broken contract, and
 * tolerant read means accepting it.
 *
 * `looseObject` because this value is **forwarded** into a box rather than
 * consumed. A stripping schema validates fine and then silently deletes
 * `links`, `citations` and `sentence` from what the caller receives — turning
 * tolerant read into lossy read. Unknown keys are ignored for *validation* and
 * preserved in the payload.
 */
const hypothesisSchema = z.looseObject({
  id: z.string().min(1),
  verdict: z.string().optional(),
  sentence: z.string().optional(),
  reason: z.string().nullish(),
});

const whyNowBoundarySchema = z.object({
  companyId: z.string().min(1),
  sellerId: z.string().min(1),
  asOf: z.string().min(1),
  emitted: z.array(hypothesisSchema),
  counts: countsSchema,
});

export type WhyNowParsed = z.infer<typeof whyNowBoundarySchema>;

export const whyNowBindingSchema = z.object({
  companyId: z.string().min(1),
  sellerId: z.string().min(1),
});

export type WhyNowBinding = z.infer<typeof whyNowBindingSchema>;

const CONTRIBUTES = ["hypotheses", "hypothesis_counts", "seller"] as const;

export const whyNow: Capability<WhyNowBinding, WhyNowParsed> = {
  id: "why_now",
  upstream: "why_now",
  tier: 1,
  dependsOn: [],
  contributes: CONTRIBUTES,
  bindingSchema: whyNowBindingSchema,
  buildRequest: (binding, context) => ({
    path: "/api/hypotheses",
    body: { companyId: binding.companyId, sellerId: binding.sellerId, asOf: context.as_of },
  }),
  // Day 007's verdicts are seller-dependent, so the key names both halves — the
  // same company asked as a different seller is a different question.
  keyFor: (binding) => `${binding.companyId}:${binding.sellerId}`,
  boundarySchema: whyNowBoundarySchema,
  toFields: (parsed, upstreamKey): FieldMap => ({
    hypotheses: hypothesesField(parsed, upstreamKey),
    hypothesis_counts: resolved("why_now", parsed.counts, upstreamKey, parsed.asOf),
    seller: resolved("why_now", parsed.sellerId, upstreamKey, parsed.asOf),
  }),
};

function hypothesesField(parsed: WhyNowParsed, upstreamKey: string): Field<unknown> {
  if (parsed.emitted.length > 0) {
    return resolved("why_now", parsed.emitted, upstreamKey, parsed.asOf);
  }

  const considered =
    (parsed.counts.blocked ?? 0) +
    (parsed.counts.defeated ?? 0) +
    (parsed.counts.stale ?? 0) +
    (parsed.counts.unsupported ?? 0);

  return considered > 0
    ? absent("why_now", upstreamKey) // Reasoned about, and nothing survived.
    : unknown("why_now", upstreamKey); // Nothing to reason about.
}
